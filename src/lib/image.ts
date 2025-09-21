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
    // Stable Diffusion local API/image endpoints should be left untouched (explicit allow-list)
    if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && (u.port === '7860' || u.port === '7680')) {
      return inputUrl
    }
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
    // If it's a whitelisted local SD endpoint just return as-is
    if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && (u.port === '7860' || u.port === '7680')) return url
  } catch {}
  return toCorsSafeImageUrl(url)
}
