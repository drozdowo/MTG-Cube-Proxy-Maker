## Stable Diffusion Upscaling Integration

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
