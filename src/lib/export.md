# Export/Print Pipeline Overview

This document explains how `src/lib/export.ts` currently performs exporting and printing, and how it ties into the app. Each subsection answers: What, Why, How, and Technical details.

## 1) Exporting a PDF

### What
- Convert the app’s logical page layout (3×3 grid of cards) into a multi-page PDF and a print-friendly page.
- Optionally run Stable Diffusion (SD) upscaling on images before export/print.

### Why
- Printed cards need predictable physical dimensions (target 63×88 mm) and identical layout as previewed.
- Browsers/printer drivers often auto-scale; we counteract that so physical output matches MTG card specs.

### How
- Inputs: `LayoutPages` and `ExportOptions`.
- Uses a single set of physical layout metrics computed in `computeLayoutMetrics(opts)` so PNG exports and print HTML match perfectly.
- Export paths:
  - `exportToPdf(pages, options)`: Renders each page to a canvas, embeds it into a PDF page sized to the selected paper, and triggers a single PDF download.
  - `printPages(pages, options)`: Opens a new window, renders the same layout using millimeter CSS units, waits for images to load, then calls `window.print()`.
- Print scaling avoidance: exact metric sizes, mm-based CSS dimensions, zero page margins, and a manual compensation scale (Scale Override %) to counter printer auto-reduction.

### Technical details
- Core helpers:
  - `computeLayoutMetrics(opts)`: derives paper size (A4/Letter), orientation, page mm sizes, card mm sizes with bleed, total grid mm size, margins that center the grid, alignment offsets, and a `scale` derived from `printScaleCompensation` (Scale Override %) or 1.0 when unset.
  - `pagePixelSize(opts)`: inches × DPI → pixel width/height for the canvas.
  - `loadImage(url)`: normalizes URL via `ensureCorsSafe`, fetches bytes → `Blob` → object URL for same-origin decode; falls back to direct `<img>` load with `crossOrigin`/`referrerPolicy` if needed.
  - `renderPageToPng(page, opts)`: draws a white background, each card cell with optional black bleed backdrop, cover-fits the image into the trimmed area, draws cut guides if requested, then returns a PNG Blob via `canvas.toBlob`.
  - `exportToPdf(...)`: uses the same canvas rendering, then embeds each page PNG into a PDF using pdf-lib.
  - `printPages(...)`: builds an HTML document using mm for absolute sizing, includes the same grid math, waits for `load` on all images, and triggers print.
- Print scaling mitigation: mm-based CSS + `@page { size: <paper> <orientation>; margin: 0; }` and a manual compensation `scale` applied to the grid, to offset typical printer auto-reduction.

---

## 2) How it’s tied into the application

### What
- The export/print functions are invoked from the UI in `src/app/App.tsx` and operate on the same `LayoutPages` users preview.

### Why
- Keeps exported output consistent with the current state: custom art picks, default back, alignment, margins, and bleed.

### How
- `App.tsx` imports `{ exportToPdf, exportToPngs, printPages }` from `@/lib/exportService`.
- Button actions:
  - Export: `await exportToPdf(pages, options)`
  - Print: `await printPages(pages, options)`
- Data flow:
  - The user’s card list is parsed (`parseInput`) → fetched (`scryfallFetch`) → laid out (`buildLayout`) into `LayoutPages`.
  - Overrides (user-selected art) are applied in-place before setting state.
  - Both React state `pages` and `pageService` are updated, keeping a central authoritative representation.
- Inside `export.ts`, when exporting, it prefers using `pageService.toLayoutPages()` if it matches the passed-in pages count, ensuring parity with the most recent interactive changes.

### Technical details
- Relevant code sites:
  - `App.tsx` button handlers call the export functions.
  - `pageService.setFromLayout(layout)` after each Generate and whenever art is replaced.
  - `pageService.replaceFront(...)` is used by the art picker; `setPages(pageService.toLayoutPages())` then updates the UI.
  - `export.ts` checks `pageService.getAll()`; if it aligns with the requested pages length, it rebuilds from `pageService` for a single rendering path.
  - Upscale progress events are consumed by `UpscaleModal` via `onUpscaleProgress`.

---

## 3) How it is upscaling images

### What
- Optional client-initiated upscaling of images through an Automatic1111 SD server.

### Why
- Improve visual quality of printed/exported images when source resolution is limited.

### How
- If `options.upscaleWithSD` is true:
  - `isSdAvailable()` checks if the local SD server is reachable; if not, an alert explains the requirement and export aborts.
  - `maybeUpscalePages(pages, options)` mutates image URLs in-place to upscaled data URLs, while:
    - Skipping the default back asset on back pages (heuristic: match `cardback.jpg`/first default back in `pageService`).
    - Caching by original URL so duplicates are only processed once.
    - Emitting progress via `emitUpscaleProgress({ current, total, done })` for the modal.
  - `upscaleWithSd(url, { denoiseStrength: 0.12 })` performs the actual call to the SD “extras” endpoint and returns a data URL on success.

### Technical details
- Default back heuristic: scans `pageService.getAll()` for a back slot whose URL includes `cardback.jpg` and treats that as “skip for back pages”.
- Processes both fronts and backs, but the skip rule applies only on back pages for default assets.
- Maintains counters (attempted/succeeded/skipped) and logs a summary; progress messages are sent throughout and finalized as done.
- On any individual failed upscale, the original URL is kept and a warning is logged.

---

## 4) How it draws using canvas

### What
- Precisely rasterize each layout page to a PNG using `<canvas>` with correct pixel sizes for the chosen paper and DPI.

### Why
- Canvas guarantees exact pixel control, immune to CSS layout differences, producing consistent export images.

### How
- `renderPageToPng(page, opts)` steps:
  1. Compute layout metrics in millimeters (`computeLayoutMetrics`) and convert to pixels (`mmToPx`) at `opts.dpi`, then apply `metrics.scale`.
  2. Create a canvas sized to the full page in pixels (`pagePixelSize`).
  3. Paint white background.
  4. Preload up to 9 images with `loadImage`.
  5. For each grid cell (3×3):
     - Compute the pixel origin from margins + offsets (both scaled and rounded).
     - If bleed > 0, fill the card area with black as a bleed underlay.
     - Compute inset = bleed in px (scaled), inner trimmed width/height.
     - Cover-fit the image into the inner area (scale = max(innerW/naturalW, innerH/naturalH)), center, and draw via `ctx.drawImage`.
     - On load failure, draw a gray placeholder with border and X.
  6. If `drawCutMargins`, overlay cut guides as thin rectangles at internal grid boundaries.
  7. Convert canvas to a PNG Blob via `canvas.toBlob`.

### Technical details
- Constants: `COLS = 3`, `ROWS = 3`, `CARD_MM = { w: 63, h: 88 }`, `MM_PER_INCH = 25.4`.
- Canvas sizing: inches × DPI rounded to integers to avoid subpixel artifacts.
- Rounding: margin/origin/card sizes are all rounded to integers to minimize blurring from half-pixel coordinates.
- Guides: vertical/horizontal lines extended slightly beyond the grid, color `rgba(16,185,129,0.8)`, thickness proportional to card size with a minimum of 1px.
- Downloads: `triggerDownload(blob, filename)` uses an object URL, programmatically clicks an `<a>`, then revokes the URL.
