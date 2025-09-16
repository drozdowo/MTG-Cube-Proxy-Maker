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
        <Row label="Paper Type">
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
        <Row label="DPI">
    <input className="border border-gray-300 rounded px-2 py-1 w-full" type="number" value={value.dpi} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('dpi', Number(e.target.value))} />
        </Row>
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
