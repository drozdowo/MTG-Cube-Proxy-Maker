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
  const blobs = await generatePngBlobs(pages, options)
  const urls = blobs.map((b) => URL.createObjectURL(b))
  const win = window.open('', '_blank')
  if (!win) {
    // Cleanup if popup was blocked
    urls.forEach((u) => URL.revokeObjectURL(u))
    throw new Error('Popup blocked: allow popups to print')
  }

  // Build minimal print-friendly HTML
  const paper = options.paper === 'A4' ? 'A4' : 'Letter'
  const orientation = options.orientation === 'landscape' ? 'landscape' : 'portrait'
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Print — MTGPM</title>
    <style>
      @page { size: ${paper} ${orientation}; margin: 0; }
      html, body { margin: 0; padding: 0; background: white; }
      img.page { display: block; width: 100%; height: auto; page-break-after: always; }
      img.page:last-child { page-break-after: auto; }
    </style>
  </head>
  <body>
    ${urls.map((u) => `<img class="page" src="${u}" />`).join('\n')}
    <script>
      (function(){
        function whenImagesReady(cb){
          var imgs = Array.prototype.slice.call(document.images);
          if(imgs.length === 0){ cb(); return; }
          var left = imgs.length;
          imgs.forEach(function(img){
            if(img.complete) { if(--left === 0) cb(); }
            else img.addEventListener('load', function(){ if(--left === 0) cb(); });
          });
        }
        whenImagesReady(function(){
          setTimeout(function(){
            window.focus();
            window.print();
          }, 50);
        });
      })();
    </script>
  </body>
</html>`

  win.document.open()
  win.document.write(html)
  win.document.close()

  // Cleanup object URLs after printing and close the window
  const cleanup = () => {
    try { urls.forEach((u) => URL.revokeObjectURL(u)) } catch {}
    try { win.close() } catch {}
  }
  // Some browsers fire afterprint on the printing window, others on opener — attach both
  try { win.addEventListener('afterprint', cleanup) } catch {}
  try { window.addEventListener('afterprint', cleanup, { once: true }) } catch {}
}

// --- Rendering implementation ---
const MM_PER_INCH = 25.4
const A4_IN = { w: 210 / MM_PER_INCH, h: 297 / MM_PER_INCH } // 8.27 × 11.69 in
const LETTER_IN = { w: 8.5, h: 11 } // 8.5 × 11 in

const COLS = 3
const ROWS = 3
// MTG card trimmed size is ~63 × 88 mm. Bleed and margin values in options are treated as millimeters.
const CARD_MM = { w: 63, h: 88 }

function paperSizeInches(paper: ExportOptions['paper']): { w: number; h: number } {
  return paper === 'A4' ? A4_IN : LETTER_IN
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
  const { w: pageW, h: pageH } = pagePixelSize(opts)
  const marginPx = Math.round(mmToPx(opts.margin, opts.dpi))
  const bleedPx = Math.max(0, mmToPx(opts.bleed, opts.dpi))
  const offsetX = Math.round(mmToPx(opts.alignmentOffsetX, opts.dpi))
  const offsetY = Math.round(mmToPx(opts.alignmentOffsetY, opts.dpi))

  // Card size in pixels including bleed on all sides
  const cardW = Math.round(mmToPx(CARD_MM.w, opts.dpi) + 2 * bleedPx)
  const cardH = Math.round(mmToPx(CARD_MM.h, opts.dpi) + 2 * bleedPx)

  // Compute the drawable grid origin
  const originX = marginPx + offsetX
  const originY = marginPx + offsetY

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
      const scale = Math.max(cardW / el.naturalWidth, cardH / el.naturalHeight)
      const dw = Math.round(el.naturalWidth * scale)
      const dh = Math.round(el.naturalHeight * scale)
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
