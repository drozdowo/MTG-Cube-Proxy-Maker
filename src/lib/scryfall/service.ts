import { cache } from '@/lib/cache'
import type { ParsedItem, CardImage } from '@/lib/types'
import type { ScryfallCard } from '@/lib/scryfall/model'

const BATCH_SIZE = 75 // per Scryfall docs
const CONCURRENCY = 3

type FetchOpts = { attempts?: number; timeoutMs?: number; method?: string; body?: any }

// --- Name normalization & fuzzy helpers ---
function normalizeName(s: string): string {
  try {
    // Lowercase, strip diacritics, remove non-alphanumerics except space, collapse spaces
    const ascii = s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return ascii
  } catch {
    // Fallback without unicode classes for older runtimes
    return s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
}

function nameTokens(name: string): string[] {
  return normalizeName(name)
    .split(' ')
    .filter(Boolean)
}

async function addAliasesToCache(card: ScryfallCard): Promise<void> {
  const tokens = nameTokens(card.name)
  const aliases = new Set<string>([normalizeName(card.name), ...tokens])
  for (const token of aliases) {
    const key = `scryfall:alias:${token}`
    const existing = (await cache.get<string[]>(key)) || []
    if (!existing.includes(card.name)) {
      existing.push(card.name)
      await cache.set(key, existing)
    }
  }
}

async function resolveFromAliases(inputName: string): Promise<ScryfallCard | undefined> {
  const tokens = nameTokens(inputName)
  if (!tokens.length) return undefined
  // Try longer tokens first for better specificity
  const sorted = [...tokens].sort((a, b) => b.length - a.length)
  const candidates = new Map<string, number>() // name -> score
  for (const t of sorted) {
    const aliasList = (await cache.get<string[]>(`scryfall:alias:${t}`)) || []
    for (const cand of aliasList) {
      // score: how many query tokens are present in candidate tokens
      const candTokens = new Set(nameTokens(cand))
      let score = 0
      for (const q of tokens) if (candTokens.has(q)) score++
      const prev = candidates.get(cand) || 0
      candidates.set(cand, Math.max(prev, score))
    }
    if (candidates.size) break // sufficient specificity from the longest matching token
  }
  if (!candidates.size) {
    // try full normalized string
    const norm = normalizeName(inputName)
    const aliasList = (await cache.get<string[]>(`scryfall:alias:${norm}`)) || []
    for (const cand of aliasList) candidates.set(cand, tokens.length)
  }
  if (!candidates.size) return undefined
  // Pick best by score desc, then by shorter name length
  const bestName = [...candidates.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0].length - b[0].length))
    .map(([n]) => n)[0]
  const card = await cache.get<ScryfallCard>(`scryfall:${bestName}`)
  return card || undefined
}

async function fetchWithRetry(url: string, opts?: FetchOpts): Promise<Response | null> {
  const attempts = opts?.attempts ?? 3
  const timeoutMs = opts?.timeoutMs ?? 10000
  const method = opts?.method ?? 'GET'
  const body = opts?.body
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      clearTimeout(t)
      if (res.ok) return res
      lastError = new Error(`HTTP ${res.status}`)
    } catch (e) {
      lastError = e
    } finally {
      clearTimeout(t)
    }
    const backoff = Math.min(2000, 250 * 2 ** i) + Math.random() * 150
    await new Promise(r => setTimeout(r, backoff))
  }
  console.warn('Scryfall fetch failed after retries:', lastError)
  return null
}

function parseScryfallCard(data: any): ScryfallCard | null {
  // Prefer PNG image_uris.png; fall back to large or normal
  let front: string | undefined
  let back: string | undefined | null

  if (data?.image_uris) {
    front = data.image_uris.png || data.image_uris.large || data.image_uris.normal
  }

  if (!front && Array.isArray(data?.card_faces)) {
    const f0 = data.card_faces[0]
    const f1 = data.card_faces[1]
    front = f0?.image_uris?.png || f0?.image_uris?.large || f0?.image_uris?.normal
    back = f1?.image_uris?.png || f1?.image_uris?.large || f1?.image_uris?.normal || null
  }

  if (!front) return null
  const set: string = data.set || 'unk'
  return { name: data.name, set, frontImage: front, backImage: back ?? null }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function fetchCollectionByNames(names: string[]): Promise<Map<string, ScryfallCard>> {
  const url = 'https://api.scryfall.com/cards/collection'
  const chunks = chunk(names, BATCH_SIZE)
  const map = new Map<string, ScryfallCard>()

  let nextIndex = 0
  async function worker() {
    while (nextIndex < chunks.length) {
      const i = nextIndex++
      const identifiers = chunks[i].map(n => ({ name: n }))
      const res = await fetchWithRetry(url, { method: 'POST', body: { identifiers } })
      if (!res) continue
      const json = await res.json()
      const data: any[] = json?.data || []
      for (const card of data) {
        const parsed = parseScryfallCard(card)
        if (parsed) map.set(parsed.name, parsed)
      }
    }
  }
  const workers = new Array(Math.min(CONCURRENCY, chunks.length)).fill(0).map(() => worker())
  await Promise.all(workers)
  return map
}

export async function scryfallService(items: ParsedItem[]): Promise<CardImage[]> {
  // Load cache and collect names
  const names: string[] = []
  for (const it of items) {
    if (it.type === 'card') names.push(it.name)
  }
  const uniqueNames = Array.from(new Set(names))

  const resolved = new Map<string, ScryfallCard>()
  const toFetch: string[] = []

  // Check cache
  for (const name of uniqueNames) {
    const cached = await cache.get<ScryfallCard>(`scryfall:${name}`)
    if (cached) {
      resolved.set(name, cached)
      // ensure aliases are populated for future fuzzy lookups
      await addAliasesToCache(cached)
      continue
    }
    // Try fuzzy via alias index
    const fuzzy = await resolveFromAliases(name)
    if (fuzzy) {
      resolved.set(name, fuzzy)
      continue
    }
    toFetch.push(name)
  }

  if (toFetch.length) {
    const fetched = await fetchCollectionByNames(toFetch)
    for (const [name, card] of fetched.entries()) {
      resolved.set(name, card)
      await cache.set(`scryfall:${name}`, card)
      await addAliasesToCache(card)
    }
  }

  // Build CardImage[] in original order; unresolved get placeholder
  const results: CardImage[] = []
  for (const it of items) {
    const idBase = `${results.length}`
    let card = resolved.get(it.name)
    if (!card) {
      // As a last resort, attempt fuzzy lookup against whatever was resolved
      const itNorm = normalizeName(it.name)
      const keys = [...resolved.keys()]
      const bestKey = keys
        .map(k => ({ k, norm: normalizeName(k) }))
        .filter(x => x.norm.includes(itNorm) || itNorm.includes(x.norm))
        .sort((a, b) => a.norm.length - b.norm.length)[0]?.k
      if (bestKey) card = resolved.get(bestKey)
      if (!card) {
        // Try alias cache
        card = await resolveFromAliases(it.name)
      }
    }
    if (card && card.card_faces) {
      console.log('card with faces?', card)
      // if we have card_faces, 0 index is front, 1 is back.
      results.push({
        id: `${card.set}-${idBase}-a`,
        name: card.name,
        frontUrl: card.card_faces[0].image_uris.png,
        backUrl: card.card_faces[1].image_uris.png ?? null,
      })
    } else if (card && !card.card_faces) {
      results.push({
        id: `${card.set}-${idBase}`,
        name: card.name,
        frontUrl: card.frontImage,
        backUrl: card.backImage ?? null,
      })
    }
  }
    return results
}
