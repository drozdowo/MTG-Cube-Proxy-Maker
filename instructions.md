## MTG Proxy Maker (mtgpm)

Create printable front/back sheets of Magic: The Gathering proxies for personal use only.

Legal: This tool is for personal, non-commercial use. Don’t sell or distribute proxies. Respect Wizards of the Coast’s policies and your local laws.

### Tech choice
- Default: Vite + React (fast SPA, pure frontend)
- Alternative: Next.js (if you want SSR/Edge and server routes)

If undecided, start with Vite + React; you can later migrate to Next.js with minimal UI changes.

## Core features
- Card list input (multiline textarea): Card names  (Scryfall search syntax)
- Default card back: upload or choose from presets; used when a card has no official back image
- Fetch card images via Scryfall API (fronts; handle double-sided and flip cards)
- Layout builder: 3x3 grid for US Letter and A4; 600 DPI; trim and registration marks
- Export: User chooses which print-ready format to export their sheets as (PDF (preferred), PNG sheet(s))
- Duplex alignment: back sheet matches front order with optional offset tweaks
- Preview panel: quick thumbnails; highlight unresolved/missing cards
- Caching: memoize results in IndexedDB; rate-limit API calls

## UI layout
- Left column
	- Card List (large textarea)
	- Default Card Back (image picker/upload)
	- Options (paper size, margin, DPI, orientation, bleed, alignment offset)
	- Go button (Generate)
- Right column
	- Live preview (sheet pages)
	- Issues panel (unresolved cards, duplicates, warnings)

## Card list parsing
Card data will be fetched from the Scryfall API (docs: https://scryfall.com/docs/api/cards/named). The card list will be a 1:1 match to what will be printed, meaning to print 3 copies of `Lightning Bolt`, we would need to do below:

```
Lightning Bolt
Lightning Bolt
Lightning Bolt
```

Edge cases to handle:
- Double-faced/split/adventure: ensure correct front/back mapping
- Tokens: allow "Token: Saproling" with token image templates

## Image sourcing (Scryfall)
- Endpoint: https://api.scryfall.com/cards/named?exact=... or /cards/search for set+collector
- Prefer PNG images; fallback to large JPEG if PNG unavailable

## Layout and print specs
- Card size: 63×88 mm (2.5×3.5 in)
- DPI: 600 for high-res
- Sheet: 3×3 grid (9 per page) with equal gutters; A4 format (for now)

## Card Ordering
- Order: fill rows left→right, top→bottom; back sheet mirrors same order to preserve card backs on their respestive fronts.

Example front and back sheet:

FRONT SHEET:
```
1A 2A 3A
4A 5A 6A
7A 8A 9A
```

BACK SHEET:
```
3A 2A 1A
6A 5A 4A
9A 8A 7A
```


## Export
- Preferred: generate vector-backed PDF pages with embedded rasters
- Alternative: export PNG per page (600+ DPI) or PDF
- Include metadata (generated date, options) in PDF properties

## Performance
- Debounce parsing; only fetch on button click
- Batch Scryfall queries; parallelize with a small pool (e.g., 4–6)

## Error handling
- Network failures: retry with backoff; show clear inline errors
- Invalid lines: mark with line number and reason; continue processing others

## Minimal project structure (Vite + React)
```
mtgpm/
	src/
		app/
			App.tsx
			routes.ts
		components/
			CardListInput.tsx
			BackPicker.tsx
			Preview.tsx
			Options.tsx
		lib/
			parse.ts
			scryfall.ts
			layout.ts
			export.ts
			cache.ts
	index.html
	vite.config.ts
	tsconfig.json
```

Key modules contract:
- parse.ts
	- input: string (multiline)
	- output: { items: ParsedItem[]; errors: ParseError[] }
- scryfall.ts
	- input: ParsedItem[]
	- output: Promise<CardImage[]> with face/front/back URLs and metadata
- layout.ts
	- input: CardImage[], options
	- output: LayoutPages[] (front and back)
- export.ts
	- input: LayoutPages[], options
	- output: Blob (PDF) or Blob[] (PNGs)

## Setup (Windows PowerShell)
Prereqs: Node.js ≥ 18, pnpm or npm

Vite + React (recommended):
```powershell
npx create-vite@latest mtgpm --template react-ts
cd mtgpm
yarn install
yarn dev
```

Next.js (alternative):
```powershell
npx create-next-app@latest mtgpm --ts --eslint --src-dir --app --tailwind --import-alias "@/*"
cd mtgpm
yarn dev
```

## Testing
- Unit tests: parsing (happy path + malformed lines), layout math, export stubs
- Lightweight integration: mock Scryfall responses

## Roadmap
1) Implement parser and basic UI scaffold
2) Integrate Scryfall fetch with caching
3) Layout engine (front only) → add back sheet + alignment
4) PDF export with trim/registration marks
5) Print presets
6) Token support and manual overrides

### Printer Presets & Scaling
Some consumer printers (e.g., Epson ET-2400 series) enforce unprintable hardware margins and will auto-scale content down when the page has zero CSS margin. This causes card images to print slightly undersized (e.g., 62.3 mm instead of 63 mm width).

To counter this, a `printerPreset` option can be set:
- `epson-normal`: Applies ~1.8% scale up (1.018)
- `epson-uniform`: Applies ~2.4% scale up (1.024)

You can also specify a manual `printScaleCompensation` (% override in Options panel). Leave the field blank to use the preset's automatic factor. The final applied scale is clamped between 0.95 and 1.10 to prevent extreme values.

If after printing and measuring a physical proxy the card is still undersized/oversized, adjust the manual override in small 0.1% steps. Example: printed width = 62.6 mm, desired = 63.0 mm → needed factor ≈ 63 / 62.6 = 1.0064 (≈100.6%).

## Notes
- UI library: choose a small, accessible set (e.g., Radix UI + Tailwind or Headless UI)
- Keep everything client-side to avoid hosting complexity; consider Next.js only if SSR is needed later