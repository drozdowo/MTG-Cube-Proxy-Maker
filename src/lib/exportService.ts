import type { LayoutPage, LayoutPages, ExportOptions } from '@/lib/types'
import { pageService } from '@/lib/pageService'
import { emitUpscaleProgress } from '@/lib/progress'
import { isSdAvailable, upscaleWithSd } from '@/lib/sd'
import {
  createBlankCanvasPage,
  createCardSlot,
  addSlotBackground,
  placeCardCenteredIntoSlot,
  drawCutGuidelines,
  type CanvasPage,
} from '@/lib/exportUtils'
import { PDFDocument } from 'pdf-lib'

// Public API compatible with previous export.ts, implemented via exportUtils helpers

export async function exportToPdf(pages: LayoutPages, options: ExportOptions): Promise<Blob> {
  const list = getPagesFromServiceOrArg(pages)

  if (options.upscaleWithSD) {
    const available = await isSdAvailable()
    if (!available) {
      alert('Stable Diffusion (Automatic1111) not detected at http://127.0.0.1:7860. Disable "Upscale with SD?" or start SD with --api.')
      // Continue without SD instead of aborting the whole export
    } else {
      await maybeUpscalePages(list.map(r => r.page), options)
    }
  }

  // Create a PDF with one page per rendered layout canvas
  const pdf = await PDFDocument.create()
  const { wIn, hIn } = paperSizeInches(options.paper, options.orientation)
  const pageWidthPts = wIn * 72
  const pageHeightPts = hIn * 72

  for (const { page } of list) {
    const canvas = await renderLayoutPageToCanvas(page, options)
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), 'image/png')
    )
    const buffer = new Uint8Array(await blob.arrayBuffer())
    const image = await pdf.embedPng(buffer)
    const pdfPage = pdf.addPage([pageWidthPts, pageHeightPts])
    // Draw the image to fill the page exactly
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: pageWidthPts,
      height: pageHeightPts,
    })
  }

  const bytes = await pdf.save()
  const out = new Blob([bytes as any], { type: 'application/pdf' })
  triggerDownload(out, `mtgpm-${Date.now()}.pdf`)
  return out
}

export async function exportToPngs(pages: LayoutPages, options: ExportOptions): Promise<Blob[]> {
  const list = getPagesFromServiceOrArg(pages)

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
    const blob = await renderLayoutPageToPng(page, options)
    blobs.push(blob)
    triggerDownload(blob, `mtgpm-page-${idx}-${role}.png`)
  }
  return blobs
}

export async function generatePngBlobs(pages: LayoutPages, options: ExportOptions): Promise<Blob[]> {
  const list = getPagesFromServiceOrArg(pages).map(r => r.page)

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
    const blob = await renderLayoutPageToPng(page, options)
    blobs.push(blob)
  }
  return blobs
}

export async function printPages(pages: LayoutPages, options: ExportOptions): Promise<void> {
  // Render each page to a PNG data URL using the same canvas pipeline, then print.
  const list = getPagesFromServiceOrArg(pages).map(r => r.page)

  if (options.upscaleWithSD) {
    const available = await isSdAvailable()
    if (!available) {
      alert('Stable Diffusion (Automatic1111) not detected at http://127.0.0.1:7860. Disable "Upscale with SD?" or start SD with --api.')
      return
    }
    await maybeUpscalePages(list, options)
  }

  const pageDataUrls: string[] = []
  for (const layout of list) {
    const pageCanvas = await renderLayoutPageToCanvas(layout, options)
    const dataUrl = pageCanvas.toDataURL('image/png')
    pageDataUrls.push(dataUrl)
  }

  const { wIn, hIn } = paperSizeInches(options.paper, options.orientation)
  const win = window.open('', '_blank')
  if (!win) throw new Error('Popup blocked: allow popups to print')
  const imgsHtml = pageDataUrls
    .map((src) => `<div class="page"><img src="${src}" alt="page" /></div>`) // Each image is full-page
    .join('\n')
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Print — MTGPM</title>
    <style>
      @page { size: ${wIn}in ${hIn}in; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { width: ${wIn}in; height: ${hIn}in; page-break-after: always; break-after: page; display: flex; align-items: center; justify-content: center; }
      .page:last-child { page-break-after: auto; break-after: auto; }
      .page img { width: ${wIn}in; height: ${hIn}in; object-fit: contain; display: block; }
    </style>
  </head>
  <body>
    ${imgsHtml}
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
        whenImagesReady(function(){ setTimeout(function(){ window.focus(); window.print(); }, 50); });
      })();
    </script>
  </body>
</html>`
  win.document.open()
  win.document.write(html)
}

// --- Internal helpers ---

const COLS = 3
const ROWS = 3

function paperSizeInches(paper: ExportOptions['paper'], orientation: ExportOptions['orientation']) {
  const A4_IN = { w: 210 / 25.4, h: 297 / 25.4 }
  const LETTER_IN = { w: 8.5, h: 11 }
  const base = paper === 'A4' ? A4_IN : LETTER_IN
  const wIn = orientation === 'portrait' ? base.w : base.h
  const hIn = orientation === 'portrait' ? base.h : base.w
  return { wIn, hIn }
}

function getPagesFromServiceOrArg(pages: LayoutPages) {
  const records = pageService.getAll()
  const useService = records.length === pages.length && records.length > 0
  const list: Array<{ idx: number; role: 'front' | 'back'; page: LayoutPage }> = []
  if (useService) {
    const rebuilt = pageService.toLayoutPages()
    rebuilt.forEach((p, i) => list.push({ idx: i + 1, role: p.role, page: p }))
  } else {
    pages.forEach((p, i) => list.push({ idx: i + 1, role: p.role, page: p }))
  }
  return list
}

async function renderLayoutPageToCanvas(layout: LayoutPage, options: ExportOptions): Promise<HTMLCanvasElement> {
  // Create a fresh page canvas
  const page: CanvasPage = createBlankCanvasPage(options, '#ffffff')

  // Draw the page's images in reading order (1..9)
  const cells = layout.images.slice(0, COLS * ROWS)
  for (let i = 0; i < cells.length; i++) {
    const pos = i + 1 // positions 1..9
    const slot = createCardSlot(page, pos, options.bleed > 0)
    const url = cells[i].url
    await placeCardCenteredIntoSlot(page, slot, url)
    if (options.drawCutMargins) {
      drawCutGuidelines(page, slot)
    }
  }
  return page.canvas
}

async function renderLayoutPageToPng(layout: LayoutPage, options: ExportOptions): Promise<Blob> {
  const canvas = await renderLayoutPageToCanvas(layout, options)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), 'image/png')
  })
  return blob
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

// --- SD upscaling integration (progress + caching) ---
async function maybeUpscalePages(pages: LayoutPage[], _options: ExportOptions): Promise<void> {
  // Identify default back URL heuristic from pageService (e.g., bundled cardback.jpg)
  let defaultBackUrl: string | null = null
  const all = pageService.getAll()
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

  const cache = new Map<string, string>() // original -> upscaled data URL
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
    for (const img of page.images) {
      const url = img.url
      if (!url) continue
      if (page.role === 'back') {
        if (defaultBackUrl && url === defaultBackUrl) continue
        if (/cardback\.jpg/i.test(url)) continue
      }
      if (cache.has(url)) {
        img.url = cache.get(url)!
        continue
      }
      const res = await upscaleWithSd(url, { denoiseStrength: 0.12 })
      if (res.ok && res.dataUrl) {
        cache.set(url, res.dataUrl)
        img.url = res.dataUrl
      }
      current++
      emitUpscaleProgress({ current, total, done: current >= total })
    }
  }
  emitUpscaleProgress({ current: total, total, done: true })
}
