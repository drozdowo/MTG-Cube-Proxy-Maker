import type { ParseError, ParsedItem } from '@/lib/types'

export function parseInput(input: string): { items: ParsedItem[]; errors: ParseError[] } {
  const lines = input.split(/\r?\n/)
  const items: ParsedItem[] = []
  const errors: ParseError[] = []
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    if (line.toLowerCase().startsWith('token:')) {
      const name = line.slice(6).trim()
      if (!name) errors.push({ line: i + 1, message: 'Token name missing' })
      else items.push({ raw, type: 'token', name })
      return
    }
    // for now, treat everything else as a card name
    items.push({ raw, type: 'card', name: line })
  })
  return { items, errors }
}
