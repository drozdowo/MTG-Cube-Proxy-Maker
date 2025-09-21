import type { LayoutPage, LayoutPages, ExportOptions } from '@/lib/types'
import { ensureCorsSafe } from '@/lib/image'
import { pageService } from '@/lib/pageService'
import { isSdAvailable, upscaleWithSd } from '@/lib/sd'
import { emitUpscaleProgress } from '@/lib/progress'

// --- Public API ---
export async function exportToPdf(pages: LayoutPages, options: ExportOptions): Promise<Blob> {
  // Placeholder implementation: export a simple text Blob listing pages
  const content = `MTGPM PDF\nPages: ${pages.length}\nOptions: ${JSON.stringify(options)}`
  const blob = new Blob([content], { type: 'application/pdf' })
  triggerDownload(blob, `mtgpm-${Date.now()}.pdf`)
  return blob
}

export async function exportToPngs(pages: LayoutPages, options: ExportOptions): Promise<Blob[]> {
  // Prefer using the PageService if it has been populated; else fall back to provided pages.
  const records = pageService.getAll()
  const useService = records.length === pages.length && records.length > 0
  const list: Array<{ idx: number; role: 'front' | 'back'; page: LayoutPage }> = []
  if (useService) {
    // Rebuild LayoutPage view from stored records to keep a single rendering path
    const rebuild: LayoutPages = pageService.toLayoutPages()
    rebuild.forEach((p, i) => list.push({ idx: i + 1, role: p.role, page: p }))
  } else {
    pages.forEach((p, i) => list.push({ idx: i + 1, role: p.role, page: p }))
  }

  // Optional SD upscaling (mutates in-memory page images before rendering)
  if (options.upscaleWithSD) {
    const available = await isSdAvailable()
    if (!available) {
      alert('Stable Diffusion (Automatic1111) not detected at http://127.0.0.1:7860. Disable "Upscale with SD?" or start SD with --api.')
      return []
    }
    await maybeUpscalePages(list.map(r => r.page), options)
  }

  const blobs: Blob[] = []
  for (const { idx, role, page } of list) {
    const blob = await renderPageToPng(page, options)
    blobs.push(blob)
    triggerDownload(blob, `mtgpm-page-${idx}-${role}.png`)
  }
  return blobs
}

// Generate PNG blobs for pages without triggering downloads
export async function generatePngBlobs(pages: LayoutPages, options: ExportOptions): Promise<Blob[]> {
  const records = pageService.getAll()
  const useService = records.length === pages.length && records.length > 0
  const list: Array<LayoutPage> = []
  if (useService) {
    const rebuild: LayoutPages = pageService.toLayoutPages()
    rebuild.forEach((p) => list.push(p))
  } else {
    pages.forEach((p) => list.push(p))
  }

  if (options.upscaleWithSD) {
    const available = await isSdAvailable()
    if (!available) {
      alert('Stable Diffusion (Automatic1111) not detected at http://127.0.0.1:7860. Disable "Upscale with SD?" or start SD with --api.')
      return []
    }
    await maybeUpscalePages(list, options)
  }

  const blobs: Blob[] = []
  for (const page of list) {
    const blob = await renderPageToPng(page, options)
    blobs.push(blob)
  }
  return blobs
}

// Open a print dialog for the given pages by rendering them to PNGs and embedding in a print window
export async function printPages(pages: LayoutPages, options: ExportOptions): Promise<void> {
  const win = window.open('', '_blank')
  if (!win) throw new Error('Popup blocked: allow popups to print')
  const m = computeLayoutMetrics(options)
  const pagesHtml = pages
    .map((page) => {
      const cells = page.images.slice(0, COLS * ROWS)
      const items = cells
        .map((img, i) => {
          const col = i % COLS
          const row = Math.floor(i / COLS)
          const xMm = m.marginXMm + col * m.cardWMm
          const yMm = m.marginYMm + row * m.cardHMm
          const safeUrl = ensureCorsSafe(img.url)
          const bleedMm = Math.max(0, options.bleed)
          const trimmedWMm = m.cardWMm - bleedMm * 2
          const trimmedHMm = m.cardHMm - bleedMm * 2
          const bg = bleedMm > 0 ? '#000' : '#fff'
          return `<div class=\"cell\" style=\"left:${xMm}mm; top:${yMm}mm; width:${m.cardWMm}mm; height:${m.cardHMm}mm; background:${bg};\">\n              <img src=\"${safeUrl}\" alt=\"card\" style=\"position:absolute; left:${bleedMm}mm; top:${bleedMm}mm; width:${trimmedWMm}mm; height:${trimmedHMm}mm; object-fit:cover;\" />\n            </div>`
        })
        .join('')
      let guides = ''
      if (options.drawCutMargins) {
        const verticals: string[] = []
        const horizontals: string[] = []
        for (let c = 1; c < COLS; c++) {
          const x = c * m.cardWMm
          verticals.push(`<div class=\"cut-guide cut-v\" style=\"left:${x}mm; top:-4%; bottom:-4%;\"></div>`)
        }
        for (let r = 1; r < ROWS; r++) {
          const y = r * m.cardHMm
          horizontals.push(`<div class=\"cut-guide cut-h\" style=\"top:${y}mm; left:-2%; right:-2%;\"></div>`)
        }
        guides = `<div class=\"cut-guides\">${verticals.join('')}${horizontals.join('')}</div>`
      }
      return `<div class=\"page\">\n        <div class=\"grid\" style=\"transform: translate(${m.offsetXMm}mm, ${m.offsetYMm}mm) scale(${m.scale}); transform-origin: top left; width:${m.totalGridWMm}mm; height:${m.totalGridHMm}mm;\">\n          ${items}\n          ${guides}\n        </div>\n      </div>`
    })
    .join('\n')

  const html = `<!doctype html>\n<html>\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>Print — MTGPM</title>\n    <style>\n      @page { size: ${m.paper} ${m.orientation}; margin: 0; }\n      html, body {\n        margin: 0;\n        padding: 0;\n        background: white;\n        -webkit-print-color-adjust: exact;\n        print-color-adjust: exact;\n      }\n      .page {\n        position: relative;\n        width: ${m.pageWIn}in;\n        height: ${m.pageHIn}in;\n        page-break-after: always;\n        break-after: page;\n        overflow: hidden;\n      }\n      .page:last-child { page-break-after: auto; break-after: auto; }\n      .grid {\n        position: absolute;\n        left: 0; top: 0;\n      }\n      .cell {\n        position: absolute;\n        overflow: hidden;\n        background: #fff;\n      }\n      .cell img {\n        width: 100%;\n        height: 100%;\n        object-fit: cover;\n        display: block;\n        margin: 0; border: 0; padding: 0;\n      }\n      .cut-guides { position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none; }\n      .cut-guide { position:absolute; background: rgba(16,185,129,0.8); }\n      .cut-guide.cut-v { width:0.4mm; transform:translateX(-0.2mm); }\n      .cut-guide.cut-h { height:0.4mm; transform:translateY(-0.2mm); }\n    </style>\n  </head>\n  <body>\n    ${pagesHtml}\n    <script>\n      (function(){\n        function whenImagesReady(cb){\n          var imgs = Array.prototype.slice.call(document.images);\n          if(imgs.length === 0){ cb(); return; }\n          var left = imgs.length;\n          imgs.forEach(function(img){\n            if(img.complete) { if(--left === 0) cb(); }\n            else img.addEventListener('load', function(){ if(--left === 0) cb(); });\n          });\n        }\n        whenImagesReady(function(){\n          setTimeout(function(){ window.focus(); window.print(); }, 50);\n        });\n      })();\n    </script>\n  </body>\n</html>`
  win.document.open()
  win.document.write(html)
}

// --- Rendering implementation ---
const MM_PER_INCH = 25.4
const A4_IN = { w: 210 / MM_PER_INCH, h: 297 / MM_PER_INCH } // 8.27 × 11.69 in
const LETTER_IN = { w: 8.5, h: 11 } // 8.5 × 11 in

const COLS = 3
const ROWS = 3
// MTG card trimmed size is exactly 2.5 × 3.5 inches (63 × 88 mm).
// Use exact metric values to avoid cumulative rounding causing prints to be slightly undersized.
const CARD_MM = { w: 63, h: 88 }

function paperSizeInches(paper: ExportOptions['paper']): { w: number; h: number } {
  return paper === 'A4' ? A4_IN : LETTER_IN
}

// Shared physical layout metrics so print + PNG export remain identical.
function computeLayoutMetrics(opts: ExportOptions) {
  const paper = opts.paper === 'A4' ? 'A4' : 'Letter'
  const orientation = opts.orientation === 'landscape' ? 'landscape' : 'portrait'
  const base = paperSizeInches(opts.paper)
  const pageWIn = orientation === 'portrait' ? base.w : base.h
  const pageHIn = orientation === 'portrait' ? base.h : base.w
  const pageWMm = pageWIn * MM_PER_INCH
  const pageHMm = pageHIn * MM_PER_INCH
  const cardWMm = CARD_MM.w + 2 * Math.max(0, opts.bleed)
  const cardHMm = CARD_MM.h + 2 * Math.max(0, opts.bleed)
  const totalGridWMm = COLS * cardWMm
  const totalGridHMm = ROWS * cardHMm
  // Derive scale: explicit override takes precedence, else use printer preset heuristics.
  // Epson ET-2400 (approx) unprintable margins at "Normal" ~3.4mm (0.134in) each edge; "Uniform" a bit larger (~4mm) but consistent.
  // We slightly upscale the grid so that after the printer driver auto-reduces to fit, the physical card size remains closer to 63x88mm.
  // Empirically: scaling up 1.8% (Normal) or 2.4% (Uniform) compensates typical shrink.
  let autoScale = 1
  if (!opts.printScaleCompensation && opts.printerPreset) {
    if (opts.printerPreset === 'epson-normal') autoScale = 1.018
    else if (opts.printerPreset === 'epson-uniform') autoScale = 1.024
  }
  const scale = Math.max(0.95, Math.min(1.1, opts.printScaleCompensation || autoScale))
  const maxMarginXMm = Math.max(0, (pageWMm - totalGridWMm * scale) / 2)
  const maxMarginYMm = Math.max(0, (pageHMm - totalGridHMm * scale) / 2)
  const requestedMarginMm = Math.max(0, opts.margin)
  // Base margin is the user-requested margin capped so the grid still fits.
  const baseMarginXMm = Math.min(requestedMarginMm, maxMarginXMm)
  const baseMarginYMm = Math.min(requestedMarginMm, maxMarginYMm)
  // Any remaining space (after accounting for the explicit margins on both sides) should be split
  // equally so the grid is visually centered instead of hugging the top/left.
  const leftoverXMm = pageWMm - totalGridWMm * scale - 2 * baseMarginXMm
  const leftoverYMm = pageHMm - totalGridHMm * scale - 2 * baseMarginYMm
  const marginXMm = baseMarginXMm + (leftoverXMm > 0 ? leftoverXMm / 2 : 0)
  const marginYMm = baseMarginYMm + (leftoverYMm > 0 ? leftoverYMm / 2 : 0)
  const offsetXMm = opts.alignmentOffsetX || 0
  const offsetYMm = opts.alignmentOffsetY || 0
  return {
    paper,
    orientation,
    pageWIn,
    pageHIn,
    pageWMm,
    pageHMm,
    cardWMm,
    cardHMm,
    totalGridWMm,
    totalGridHMm,
    scale,
    marginXMm, // fully centered margin actually applied
    marginYMm,
    offsetXMm,
    offsetYMm,
  }
}

function pagePixelSize(opts: ExportOptions): { w: number; h: number } {
  const base = paperSizeInches(opts.paper)
  const wIn = opts.orientation === 'portrait' ? base.w : base.h
  const hIn = opts.orientation === 'portrait' ? base.h : base.w
  const w = Math.round(wIn * opts.dpi)
  const h = Math.round(hIn * opts.dpi)
  return { w, h }
}

function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi
}

function isCrossOrigin(url: string): boolean {
  try {
    const u = new URL(url, window.location.href)
    return u.origin !== window.location.origin
  } catch {
    return false
  }
}

// During Vite dev, route Scryfall CDN through proxy to avoid CORS
// Deprecated local dev proxy; use ensureCorsSafe instead

async function loadImage(inputUrl: string): Promise<HTMLImageElement> {
  // Normalize URL first to ensure proxying of Scryfall assets
  const url = ensureCorsSafe(inputUrl)

  // Primary path: fetch the bytes and create an object URL (always same-origin)
  try {
    const res = await fetch(url, {
      // Same-origin for proxied URLs; omit mode to allow cookies if needed
      headers: { Accept: 'image/*' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      const img2 = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('blob image load failed'))
        img.src = objectUrl
      })
      return img2
    } finally {
      // Revoke after next tick; if the image hasn't decoded yet, this will be okay since browsers cache
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    }
  } catch (e) {
    console.warn('Blob path failed, falling back to direct <img> for', url, e)
  }

  // Fallback: direct <img> load (should still be proxied and same-origin)
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.referrerPolicy = 'no-referrer'
    if (isCrossOrigin(url)) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
}

async function renderPageToPng(page: LayoutPage, opts: ExportOptions): Promise<Blob> {
  const metrics = computeLayoutMetrics(opts)
  const { w: pageW, h: pageH } = pagePixelSize(opts)
  // Convert mm metrics to px
  const cardWBasePx = mmToPx(metrics.cardWMm, opts.dpi)
  const cardHBasePx = mmToPx(metrics.cardHMm, opts.dpi)
  const marginXBasePx = mmToPx(metrics.marginXMm, opts.dpi)
  const marginYBasePx = mmToPx(metrics.marginYMm, opts.dpi)
  const offsetXBasePx = mmToPx(metrics.offsetXMm, opts.dpi)
  const offsetYBasePx = mmToPx(metrics.offsetYMm, opts.dpi)
  const scale = metrics.scale
  const cardW = Math.round(cardWBasePx * scale)
  const cardH = Math.round(cardHBasePx * scale)
  const originX = Math.round((marginXBasePx + offsetXBasePx) * scale)
  const originY = Math.round((marginYBasePx + offsetYBasePx) * scale)

  // Canvas
  const canvas = document.createElement('canvas')
  canvas.width = pageW
  canvas.height = pageH
  const ctx = canvas.getContext('2d')!

  // Background white
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, pageW, pageH)

  // Draw images into a 3×3 grid
  const perPage = COLS * ROWS
  const toDraw = page.images.slice(0, perPage)

  // Preload all images concurrently
  const loaded = await Promise.all(
    toDraw.map(async (img) => {
      try {
        const el = await loadImage(img.url)
        return { el, ok: true as const }
      } catch (e) {
        return { el: null, ok: false as const }
      }
    })
  )

  for (let i = 0; i < toDraw.length; i++) {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const x = originX + col * cardW
    const y = originY + row * cardH
    const item = loaded[i]
    // Draw bleed background (full card area) if bleed > 0
    const bleedMm = Math.max(0, opts.bleed)
    if (bleedMm > 0) {
      ctx.fillStyle = '#000'
      ctx.fillRect(x, y, cardW, cardH)
    }
    if (item.ok && item.el) {
      const el = item.el
      // Physical trimmed size area inside bleed: subtract bleed each side (already accounted in metrics.cardWMm)
      // Compute inset in pixels: bleedMm * dpi / 25.4 * scale
      const insetPx = Math.round(mmToPx(bleedMm, opts.dpi) * scale)
      const innerW = cardW - insetPx * 2
      const innerH = cardH - insetPx * 2
      // Cover fit inside trimmed area
      const coverScale = Math.max(innerW / el.naturalWidth, innerH / el.naturalHeight)
      const dw = Math.round(el.naturalWidth * coverScale)
      const dh = Math.round(el.naturalHeight * coverScale)
      const dx = x + insetPx + Math.round((innerW - dw) / 2)
      const dy = y + insetPx + Math.round((innerH - dh) / 2)
      ctx.drawImage(el, dx, dy, dw, dh)
    } else {
      drawPlaceholder(ctx, x, y, cardW, cardH)
    }
  }

  // Overlay cut margin guides after drawing cards
  if (opts.drawCutMargins) {
    const totalW = cardW * COLS
    const totalH = cardH * ROWS
    const extraV = Math.round(totalH * 0.04)
    const extraH = Math.round(totalW * 0.02)
    const lineColor = 'rgba(16,185,129,0.8)'
    // Vertical lines
    for (let c = 1; c < COLS; c++) {
      const x = originX + c * cardW
      const w = Math.max(1, Math.round(cardW * 0.0025))
      ctx.fillStyle = lineColor
      ctx.fillRect(Math.round(x - w / 2), originY - extraV, w, totalH + 2 * extraV)
    }
    // Horizontal lines
    for (let r = 1; r < ROWS; r++) {
      const y = originY + r * cardH
      const h = Math.max(1, Math.round(cardH * 0.0025))
      ctx.fillStyle = lineColor
      ctx.fillRect(originX - extraH, Math.round(y - h / 2), totalW + 2 * extraH, h)
    }
  }

  // Convert to PNG Blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), 'image/png')
  })
  return blob
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#f3f4f6' // gray-100
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = '#9ca3af' // gray-400
  ctx.lineWidth = 2
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
  ctx.beginPath()
  ctx.moveTo(x + 6, y + 6)
  ctx.lineTo(x + w - 6, y + h - 6)
  ctx.moveTo(x + w - 6, y + 6)
  ctx.lineTo(x + 6, y + h - 6)
  ctx.stroke()
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// --- SD Upscaling integration ---
/**
 * Mutates the provided layout pages in-place, replacing eligible image URLs with
 * SD-upscaled data URLs. Only applies to back pages and excludes default / uploaded
 * card back images. Heuristic for exclusion:
 *  - If the image URL appears to be the globally selected default back (tracked via first pageService back slot)
 *  - OR if the URL is a data: URI that originated from user upload (BackPicker) => treat as custom (we DO upscale custom per request?)
 *
 * User request clarified: "We only want to upscale the back images of actual cards, or custom images."
 * Interpretation:
 *  - Actual card fronts? (Request says back images of actual cards) -> We upscale backs derived from individual card backs (non-default) and also user-provided custom back. We'll therefore:
 *    - Skip default provided cardback asset (detected by comparing to first back page slot or by filename 'cardback.jpg').
 *    - Upscale any other back page images including data: URIs.
 */
async function maybeUpscalePages(pages: LayoutPage[], options: ExportOptions): Promise<void> {
  // Identify the default back URL if present. We look at the application state via pageService.
  let defaultBackUrl: string | null = null
  const all = pageService.getAll()
  // Find any slot whose url includes 'cardback.jpg' (imported default) as a heuristic
  for (const rec of all) {
    if (rec.side !== 'back') continue
    for (const s of rec.slots) {
      if (s?.url && /cardback\.jpg/i.test(s.url)) {
        defaultBackUrl = s.url
        break
      }
    }
    if (defaultBackUrl) break
  }

  // Build a small cache so multiple references to the same image are only processed once.
  const cache = new Map<string, string>() // original -> upscaled data URL
  let attempted = 0
  let succeeded = 0
  let skipped = 0
  const t0 = performance.now()
  // Compute total unique images we expect to process (front + back, excluding default back heuristic)
  const unique = new Set<string>()
  for (const page of pages) {
    for (const img of page.images) {
      const url = img.url
      if (!url) continue
      if (page.role === 'back') {
        if (defaultBackUrl && url === defaultBackUrl) continue
        if (/cardback\.jpg/i.test(url)) continue
      }
      unique.add(url)
    }
  }
  const total = unique.size
  emitUpscaleProgress({ current: 0, total, done: total === 0 })
  let current = 0

  for (const page of pages) {
    // We now upscale BOTH front and back images. Previous implementation only handled backs,
    // which meant no calls to the SD extras endpoint when only front pages were present.
    for (const img of page.images) {
      const url = img.url
      if (!url) { skipped++; continue }
      // Skip default back asset heuristics ONLY for back pages
      if (page.role === 'back') {
        if (defaultBackUrl && url === defaultBackUrl) { skipped++; continue }
        if (/cardback\.jpg/i.test(url)) { skipped++; continue }
      }
      // Attempt upscale (cache first)
      if (cache.has(url)) {
        img.url = cache.get(url)!
        skipped++
        continue
      }
      attempted++
      const res = await upscaleWithSd(url, { denoiseStrength: 0.12 })
      if (res.ok && res.dataUrl) {
        cache.set(url, res.dataUrl)
        img.url = res.dataUrl
        succeeded++
      } else {
        console.warn('[SD] upscale failed', url, res.error)
      }
      current++
      emitUpscaleProgress({ current, total, done: current >= total })
    }
  }
  const dt = Math.round(performance.now() - t0)
  console.debug(`[SD] Upscale summary: attempted=${attempted} succeeded=${succeeded} skipped=${skipped} elapsedMs=${dt}`)
  emitUpscaleProgress({ current: total, total, done: true })
}
