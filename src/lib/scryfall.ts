import type { CardImage, ParsedItem } from '@/lib/types'
import { scryfallService } from '@/lib/scryfall/service'

// Backwards-compatible wrapper; use the new scryfall service under lib/scryfall
export async function scryfallFetch(items: ParsedItem[]): Promise<CardImage[]> {
  return scryfallService(items)
}
