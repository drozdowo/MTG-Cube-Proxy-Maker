import type { ScryfallCard } from '@/lib/scryfall/model'
import { toCorsSafeImageUrl } from '@/lib/image'

export type SearchArtResult = {
  url: string
  backUrl?: string | null
  id?: string
  set?: string
}

// Use shared helper to avoid CORS in dev/prod

function pickImages(card: any): { front?: string; back?: string | null } {
  if (card?.image_uris) {
    const front = card.image_uris.png || card.image_uris.large || card.image_uris.normal
    return { front, back: null }
  }
  if (Array.isArray(card?.card_faces)) {
    const f0 = card.card_faces[0]
    const f1 = card.card_faces[1]
    const front = f0?.image_uris?.png || f0?.image_uris?.large || f0?.image_uris?.normal
    const back = f1?.image_uris?.png || f1?.image_uris?.large || f1?.image_uris?.normal || null
    return { front, back }
  }
  return { front: undefined, back: null }
}

async function fetchPage(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Search Scryfall for alternate printings/art for a given card name.
 * Returns a list of front image URLs (and back when present).
 */
export async function searchAlternateArts(name: string): Promise<SearchArtResult[]> {
  const q = encodeURIComponent(`!"${name}" game:paper`)
  const base = `https://api.scryfall.com/cards/search?q=${q}&unique=prints&order=released&include_extras=true`

  const results: SearchArtResult[] = []
  let url: string | null = base
  let guard = 0
  while (url && guard++ < 10) { // page up to 10 pages defensively
    const data = await fetchPage(url)
    if (!data || !Array.isArray(data.data)) break
    for (const c of data.data) {
      const { front, back } = pickImages(c)
      if (!front) continue
  results.push({ url: toCorsSafeImageUrl(front), backUrl: back ? toCorsSafeImageUrl(back) : null, id: c.id, set: c.set })
    }
    url = data.has_more && data.next_page ? data.next_page : null
  }
  // De-duplicate by URL (some faces may repeat across printings)
  const seen = new Set<string>()
  const dedup: SearchArtResult[] = []
  for (const r of results) {
    if (seen.has(r.url)) continue
    seen.add(r.url)
    dedup.push(r)
  }
  return dedup
}
