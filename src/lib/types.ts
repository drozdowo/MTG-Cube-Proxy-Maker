// Shared domain types
export type ParsedItem = { raw: string; type: 'card' | 'token'; name: string }
export type ParseError = { line: number; message: string }
export type CardImage = { id: string; name: string; frontUrl: string; backUrl?: string | null }
export type LayoutImage = { url: string; x: number; y: number; w: number; h: number; name?: string }
export type LayoutPage = { id: string; role: 'front' | 'back'; images: LayoutImage[] }
export type LayoutPages = LayoutPage[]

// Export options used across lib and UI
export type ExportOptions = {
  dpi: number
  paper: 'A4' | 'Letter'
  bleed: number
  margin: number
  orientation: 'portrait' | 'landscape'
  alignmentOffsetX: number
  alignmentOffsetY: number
  /** Optional print scale compensation factor. 1 = no change. Use ~1.01–1.03 to counter printer auto-shrink. */
  printScaleCompensation?: number
  /** Printer hardware margin preset to auto-compensate shrink introduced by unprintable areas. */
  printerPreset?: 'none' | 'epson-normal' | 'epson-uniform'
  /** When true (default), overlay faint cut margin guides around cards on generated outputs. */
  drawCutMargins: boolean
  /** When true, future exports may run an SD-based upscaling pass on images (no-op currently). */
  upscaleWithSD?: boolean
}
