import type { ExportOptions } from '@/lib/types'
import type React from 'react'

type Props = {
  value: ExportOptions
  onChange: (v: ExportOptions) => void
  onGenerate: () => void
  busy?: boolean
}

export function OptionsPanel({ value, onChange, onGenerate, busy }: Props) {
  function update<K extends keyof ExportOptions>(k: K, v: ExportOptions[K]) {
    onChange({ ...value, [k]: v })
  }
  return (
    <div>
      <label className="block font-semibold mb-1.5">Options</label>
      <div className="grid gap-2">
        <Row label="Paper">
    <select className="border border-gray-300 rounded px-2 py-1 w-full"
      value={value.paper} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => update('paper', e.target.value as any)}>
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
          </select>
        </Row>
        <Row label="DPI">
    <input className="border border-gray-300 rounded px-2 py-1 w-full" type="number" value={value.dpi} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('dpi', Number(e.target.value))} />
        </Row>
        <Row label="Margin (mm)">
    <input className="border border-gray-300 rounded px-2 py-1 w-full" type="number" value={value.margin} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('margin', Number(e.target.value))} />
        </Row>
        <Row label="Bleed (mm)">
    <input className="border border-gray-300 rounded px-2 py-1 w-full" type="number" value={value.bleed} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('bleed', Number(e.target.value))} />
        </Row>
        <Row label="Orientation">
    <select className="border border-gray-300 rounded px-2 py-1 w-full"
      value={value.orientation} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => update('orientation', e.target.value as any)}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </Row>
        <Row label="Align X (mm)">
    <input className="border border-gray-300 rounded px-2 py-1 w-full" type="number" value={value.alignmentOffsetX} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('alignmentOffsetX', Number(e.target.value))} />
        </Row>
        <Row label="Align Y (mm)">
    <input className="border border-gray-300 rounded px-2 py-1 w-full" type="number" value={value.alignmentOffsetY} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('alignmentOffsetY', Number(e.target.value))} />
        </Row>
  <button className="px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700"
    onClick={onGenerate} disabled={busy}>Generate</button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid [grid-template-columns:140px_1fr] items-center gap-2">
      <div className="text-gray-700">{label}</div>
      <div>{children}</div>
    </div>
  )
}
