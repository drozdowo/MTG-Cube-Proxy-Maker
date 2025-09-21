import { ensureCorsSafe } from '@/lib/image'
import type { LayoutImage } from '@/lib/types'

type Props = {
  image: LayoutImage
  index?: number
  bleed?: number
}

// Preview-only card back renderer with fixed MTG card aspect ratio.
// Uses object-cover to fill the bleed area while preserving aspect ratio.
export function CardBack({ image, index, bleed = 1 }: Props) {
  const src = ensureCorsSafe(image.url)
  const alt = image.name ?? `Back ${index ?? ''}`
  const bleedPct = Math.max(0, bleed) / 63 * 100
  const hasBleed = bleedPct > 0
  return (
    <div className={`relative w-full aspect-[63/88] overflow-hidden ${hasBleed ? 'bg-black' : 'bg-transparent'}`} style={{ padding: hasBleed ? `${bleedPct}%` : undefined }}>
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />
    </div>
  )
}

export default CardBack
