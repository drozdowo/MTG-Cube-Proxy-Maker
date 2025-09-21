// Simple pub/sub progress channel for SD upscaling
export type UpscaleProgress = { current: number; total: number; done: boolean }

type Listener = (p: UpscaleProgress) => void

const listeners = new Set<Listener>()

export function onUpscaleProgress(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emitUpscaleProgress(p: UpscaleProgress) {
  for (const l of listeners) l(p)
}
