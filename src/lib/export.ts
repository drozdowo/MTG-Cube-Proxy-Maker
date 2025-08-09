import type { LayoutPages, ExportOptions } from '@/lib/types'

export async function exportToPdf(pages: LayoutPages, options: ExportOptions): Promise<Blob> {
  // Placeholder implementation: export a simple text Blob listing pages
  const content = `MTGPM PDF\nPages: ${pages.length}\nOptions: ${JSON.stringify(options)}`
  const blob = new Blob([content], { type: 'application/pdf' })
  triggerDownload(blob, `mtgpm-${Date.now()}.pdf`)
  return blob
}

export async function exportToPngs(pages: LayoutPages, _options: ExportOptions): Promise<Blob[]> {
  // Placeholder: export a JSON as PNG mimetype
  const blobs = pages.map((p, i) => new Blob([JSON.stringify(p)], { type: 'image/png' }))
  blobs.forEach((b, i) => triggerDownload(b, `mtgpm-page-${i + 1}.png`))
  return blobs
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
