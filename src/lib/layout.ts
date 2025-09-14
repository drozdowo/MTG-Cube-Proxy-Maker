import type { CardImage, LayoutPages } from '@/lib/types'
import { ensureCorsSafe } from '@/lib/image'

type Options = {
  dpi: number
  paper: 'A4' | 'Letter'
  bleed: number
  margin: number
  orientation: 'portrait' | 'landscape'
  alignmentOffsetX: number
  alignmentOffsetY: number
  defaultBack?: string | null
}

export async function buildLayout(images: CardImage[], opts: Options): Promise<LayoutPages> {
  // 3x3 grid; placeholder coordinates; preview uses only the image URLs
  const perPage = 9
  // 1x1 transparent GIF for empty slots on back pages to preserve grid positions
  const EMPTY_SLOT_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
  const pages: LayoutPages = []
  for (let i = 0; i < images.length; i += perPage) {
    const slice = images.slice(i, i + perPage)
    const front = {
      id: `front-${i / perPage + 1}`,
      role: 'front' as const,
      images: slice.map((c) => ({ url: c.frontUrl, x: 0, y: 0, w: 0, h: 0, name: c.name })),
    }
    // Back sheet: reverse each row (3 columns) but keep row order to align with duplex printing
    const cols = 3
    const rows = Math.ceil(slice.length / cols)
    const backImages: { url: string; x: number; y: number; w: number; h: number; name?: string }[] = []
    for (let r = 0; r < rows; r++) {
      const start = r * cols
      const row = slice.slice(start, start + cols)
      // Pad incomplete rows to 3 with nulls so reversal preserves empty slots
      const paddedRow: Array<CardImage | null> = row.concat(Array(Math.max(0, cols - row.length)).fill(null))
      const reversedRow = paddedRow.slice().reverse()
      for (const c of reversedRow) {
        if (c === null) {
          backImages.push({ url: EMPTY_SLOT_URL, x: 0, y: 0, w: 0, h: 0 })
        } else {
          backImages.push({ url: ensureCorsSafe(c.backUrl || opts.defaultBack || c.frontUrl), x: 0, y: 0, w: 0, h: 0, name: c.name })
        }
      }
    }
    const back = {
      id: `back-${i / perPage + 1}`,
      role: 'back' as const,
      images: backImages,
    }
    pages.push(front, back)
  }
  return pages
}
