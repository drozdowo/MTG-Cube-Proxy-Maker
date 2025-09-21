import type { LayoutPages } from '@/lib/types'
import { ensureCorsSafe } from '@/lib/image'
import { CardFront } from '@/components/CardFront'
import { CardBack } from '@/components/CardBack'

type Props = {
  pages: LayoutPages | null
  onCardClick?: (pageNumber: number, cardNumber: number, cardName?: string) => void
  drawCutMargins?: boolean
  bleed?: number
}

export function Preview({ pages, onCardClick, drawCutMargins, bleed = 1 }: Props) {
  const devProxyUrl = (url: string) => ensureCorsSafe(url)
  if (!pages) {
    return <div className="text-gray-500">No pages yet. Generate to preview.</div>
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {pages.map((p) => {
        const isFront = p.role === 'front'
        return (
          <div key={p.id} className="border border-gray-300 p-2 rounded">
            <div className="mb-1.5 font-semibold">{p.id}</div>
            <div className="relative">
              <div className="grid grid-cols-3 relative">
                {p.images.map((img, i) => (
                  isFront ? (
                    <CardFront
                      key={i}
                      image={img}
                      index={i + 1}
                      bleed={bleed}
                      onClick={() => {
                        const pageNumber = Number(p.id.split('-')[1] || 1)
                        onCardClick?.(pageNumber, i + 1, img.name)
                      }}
                    />
                  ) : (
                    <CardBack key={i} image={img} index={i + 1} bleed={bleed} />
                  )
                ))}
              </div>
              {drawCutMargins && (
                <CutMarginGuides columns={3} cardCount={p.images.length} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CutMarginGuides({ columns, cardCount }: { columns: number; cardCount: number }) {
  // Guides are drawn at trimmed card boundaries; bleed is purely visual padding (black area) and does not shift guides.
  const rows = Math.ceil(cardCount / columns)
  const verticals = Array.from({ length: columns - 1 }, (_, i) => i + 1)
  const horizontals = Array.from({ length: rows - 1 }, (_, i) => i + 1)
  // Lines extend slightly outside grid: use inset negative margin via translate.
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Vertical guides */}
      {verticals.map((col) => (
        <div
          key={`v-${col}`}
          className="absolute top-[-4%] bottom-[-4%] w-px bg-emerald-500/80"
          style={{ left: `calc(${(col / columns) * 100}% - 0.5px)` }}
        />
      ))}
      {/* Horizontal guides */}
      {horizontals.map((row) => (
        <div
          key={`h-${row}`}
          className="absolute left-[-2%] right-[-2%] h-px bg-emerald-500/80"
          style={{ top: `calc(${(row / rows) * 100}% - 0.5px)` }}
        />
      ))}
    </div>
  )
}
