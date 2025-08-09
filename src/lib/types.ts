// Shared domain types
export type ParsedItem = { raw: string; type: 'card' | 'token'; name: string }
export type ParseError = { line: number; message: string }
export type CardImage = { id: string; name: string; frontUrl: string; backUrl?: string | null }
export type LayoutImage = { url: string; x: number; y: number; w: number; h: number }
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
}
