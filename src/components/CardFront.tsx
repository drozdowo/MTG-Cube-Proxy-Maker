import type { LayoutImage } from '@/lib/types'
import { ensureCorsSafe } from '@/lib/image'

type Props = {
  image: LayoutImage
  index?: number
  onClick?: () => void
  bleed?: number
}

export function CardFront({ image, index, onClick, bleed = 1 }: Props) {
  const src = ensureCorsSafe(image.url)
  // Represent bleed visually by wrapping image in a black background and inward padding proportional to bleed.
  // For preview we approximate 1mm bleed as ~1.6% of card width (since card width 63mm). So px padding = bleedMm / 63 * 100%.
  const bleedPct = Math.max(0, bleed) / 63 * 100
  const hasBleed = bleedPct > 0
  const baseClasses = 'relative w-full aspect-[63/88] cursor-pointer overflow-hidden'
  const bgClass = hasBleed ? 'bg-black' : 'bg-transparent'
  return (
    <div
      className={`${baseClasses} ${bgClass}`}
      onClick={onClick}
      style={{ padding: hasBleed ? `${bleedPct}%` : undefined }}
    >
      <img
        src={src}
        alt={image.name ?? `Card ${index ?? ''}`}
        className="absolute inset-0 w-full h-full object-cover"
      />
    </div>
  )
}

export default CardFront
