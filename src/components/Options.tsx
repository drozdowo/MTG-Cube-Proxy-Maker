import type { ExportOptions } from '@/lib/types'
import type React from 'react'

type Props = {
  value: ExportOptions
  onChange: (v: ExportOptions) => void
  onGenerate: () => void
  busy?: boolean
  onClearCustomImages?: () => void
  customImagesCount?: number
}

export function OptionsPanel({ value, onChange, onGenerate, busy, onClearCustomImages, customImagesCount }: Props) {
  function update<K extends keyof ExportOptions>(k: K, v: ExportOptions[K]) {
    onChange({ ...value, [k]: v })
  }
  return (
    <div>
      <label className="block font-semibold mb-1.5">Options</label>
      <div className="grid gap-2">
        <Row
          label="Paper Type"
          tooltip="Select the target page size for the exported printable sheet."
        >
          <select
            className="border border-gray-300 rounded px-2 py-1 w-full"
            value={value.paper}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              update('paper', e.target.value as ExportOptions['paper'])
            }
          >
            <option value="Letter">Letter</option>
            <option value="A4">A4</option>
          </select>
        </Row>
        <Row
          label="Printer Preset"
          tooltip="Apply a known scaling profile for a specific printer; choose None / Custom to manually fine‑tune scaling."
        >
          <select
            className="border border-gray-300 rounded px-2 py-1 w-full"
            value={value.printerPreset || 'none'}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => update('printerPreset', e.target.value as any)}
          >
            <option value="none">None / Custom</option>
            <option value="epson-normal">Epson ET-2400 Normal</option>
            <option value="epson-uniform">Epson ET-2400 Uniform</option>
          </select>
        </Row>
        <Row
          label="DPI"
          tooltip="Dots per inch for rendered export; higher = more detail & larger file size. Typical: 300."
        >
          <input
            className="border border-gray-300 rounded px-2 py-1 w-full"
            type="number"
            value={value.dpi}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('dpi', Number(e.target.value))}
          />
        </Row>
        <Row
          label="Bleed (mm)"
          tooltip="Extra image margin beyond final cut line to hide minor cutting misalignment. Usually 1mm."
        >
          <input
            className="border border-gray-300 rounded px-2 py-1 w-full"
            type="number"
            min={0}
            max={5}
            step={0.1}
            value={value.bleed || (value.bleed === 0 ? 0 : 1)}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const raw = e.target.value
              if (raw === '') {
                update('bleed', 0 as any)
                return
              }
              const mm = Number(raw)
              update('bleed', (isFinite(mm) && mm >= 0 ? mm : 0) as any)
            }}
          />
        </Row>
        <Row
          label="Draw Cut Margins"
          tooltip="Draw faint guide borders showing where to cut each card. Disable for a cleaner sheet."
        >
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={value.drawCutMargins}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('drawCutMargins', e.target.checked)}
          />
        </Row>
        <Row
          label="Upscale with SD?"
          tooltip={'On Generate/Export this will utilize Stable Diffusion running locally (localhost:7860) with the "--api" arguments to upscale your images. Helps reduce graininess and improve text clarity using Scryfall images.'}
        >
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={!!value.upscaleWithSD}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('upscaleWithSD', e.target.checked as any)}
          />
        </Row>
        <Row
          label="Scale Override %"
          tooltip="Manual scaling percentage. Leave blank to auto‑apply preset compensation; adjust if printed cards measure off."
        >
          <input
            className="border border-gray-300 rounded px-2 py-1 w-full"
            type="number"
            min={95}
            max={110}
            step={0.1}
            value={Math.round(((value.printScaleCompensation ?? 0) * 100 + Number.EPSILON) * 10) / 10 || ''}
            placeholder={value.printerPreset === 'epson-normal' ? '≈101.8%' : value.printerPreset === 'epson-uniform' ? '≈102.4%' : '100%'}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const pct = Number(e.target.value)
              if (!e.target.value) {
                update('printScaleCompensation', undefined as any)
                return
              }
              const factor = isFinite(pct) && pct > 0 ? pct / 100 : 1
              update('printScaleCompensation', factor as any)
            }}
          />
        </Row>
        <div className="text-xs text-gray-500 -mt-1 mb-1">
          Leave blank to auto scale based on preset. Override only if physical cards print undersized/oversized.
        </div>
        {/* <Row label="Print scale comp. (%)">
          <input
            className="border border-gray-300 rounded px-2 py-1 w-full"
            type="number"
            min={95}
            max={110}
            step={0.25}
            value={Math.round(((value.printScaleCompensation ?? 1) * 100 + Number.EPSILON) * 100) / 100}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const pct = Number(e.target.value)
              const factor = isFinite(pct) && pct > 0 ? pct / 100 : 100 / 100
              update('printScaleCompensation', factor as any)
            }}
          />
        </Row> */}
  <div className="flex gap-2">
    <button className="px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700"
      onClick={onGenerate} disabled={busy}>Generate</button>
    {onClearCustomImages && (
      <button
        type="button"
        className="px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        onClick={onClearCustomImages}
        disabled={!customImagesCount}
        title={customImagesCount ? `Clear ${customImagesCount} custom image${customImagesCount === 1 ? '' : 's'}` : 'No custom images selected'}
      >
        Clear Art
      </button>
    )}
  </div>
      </div>
    </div>
  )
}

function Row({ label, children, tooltip }: { label: string; children: React.ReactNode; tooltip?: string }) {
  return (
    <div className="grid [grid-template-columns:140px_1fr] items-center gap-2">
      <div className="text-gray-700" title={tooltip}>{label}</div>
      <div>{children}</div>
    </div>
  )
}
