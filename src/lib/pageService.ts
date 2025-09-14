import type { LayoutPage, LayoutPages, CardImage } from '@/lib/types'

export type PageSide = 'front' | 'back'

// Keep minimal info needed to rebuild layout and preserve UI context
export type PageSlot = { url: string; name?: string; card: CardImage | null }

export type PageRecord = {
  pageNumber: number // 1-based sheet number
  side: PageSide
  slots: PageSlot[] // up to 9 entries mapping to grid positions
}

export class PageService {
  private pages: PageRecord[] = []

  clear(): void {
    this.pages = []
  }

  /** Populate the service from a LayoutPages array.
   * Optionally provide CardImage[] to associate each slot with its originating card.
   * Card lookup is performed by matching image URLs (frontUrl and backUrl when present).
   */
  setFromLayout(layout: LayoutPages, cards?: CardImage[]): void {
    // Build URL -> card map if cards provided
    const urlToCard = new Map<string, CardImage>()
    if (cards && cards.length) {
      for (const c of cards) {
        if (c.frontUrl) urlToCard.set(c.frontUrl, c)
        if (c.backUrl) urlToCard.set(c.backUrl, c)
      }
    }

    const records: PageRecord[] = []
    for (let i = 0; i < layout.length; i++) {
      const lp = layout[i]
      const pageNumber = Math.floor(i / 2) + 1 // front/back pairs per sheet
      const side: PageSide = lp.role
      const slots = (lp.images || [])
        .slice(0, 9)
        .map(img => ({
          url: img.url,
          name: img.name, // preserve provided name for UI (picker, tooltips)
          card: urlToCard.get(img.url) || null,
        }))
      records.push({ pageNumber, side, slots })
    }
    this.pages = records
  }

  /** Get a shallow copy of all page records in order. */
  getAll(): PageRecord[] {
    return this.pages.slice()
  }

  /** Get a specific side of a sheet by number. */
  get(pageNumber: number, side: PageSide): PageRecord | undefined {
    return this.pages.find(p => p.pageNumber === pageNumber && p.side === side)
  }

  /**
   * Get a specific card image URL by sheet and position.
   * - pageNumber: 1-based sheet number
   * - cardNumber: 1-9 in reading order (left-to-right, top-to-bottom)
   * - side: 'front' | 'back' (defaults to 'front')
   * Returns the image URL or undefined if out of range/not found.
   */
  getCard(pageNumber: number, cardNumber: number, side: PageSide = 'front'): CardImage | undefined {
    if (!Number.isInteger(cardNumber) || cardNumber < 1 || cardNumber > 9) return undefined
    const rec = this.get(pageNumber, side)
    if (!rec) return undefined
    const idx = cardNumber - 1
    return rec.slots[idx]?.card || undefined
  }

  /** Get the image URL used for a given sheet/position/side (preserves default back if used). */
  getCardUrl(pageNumber: number, cardNumber: number, side: PageSide = 'front'): string | undefined {
    if (!Number.isInteger(cardNumber) || cardNumber < 1 || cardNumber > 9) return undefined
    const rec = this.get(pageNumber, side)
    if (!rec) return undefined
    const idx = cardNumber - 1
    return rec.slots[idx]?.url
  }

  /** Convert stored records back into LayoutPages shape if needed. */
  toLayoutPages(): LayoutPages {
    const out: LayoutPages = []
    for (const rec of this.pages) {
      const id = `${rec.side}-${rec.pageNumber}`
  // Round-trip the name so UI retains card context after edits
  const images = rec.slots.map(s => ({ url: s.url, x: 0, y: 0, w: 0, h: 0, name: s.name }))
      const page: LayoutPage = { id, role: rec.side, images }
      out.push(page)
    }
    return out
  }

  /** Replace the front image URL for a given sheet and slot (1-9). */
  replaceFront(pageNumber: number, cardNumber: number, newUrl: string): boolean {
    if (!Number.isInteger(cardNumber) || cardNumber < 1 || cardNumber > 9) return false
    const front = this.get(pageNumber, 'front')
    if (!front) return false
    const idx = cardNumber - 1
    if (!front.slots[idx]) return false
  // Update only the URL; preserve the slot name so the UI continues to know the card
  front.slots[idx].url = newUrl
    return true
  }
}

export const pageService = new PageService()
