// Utilities for producing canvas-safe image URLs (avoid CORS tainting)

/**
 * Return a URL that can be safely loaded into a canvas without CORS issues.
 * - In development: routes Scryfall CDN through Vite proxy at /scryfall
 * - In production: routes Scryfall CDN through images.weserv.nl proxy
 * Other hosts are returned unchanged.
 */
export function toCorsSafeImageUrl(inputUrl: string): string {
  try {
    const u = new URL(inputUrl, typeof window !== 'undefined' ? window.location.href : 'http://localhost')
  // Always route Scryfall image CDN through local proxy
  if (u.hostname === 'cards.scryfall.io') return `/scryfall${u.pathname}${u.search}`
  return inputUrl
  } catch {
    return inputUrl
  }
}

/** Convenience: idempotently pass through already proxied local URLs. */
export function ensureCorsSafe(url: string): string {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost')
    // Already using our local proxy
    if (u.pathname.startsWith('/scryfall')) return url
  } catch {}
  return toCorsSafeImageUrl(url)
}
