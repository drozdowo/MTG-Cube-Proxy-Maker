// Stable Diffusion (Automatic1111) integration helpers
// Provides: availability check and basic img2img upscaling pass.
// Assumptions:
// - Local SD WebUI running at http://127.0.0.1:7860 with --api enabled.
// - We use /sdapi/v1/upscalers to probe availability (cheap, GET).
// - We use /sdapi/v1/img2img for upscaling each card image when enabled.
// - For now we apply a light denoise strength so card text isn't distorted too much.
// - Model / sampler left to SD defaults; user may configure in UI.

export interface SdConfig {
  baseUrl?: string // default http://127.0.0.1:7860
  // Future: allow prompt/negativePrompt overrides etc.
}

const DEFAULT_BASE = 'http://127.0.0.1:7860'

function computePrefix(baseUrl: string): { prefix: string; proxy: boolean } {
  // If running in a browser and caller didn't override baseUrl, go through the Vite proxy (/sd)
  if (typeof window !== 'undefined' && baseUrl === DEFAULT_BASE) {
    return { prefix: '/sd', proxy: true }
  }
  return { prefix: baseUrl, proxy: false }
}

export async function isSdAvailable(baseUrl: string = DEFAULT_BASE, abort?: AbortSignal): Promise<boolean> {
  const { prefix, proxy } = computePrefix(baseUrl)
  try {
    const res = await fetch(`${prefix}/sdapi/v1/upscalers`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: abort,
    })
    if (!res.ok) return false
    // Just ensure it returns JSON
    await res.json()
    if (proxy) console.debug('[SD] isSdAvailable via proxy prefix', prefix)
    return true
  } catch {
    return false
  }
}

export interface UpscaleResult {
  ok: boolean
  dataUrl?: string
  error?: string
}

export interface UpscaleOptions {
  baseUrl?: string
  // Denoise strength 0..1 (lower = preserve original). We'll default low.
  denoiseStrength?: number
  scale?: number // Not directly used; could drive resize mode.
}

// Convert a remote URL to base64 and also detect intrinsic dimensions for sizing logic.
async function fetchImageAsBase64(url: string): Promise<{ b64: string; width: number; height: number }> {
  const res = await fetch(url, { headers: { Accept: 'image/*' } })
  if (!res.ok) throw new Error(`Image fetch failed ${res.status}`)
  const blob = await res.blob()
  const b64 = await blobToBase64(blob)
  const { width, height } = await blobDimensions(blob)
  return { b64, width, height }
}

function blobDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      const w = img.naturalWidth || 0
      const h = img.naturalHeight || 0
      URL.revokeObjectURL(url)
      resolve({ width: w, height: h })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ width: 0, height: 0 })
    }
    img.src = url
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

// Perform a simple img2img pass that effectively upscales using SD's internal upscalers.
// We rely on SD's own settings for upscale steps; we just set a conservative denoise strength.
export async function upscaleWithSd(originalUrl: string, opts: UpscaleOptions = {}): Promise<UpscaleResult> {
  const baseUrl = opts.baseUrl || DEFAULT_BASE
  const { prefix, proxy } = computePrefix(baseUrl)
  try {
  const { b64, width: srcW, height: srcH } = await fetchImageAsBase64(originalUrl)
    // Use the extras single image endpoint with chained upscalers.
    // According to Automatic1111 API docs, payload supports fields like:
    //  { image: <base64>, upscaling_resize: number, upscaler_1, upscaler_2, extras_upscaler_2_visibility, gfpgan_visibility, codeformer_visibility, ... }
    // We'll perform a 2x upscale using two passes: first R-ESRGAN 4x+ Anime6B, then ESRGAN_4x (secondary visibility small for refinement).
    // Compute target dimensions (2x), clamp to a reasonable upper bound (e.g., 2048 * 2048 default card sizes rarely exceed ~745x1040).
    const factor = 2
    const targetW = Math.max(1, Math.min(srcW * factor, 4096))
    const targetH = Math.max(1, Math.min(srcH * factor, 4096))
    const payload: any = {
      image: b64,
      // Provide both factor and explicit dimensions for broader SD version compatibility.
      upscaling_resize: factor,
      upscaling_resize_w: targetW,
      upscaling_resize_h: targetH,
      upscaler_1: 'R-ESRGAN 4x+ Anime6B',
      upscaler_2: 'ESRGAN_4x',
      extras_upscaler_2_visibility: 0.4,
      gfpgan_visibility: 0,
      codeformer_visibility: 0,
      upscale_first: true,
      show_extras_results: false,
      // Some versions expect these even if zero
      codeformer_weight: 0,
      resize_mode: 0,
    }
    const res = await fetch(`${prefix}/sdapi/v1/extra-single-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return { ok: false, error: `SD extras HTTP ${res.status}` }
    const json = await res.json()
    // Response shape typically: { image: 'base64...', html_info: '' }
    const outB64: string | undefined = json?.image
    if (!outB64) return { ok: false, error: 'No image returned from SD extras' }
    const clean = outB64.includes(',') ? outB64.split(',')[1] : outB64
    if (proxy) console.debug('[SD] Upscaled via proxy path', prefix, 'original size', srcW, 'x', srcH)
    return { ok: true, dataUrl: `data:image/png;base64,${clean}` }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
