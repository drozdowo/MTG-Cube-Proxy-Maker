import { ensureCorsSafe } from '@/lib/image'
import type { LayoutImage } from '@/lib/types'

type Props = {
  image: LayoutImage
  index?: number
}

// Preview-only card back renderer with fixed MTG card aspect ratio.
// Uses object-cover to fill the bleed area while preserving aspect ratio.
export function CardBack({ image, index }: Props) {
  const src = ensureCorsSafe(image.url)
  const alt = image.name ?? `Back ${index ?? ''}`
  return (
    <div className="relative w-full aspect-[63/88] bg-gray-50">
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
