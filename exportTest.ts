/**
 * exportTest.ts — quick Node script to exercise export rendering using src/lib/exportUtils.ts.
 *
 * What it does:
 * - Uses the real helpers: createBlankCanvasPage, createCardSlot, addSlotBackground, placeCardCenteredIntoSlot
 * - Creates a single 3x3 page (Letter, portrait) and places the same card image in the first 3 slots.
 * - Writes the result to exportTest.png at the project root.
 *
 * Requirements (install first if missing):
 *   yarn add -D canvas
 *   # or: npm i -D canvas
 *
 * Run (one of):
 *   node --loader ts-node/esm exportTest.ts  (if you use ts-node)
 *   npx tsx exportTest.ts                    (recommended: zero-config)
 */

import fs from 'node:fs'
import path from 'node:path'

import type { ExportOptions } from './src/lib/types'
import {
  createBlankCanvasPage,
  createCardSlot,
  addSlotBackground,
  placeCardCenteredIntoSlot,
  drawCutGuidelines,
} from './src/lib/exportUtils'

// Use a non-Scryfall host so exportUtils doesn't rewrite to /scryfall (no dev proxy in Node)
const IMAGE_URL =
  'https://m.media-amazon.com/images/I/51al0BOFztS._UF894,1000_QL80_.jpg'

const DEFAULT_OPTIONS: ExportOptions = {
  // Mirror App defaults
  dpi: 360,
  paper: 'Letter',
  bleed: 0,
  margin: 10,
  orientation: 'portrait',
  alignmentOffsetX: 0,
  alignmentOffsetY: 0,
  printScaleCompensation: undefined,
  drawCutMargins: true,
  upscaleWithSD: false,
}

async function ensureCanvasLib() {
  try {
    // Avoid hard-typing to keep this script self-contained
    const mod: any = await import('canvas')
    return mod
  } catch (e) {
    console.error('\nThis script requires the "canvas" package.\nInstall it and re-run:')
    console.error('  yarn add -D canvas')
    console.error('  # or: npm i -D canvas\n')
    throw e
  }
}

async function polyfillDomForNode() {
  // Provide just enough DOM to satisfy exportUtils in Node
  const { createCanvas, Image } = await ensureCanvasLib()
  ;(globalThis as any).Image = Image
  if (!(globalThis as any).document) {
    ;(globalThis as any).document = {
      createElement(tag: string) {
        if (tag !== 'canvas') throw new Error('Only canvas element is supported in this test')
        // Start tiny; exportUtils will size it
        return createCanvas(1, 1)
      },
    }
  }
}

async function main() {
  await polyfillDomForNode()

  const options: ExportOptions = { ...DEFAULT_OPTIONS }

  // Create a blank page using the shared helpers
  const page = createBlankCanvasPage(options, '#ffffff')

  // First three slots (positions 1..3). Add bleed background if bleed > 0
  for (let pos = 1; pos <= 3; pos++) {
    const slot = createCardSlot(page, pos, false)
    if (options.bleed > 0) addSlotBackground(page, slot, '#000000')
    await placeCardCenteredIntoSlot(page, slot, IMAGE_URL)
    if (options.drawCutMargins) drawCutGuidelines(page, slot)
  }

  // Write PNG to disk
  const outPath = path.resolve(process.cwd(), 'exportTest.png')
  const nodeCanvas = page.canvas as any
  fs.writeFileSync(outPath, nodeCanvas.toBuffer('image/png'))
  console.log(`Wrote ${outPath}`)
}

// Execute
main().catch((err) => {
  console.error('exportTest failed:', err)
  process.exitCode = 1
})
