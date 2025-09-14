// Scryfall domain model
// Contract: name, front image, optional back image, and set
export type ScryfallCard = {
  name: string
  set: string // Scryfall set code (e.g., "lea")
  frontImage: string
  backImage?: string | null
  card_faces?: Array<{ image_uris: { png: string; large: string; normal: string } }>
}
