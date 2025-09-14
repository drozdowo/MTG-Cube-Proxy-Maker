import type { LayoutImage } from '@/lib/types'
import { ensureCorsSafe } from '@/lib/image'

type Props = {
  image: LayoutImage
  index?: number
  onClick?: () => void
}

export function CardFront({ image, index, onClick }: Props) {
  const src = ensureCorsSafe(image.url)
  return (
    <img
      src={src}
      alt={image.name ?? `Card ${index ?? ''}`}
      className="w-full bg-gray-50 cursor-pointer"
      onClick={onClick}
    />
  )
}

export default CardFront
