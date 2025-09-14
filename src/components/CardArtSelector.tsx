import React, { useEffect, useMemo, useState } from 'react'
import { searchAlternateArts } from '../lib/scryfall/search'

export type SelectedArt = {
  url: string
  backUrl?: string | null
  id?: string
  set?: string
}

type Props = {
  open: boolean
  name: string | null
  onClose: () => void
  onSave: (art: SelectedArt) => void
}

export const CardArtSelector: React.FC<Props> = ({ open, name, onClose, onSave }) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SelectedArt[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!open || !name) return
      setLoading(true)
      setError(null)
      setResults([])
      setSelectedIdx(null)
      try {
        const res = await searchAlternateArts(name)
        if (!cancelled) setResults(res)
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [open, name])

  const canSave = useMemo(() => selectedIdx != null && results[selectedIdx] != null, [selectedIdx, results])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-[min(1100px,95vw)] max-h-[90vh] bg-white rounded shadow-lg border border-gray-200 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="text-center text-lg font-semibold">{name}</div>
        </div>

        {/* Body */}
        <div className="p-4 overflow-auto">
          {loading && <div className="text-gray-600">Searching Scryfall…</div>}
          {error && <div className="text-red-600">{error}</div>}
          {!loading && !error && results.length === 0 && (
            <div className="text-gray-600">No alternate printings found.</div>
          )}
          {!loading && results.length > 0 && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {results.map((r, i) => (
                <button
                  key={`${r.id ?? r.url}-${i}`}
                  className={
                    'relative group border rounded overflow-hidden focus:outline-none ' +
                    (selectedIdx === i ? 'ring-2 ring-indigo-600' : 'hover:border-indigo-400')
                  }
                  onClick={() => setSelectedIdx(i)}
                  title={r.set ? `Set: ${r.set}` : undefined}
                >
                  <img src={r.url} className="block w-full h-auto bg-gray-50" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button className="px-3 py-1.5 rounded border border-gray-300 text-gray-800 hover:bg-gray-50" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700"
            disabled={!canSave}
            onClick={() => {
              if (selectedIdx == null) return
              const art = results[selectedIdx]
              onSave(art)
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default CardArtSelector
