import type { LayoutPage, LayoutPages, ExportOptions } from '@/lib/types'
import { ensureCorsSafe } from '@/lib/image'
import { pageService } from '@/lib/pageService'

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
          return `<div class=\"cell\" style=\"left:${xMm}mm; top:${yMm}mm; width:${m.cardWMm}mm; height:${m.cardHMm}mm;\">\n              <img src=\"${safeUrl}\" alt=\"card\" />\n            </div>`
        })
        .join('')
      return `<div class=\"page\">\n        <div class=\"grid\" style=\"transform: translate(${m.offsetXMm}mm, ${m.offsetYMm}mm) scale(${m.scale}); transform-origin: top left; width:${m.totalGridWMm}mm; height:${m.totalGridHMm}mm;\">\n          ${items}\n        </div>\n      </div>`
    })
    .join('\n')

  const html = `<!doctype html>\n<html>\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>Print — MTGPM</title>\n    <style>\n      @page { size: ${m.paper} ${m.orientation}; margin: 0; }\n      html, body {\n        margin: 0;\n        padding: 0;\n        background: white;\n        -webkit-print-color-adjust: exact;\n        print-color-adjust: exact;\n      }\n      .page {\n        position: relative;\n        width: ${m.pageWIn}in;\n        height: ${m.pageHIn}in;\n        page-break-after: always;\n        break-after: page;\n        overflow: hidden;\n      }\n      .page:last-child { page-break-after: auto; break-after: auto; }\n      .grid {\n        position: absolute;\n        left: 0; top: 0;\n      }\n      .cell {\n        position: absolute;\n        overflow: hidden;\n        background: #fff;\n      }\n      .cell img {\n        width: 100%;\n        height: 100%;\n        object-fit: cover;\n        display: block;\n        margin: 0; border: 0; padding: 0;\n      }\n    </style>\n  </head>\n  <body>\n    ${pagesHtml}\n    <script>\n      (function(){\n        function whenImagesReady(cb){\n          var imgs = Array.prototype.slice.call(document.images);\n          if(imgs.length === 0){ cb(); return; }\n          var left = imgs.length;\n          imgs.forEach(function(img){\n            if(img.complete) { if(--left === 0) cb(); }\n            else img.addEventListener('load', function(){ if(--left === 0) cb(); });\n          });\n        }\n        whenImagesReady(function(){\n          setTimeout(function(){ window.focus(); window.print(); }, 50);\n        });\n      })();\n    </script>\n  </body>\n</html>`
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
  const marginXMm = Math.min(requestedMarginMm, maxMarginXMm)
  const marginYMm = Math.min(requestedMarginMm, maxMarginYMm)
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
    marginXMm,
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
    if (item.ok && item.el) {
      // Fit image to cardW×cardH while preserving aspect ratio (cover)
      const el = item.el
  const coverScale = Math.max(cardW / el.naturalWidth, cardH / el.naturalHeight)
  const dw = Math.round(el.naturalWidth * coverScale)
  const dh = Math.round(el.naturalHeight * coverScale)
  const dx = x + Math.round((cardW - dw) / 2)
  const dy = y + Math.round((cardH - dh) / 2)
  ctx.drawImage(el, dx, dy, dw, dh)
      // Optional: draw trim area
      // ctx.strokeStyle = 'rgba(0,0,0,0.06)'
      // ctx.strokeRect(x + bleedPx, y + bleedPx, cardW - 2 * bleedPx, cardH - 2 * bleedPx)
    } else {
      // Placeholder for missing image
      drawPlaceholder(ctx, x, y, cardW, cardH)
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
