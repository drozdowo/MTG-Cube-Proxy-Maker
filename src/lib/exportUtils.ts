import type { ExportOptions } from '@/lib/types'
import { ensureCorsSafe } from '@/lib/image'
import { cache } from '@/lib/cache'
import { isSdAvailable, upscaleWithSd, type UpscaleOptions } from '@/lib/sd'

// Small, focused helpers to build printable canvas pages.
// Functions are intentionally independent and composable.
/**
 * Quick usage example:
 * const page = createBlankCanvasPage(opts)
 * const slot = createCardSlot(page, 1, opts.bleed > 0)
 * const maybeUpscaled = await upscaleImageWithCache(url, opts.upscaleWithSD)
 * await placeCardCenteredIntoSlot(page, slot, maybeUpscaled)
 * const blob = await new Promise<Blob>(r => page.canvas.toBlob(b => r(b!), 'image/png'))
 */

// --- Constants and unit helpers ---
const MM_PER_INCH = 25.4
const COLS = 3
const ROWS = 3
// MTG trimmed size is 63 x 88 mm; bleed is applied around this.
const CARD_MM = { w: 63, h: 88 }

const A4_IN = { w: 210 / MM_PER_INCH, h: 297 / MM_PER_INCH }
const LETTER_IN = { w: 8.5, h: 11 }

function paperSizeInches(paper: ExportOptions['paper']): { w: number; h: number } {
  return paper === 'A4' ? A4_IN : LETTER_IN
}

function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi
}

// Convert pixels back to millimeters.
// Note: include `scale` when converting values that were scaled for print compensation.
function pxToMm(px: number, dpi: number, scale = 1): number {
  return (px / (dpi * scale)) * MM_PER_INCH
}

// --- Metrics (minimal subset from export.ts for slots math) ---
export type LayoutMetrics = {
  cardWMm: number
  cardHMm: number
  marginXMm: number
  marginYMm: number
  offsetXMm: number
  offsetYMm: number
  scale: number
}

function computeLayoutMetrics(opts: ExportOptions): LayoutMetrics {
  const bleed = Math.max(0, opts.bleed)
  const cardWMm = CARD_MM.w + 2 * bleed
  const cardHMm = CARD_MM.h + 2 * bleed

  const base = paperSizeInches(opts.paper)
  const pageWIn = opts.orientation === 'portrait' ? base.w : base.h
  const pageHIn = opts.orientation === 'portrait' ? base.h : base.w
  const pageWMm = pageWIn * MM_PER_INCH
  const pageHMm = pageHIn * MM_PER_INCH

  const totalGridWMm = COLS * cardWMm
  const totalGridHMm = ROWS * cardHMm

  // Use only the explicit override (if provided); otherwise default to 1.
  const scaleOverride = opts.printScaleCompensation ?? 1
  const scale = Math.max(0.95, Math.min(1.1, scaleOverride))

  // Remove user-configured margins entirely and center the scaled grid on the page.
  // NOTE: We compute margins in mm AFTER applying `scale` to the grid size so the
  // grid remains centered for any override. Downstream callers must NOT multiply
  // these margins by `scale` again when converting to pixels.
  const marginXMm = Math.max(0, (pageWMm - totalGridWMm * scale) / 2)
  const marginYMm = Math.max(0, (pageHMm - totalGridHMm * scale) / 2)

  return {
    cardWMm,
    cardHMm,
    marginXMm,
    marginYMm,
    offsetXMm: opts.alignmentOffsetX || 0,
    offsetYMm: opts.alignmentOffsetY || 0,
    scale,
  }
}

function pagePixelSize(opts: ExportOptions): { w: number; h: number } {
  const base = paperSizeInches(opts.paper)
  const wIn = opts.orientation === 'portrait' ? base.w : base.h
  const hIn = opts.orientation === 'portrait' ? base.h : base.w
  return { w: Math.round(wIn * opts.dpi), h: Math.round(hIn * opts.dpi) }
}

// --- Public surface ---
export type CanvasPage = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  metrics: LayoutMetrics
  options: ExportOptions
  pagePx: { w: number; h: number }
}

export type SlotRect = { x: number; y: number; w: number; h: number }

/**
 * 1) Create a blank canvas page (filled background) using ExportOptions.
 */
export function createBlankCanvasPage(options: ExportOptions, background = '#ffffff'): CanvasPage {
  const metrics = computeLayoutMetrics(options)
  const pagePx = pagePixelSize(options)
  const canvas = document.createElement('canvas')
  canvas.width = pagePx.w
  canvas.height = pagePx.h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = background
  ctx.fillRect(0, 0, pagePx.w, pagePx.h)
  return { canvas, ctx, metrics, options, pagePx }
}

/**
 * 2) Create a card slot rectangle on the page at a position 1-9 (L->R, T->B).
 * Returns the slot rect in pixels. Optionally paints black background for bleed.
 */
export function createCardSlot(page: CanvasPage, position: number, addBlackBackground = false): SlotRect {
  if (!Number.isInteger(position) || position < 1 || position > 9) {
    throw new Error('position must be an integer 1..9')
  }
  const { metrics, options } = page
  const cardWpx = Math.round(mmToPx(metrics.cardWMm, options.dpi) * metrics.scale)
  const cardHpx = Math.round(mmToPx(metrics.cardHMm, options.dpi) * metrics.scale)
  // IMPORTANT: margins/offsets are absolute page distances in mm and already
  // account for the scaled grid width. Do NOT multiply by scale again here,
  // or you will double-scale the origin and effectively shrink/shift the grid.
  const originX = Math.round(mmToPx(metrics.marginXMm + metrics.offsetXMm, options.dpi))
  const originY = Math.round(mmToPx(metrics.marginYMm + metrics.offsetYMm, options.dpi))

  const idx = position - 1
  const col = idx % COLS
  const row = Math.floor(idx / COLS)
  const x = originX + col * cardWpx
  const y = originY + row * cardHpx
  const rect: SlotRect = { x, y, w: cardWpx, h: cardHpx }
  if (addBlackBackground) addSlotBackground(page, rect, '#000000')
  return rect
}

/**
 * 3) Place a card centered into a slot using cover-fit. Respects bleed by insetting.
 */
export async function placeCardCenteredIntoSlot(
  page: CanvasPage,
  slot: SlotRect,
  imageUrl: string,
): Promise<void> {
  const { ctx, options, metrics } = page
  const bleedMm = Math.max(0, options.bleed)
  const insetPx = Math.round(mmToPx(bleedMm, options.dpi) * metrics.scale)
  const inner = { x: slot.x + insetPx, y: slot.y + insetPx, w: slot.w - insetPx * 2, h: slot.h - insetPx * 2 }
  const img = await loadImage(ensureCorsSafe(imageUrl))
  // cover-fit
  const scale = Math.max(inner.w / img.naturalWidth, inner.h / img.naturalHeight)
  const dw = Math.round(img.naturalWidth * scale)
  const dh = Math.round(img.naturalHeight * scale)
  const dx = inner.x + Math.round((inner.w - dw) / 2)
  const dy = inner.y + Math.round((inner.h - dh) / 2)
  ctx.drawImage(img, dx, dy, dw, dh)
}

/**
 * 4) Optional: add a solid background to the slot (e.g., black for bleed).
 */
export function addSlotBackground(page: CanvasPage, slot: SlotRect, color = '#000000'): void {
  const { ctx } = page
  ctx.fillStyle = color
  ctx.fillRect(slot.x, slot.y, slot.w, slot.h)
}

/**
 * 4.5) Optional: Draw 1px green cut guidelines around the trimmed card border.
 * - Accounts for bleed by insetting to the trimmed edge.
 * - Each edge line extends a few pixels beyond the corner for visibility.
 */
export function drawCutGuidelines(
  page: CanvasPage,
  slot: SlotRect,
  color = '#00FF00',
  extendPx = 0,
): void {
  const { ctx, options, metrics } = page
  // Draw on the slot boundaries so adjacent slots overlap perfectly,
  // producing a single-seeming line centered in the bleed between cards.
  const x0 = slot.x
  const y0 = slot.y
  const x1 = slot.x + slot.w
  const y1 = slot.y + slot.h

  // DEBUG TEXT ON SLOT
  if (options.debugSizesOnPrint) {
    const textX = (x0 + x1) / 2
    const textY = y0 - 5
    ctx.font = '16px sans-serif'
    ctx.fillStyle = '#FF0000'
    // Slot width/height are already scaled; convert px back to mm without
    // dividing by scale again to report the actual physical size.
    const wMm = pxToMm(slot.w, options.dpi)
    const hMm = pxToMm(slot.h, options.dpi)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(`(${wMm.toFixed(2)}mm, ${hMm.toFixed(2)}mm)`, textX, textY)
  }

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()

  // For crisp 1px lines, place them on half-pixel boundaries
  // Top edge
  ctx.moveTo(x0 - extendPx, y0 + 0.5)
  ctx.lineTo(x1 + extendPx, y0 + 0.5)
  // Bottom edge
  ctx.moveTo(x0 - extendPx, y1 + 0.5)
  ctx.lineTo(x1 + extendPx, y1 + 0.5)
  // Left edge
  ctx.moveTo(x0 + 0.5, y0 - extendPx)
  ctx.lineTo(x0 + 0.5, y1 + extendPx)
  // Right edge
  ctx.moveTo(x1 + 0.5, y0 - extendPx)
  ctx.lineTo(x1 + 0.5, y1 + extendPx)

  ctx.stroke()
  ctx.restore()
}

/**
 * 5) Optional: Upscale an image via SD with caching. Returns the (maybe) upscaled URL.
 * - Uses in-memory cache; key is the original URL.
 * - If SD is not available or call fails, returns the original URL.
 */
export async function upscaleImageWithCache(
  url: string,
  enabled: boolean,
  options?: UpscaleOptions,
): Promise<string> {
  if (!enabled) return url
  const key = `sd:upscaled:${url}`
  const cached = await cache.get<string>(key)
  if (cached) return cached
  const available = await isSdAvailable(options?.baseUrl)
  if (!available) return url
  const res = await upscaleWithSd(url, options)
  if (res.ok && res.dataUrl) {
    await cache.set(key, res.dataUrl)
    return res.dataUrl
  }
  return url
}

// --- Internals ---
async function loadImage(url: string): Promise<HTMLImageElement> {
  // Try fetch->blob->objectURL for same-origin decode;
  // fall back to direct <img> if needed.
  try {
    const res = await fetch(url, { headers: { Accept: 'image/*' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('image load failed'))
        el.src = objectUrl
      })
      return img
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    }
  } catch (e) {
    // Fallback path
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.referrerPolicy = 'no-referrer'
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image load failed'))
      el.src = url
    })
  }
}
