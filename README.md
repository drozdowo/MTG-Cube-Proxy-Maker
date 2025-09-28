# MTG Cube Proxy Maker

## Description

React application to take lists of cards, and create front/back sheets for printing proxies for use in a Cube. Has utilities like margin cut lines, printer scale compensation and optional image upscaling with Stable Diffusion.

This application was mostly coded using GPT5, but required some manual work around scaling images properly and correctly exporting to PDFs, etc.

## Future Features?
- Host somewhere (so its more easily accessible)
- Investigate non-SD upscaling (perhaps include in app)
- More customization (for back cards)
- Accomodate more than just MTG?

## Features and Utilities

- Scryfall card fetching: Paste a list of card names or search terms and the app fetches official card data and images from Scryfall.
- Custom card uploading (PNG): Provide your own front art as PNGs for cards that aren’t on Scryfall or to override art.
- Scryfall alternate art selection: For cards with multiple prints/arts, pick your preferred artwork from available Scryfall variants.
- Image caching: Recently fetched images are cached locally to speed up page generation and reduce repeat downloads.
- Stable Diffusion upscaling (localhost): Optionally enhance images via Automatic1111’s WebUI running locally with --api (see “Stable Diffusion Upscaling”).
- Front/Back sheets: Automatically lays out 3×3 front pages and corresponding back pages with proper row reversal for duplex alignment.
- Export: Generate high‑quality outputs as PDF or PNGs, or print directly via your browser’s print dialog.

---

## Options panel

These controls appear in the sidebar Options panel (see `src/components/Options.tsx`). They apply to both export and print flows.

- Paper Type: Select the target page size (Letter or A4). All layouts are computed to the chosen physical size.
- DPI: The rendering resolution in dots per inch for export. Higher values increase detail and file size. 300 is a typical print setting.
- Bleed (mm): Extra margin beyond the final trim line to hide slight cutting misalignment. Usually 1 mm. Set to 0 for no bleed.
- Draw Cut Margins: When enabled, faint guide borders are drawn to show where to cut each card. Turn off for cleaner pages.
- Upscale with SD?: If checked, images are upscaled via a local Stable Diffusion WebUI (http://127.0.0.1:7860) running with --api. See the section below for workflow and requirements.
- Scale Override %: A manual scaling factor applied to the entire 3×3 grid to compensate for printers that slightly shrink/expand pages even at 100%. Leave blank for 100%. Example: 102.5% for slight undersizing.
	- Tip: Print a test page, measure a card’s width (target 63 mm). If you got 61.5 mm, compute 63/61.5 ≈ 1.025 → 102.5%.
- Generate: Renders current pages with selected options. Use this before Export/Print if needed.
- Clear Art: Removes any custom images you’ve attached to cards (button is shown only when custom art exists).


## Stable Diffusion Upscaling

When the `Upscale with SD?` option is enabled (in the Options panel) the export / generate flows will:

1. Probe `http://127.0.0.1:7860/sdapi/v1/upscalers` to verify an Automatic1111 Stable Diffusion WebUI instance is running with the `--api` flag.
2. If unavailable, a blocking `alert()` is shown and the operation is aborted.
3. If available, each back-page image is examined. Any image whose URL is not the built‑in `cardback.jpg` default will be passed through the `/sdapi/v1/img2img` endpoint with a conservative `denoising_strength` (0.12) to lightly enhance detail while preserving text readability.
4. Results are embedded as `data:image/png;base64,...` URLs (in‑memory only) and exported in the generated PNG pages.

Caching: identical input URLs in the same run are only processed once.

Skipped Images:
- The default imported `cardback.jpg` asset.
- (If the heuristic ever misidentifies a custom back that includes `cardback.jpg` in its name, rename the file to force processing.)

Future Enhancements (not yet implemented):
- Allow user customization of prompt / negative prompt.
- Adjustable sampler, steps, denoise strength.
- Front image enhancement toggle.

Implementation details live in `src/lib/sd.ts` and are invoked from `src/lib/export.ts`.

---

## Technologies and major packages

- Vite + React + TypeScript — app framework and tooling (`vite`, `@vitejs/plugin-react`, `react`, `react-dom`, `typescript`).
- Tailwind CSS v4 — styling (`tailwindcss`, `@tailwindcss/vite`).
- pdf-lib — PDF generation for exports.
- Node types and TSX dev utilities (`@types/node`, `tsx`).
- Optional: `canvas` is listed as a dependency; it’s not used in-browser but can help server-side or Node-based rendering tools.

---

## Export to PDF and Print

Overview

- The export and print features share the same rendering pipeline so what you see is what you get.
- Each 3×3 page is rendered to a canvas using `exportUtils.ts` primitives, honoring DPI, bleed, guides, and scale override.

PDF export (`exportService.exportToPdf`)

- Each rendered page canvas is encoded to PNG and embedded in a same‑size PDF page via `pdf-lib`.
- Page size is either Letter or A4, respecting Orientation.
- The resulting Blob is downloaded as `mtgpm-<timestamp>.pdf`.

PNG export (`exportService.exportToPngs`)

- Renders each page to a PNG Blob and triggers downloads named `mtgpm-page-<n>-<front|back>.png`.

Print (`exportService.printPages`)

- Renders each page to a PNG data URL and opens a print-friendly window sized to the selected paper; after images load, it calls `window.print()`.
- Your OS/browser print dialog controls margins and scaling; leave margins at 0 and ensure “Actual size”/100% for best results. If your printer still shrinks/expands slightly, use “Scale Override %” in Options and try again.