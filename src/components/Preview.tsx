import type { LayoutPages } from '@/lib/types'
import { ensureCorsSafe } from '@/lib/image'
import { CardFront } from '@/components/CardFront'
import { CardBack } from '@/components/CardBack'

type Props = {
  pages: LayoutPages | null
  onCardClick?: (pageNumber: number, cardNumber: number, cardName?: string) => void
}

export function Preview({ pages, onCardClick }: Props) {
  const devProxyUrl = (url: string) => ensureCorsSafe(url)
  if (!pages) {
    return <div className="text-gray-500">No pages yet. Generate to preview.</div>
  }
  return (
  <div className="grid grid-cols-2 gap-3">
      {pages.map((p) => (
    <div key={p.id} className="border border-gray-300 p-2 rounded">
      <div className="mb-1.5 font-semibold">{p.id}</div>
      <div className="grid grid-cols-3">
            {p.images.map((img, i) => (
        p.role === 'front' ? (
          <CardFront
            key={i}
            image={img}
            index={i + 1}
            onClick={() => {
              const pageNumber = Number(p.id.split('-')[1] || 1)
              console.log('click', { pageNumber, cardNumber: i + 1, cardName: img.name })
              onCardClick?.(pageNumber, i + 1, img.name)
            }}
          />
        ) : (
          <CardBack key={i} image={img} index={i + 1} />
        )
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
