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
        {/* Printer Preset removed: scaling is now driven only by Scale Override %. */}
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
        {/* <Row
          label="Debug sizes on print"
          tooltip={"If enabled, along with Draw Cut Margins it will draw the size of the cards. This will help debug printer scaling issues and help you land on a value for 'Scale Override %'."}
        >
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={!!value.debugSizesOnPrint}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('debugSizesOnPrint', e.target.checked as any)}
          />
        </Row> */}
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
          tooltip="Manual scaling percentage applied to the entire grid. Leave blank for 100%. Increase if prints are undersized; decrease if oversized."
        >
          <input
            className="border border-gray-300 rounded px-2 py-1 w-full"
            type="number"
            min={95}
            max={110}
            step={0.1}
            value={Math.round(((value.printScaleCompensation ?? 0) * 100 + Number.EPSILON) * 10) / 10 || ''}
            placeholder={'100%'}
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
          Leave blank to use 100%. Override only if physical cards print undersized/oversized. 102.5% works for me on an Epson ET-2400 printer, printing via the 'Print' functionality, or by exporting to PDF.
          To identify a good value, use your browser's Print function to print a test page then measure the printed card size and adjust the percentage accordingly. (ie: target should be 63mm across, if it prints 61.5mm, try 63/61.5 = 1.025 = 102.5%~)
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
