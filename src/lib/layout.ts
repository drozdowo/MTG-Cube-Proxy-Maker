import type { CardImage, LayoutPages } from '@/lib/types'

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
  const pages: LayoutPages = []
  for (let i = 0; i < images.length; i += perPage) {
    const slice = images.slice(i, i + perPage)
    const front = {
      id: `front-${i / perPage + 1}`,
      role: 'front' as const,
      images: slice.map((c) => ({ url: c.frontUrl, x: 0, y: 0, w: 0, h: 0 })),
    }
    const back = {
      id: `back-${i / perPage + 1}`,
      role: 'back' as const,
      images: slice
        .slice()
        .reverse()
        .map((c) => ({ url: c.backUrl || opts.defaultBack || c.frontUrl, x: 0, y: 0, w: 0, h: 0 })),
    }
    pages.push(front, back)
  }
  return pages
}
