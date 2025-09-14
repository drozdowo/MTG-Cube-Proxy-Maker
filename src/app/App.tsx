import { useMemo, useState } from 'react'
import { CardListInput } from '@/components/CardListInput'
import { BackPicker } from '@/components/CardBack/BackPicker'
import { OptionsPanel } from '@/components/Options'
import { Preview } from '@/components/Preview'
import { CardArtSelector } from '@/components/CardArtSelector'
import { parseInput } from '@/lib/parse'
import { scryfallFetch } from '@/lib/scryfall'
import { buildLayout } from '@/lib/layout'
import { exportToPdf, exportToPngs } from '@/lib/export'
import { pageService } from '@/lib/pageService'
import type { LayoutPages } from '@/lib/types'
import type { ExportOptions } from '@/lib/types'
import cardback from '../components/CardBack/cardback.jpg' // Ensure webpack includes default back image
import { ensureCorsSafe } from '@/lib/image'

// Use shared helper for CORS-safe image URLs

export function App() {
  const [raw, setRaw] = useState('Lightning Bolt\nCounterspell')
  const [defaultBack, setDefaultBack] = useState<string | null>(cardback)
  const [options, setOptions] = useState<ExportOptions>({
    dpi: 600,
    paper: 'A4',
    bleed: 0,
    margin: 10,
    orientation: 'portrait',
    alignmentOffsetX: 0,
    alignmentOffsetY: 0,
  })

  const parsed = useMemo(() => parseInput(raw), [raw])

  const [busy, setBusy] = useState(false)
  const [pages, setPages] = useState<LayoutPages | null>(null)
  const [issues, setIssues] = useState<string[]>([])

  // Modal state for picking alternate art
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerCardName, setPickerCardName] = useState<string | null>(null)
  const [pickerTarget, setPickerTarget] = useState<{ pageNumber: number; cardNumber: number } | null>(null)

  async function handleGenerate() {
    setBusy(true)
    setIssues([])
    try {
      console.log(parsed.items)
      const imgs = await scryfallFetch(parsed.items)
  const layout = await buildLayout(imgs, { ...options, defaultBack })
  setPages(layout)
  pageService.setFromLayout(layout)
    } catch (e: any) {
      setIssues([String(e?.message || e)])
    } finally {
      setBusy(false)
    }
  }

  async function handleExport(kind: 'pdf' | 'png') {
    if (!pages) return
    if (kind === 'pdf') await exportToPdf(pages, options)
    else await exportToPngs(pages, options)
  }

  function openPicker(pageNumber: number, cardNumber: number, cardName?: string) {
    console.log('open picker', pageNumber, cardNumber, cardName)
    setPickerTarget({ pageNumber, cardNumber })
    setPickerCardName(cardName ?? null)
    setPickerOpen(true)
  }

  function applySelectedArt(url: string) {

    if (!pickerTarget) return
    const { pageNumber, cardNumber } = pickerTarget
  pageService.replaceFront(pageNumber, cardNumber, ensureCorsSafe(url))
    setPages(pageService.toLayoutPages())
  }

  return (
    <div className="grid [grid-template-columns:360px_1fr] gap-4 p-4">
      <div className="grid gap-3 content-start">
        <CardListInput value={raw} onChange={setRaw} errors={parsed.errors} />
        <BackPicker value={defaultBack} onChange={setDefaultBack} />
        <OptionsPanel value={options} onChange={setOptions} onGenerate={handleGenerate} busy={busy} />
        <div className="flex gap-2">
          <button
            className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
            onClick={() => handleExport('pdf')}
            disabled={!pages || busy}
          >
            Export PDF
          </button>
          <button
            className="px-3 py-1.5 rounded bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-700"
            onClick={() => handleExport('png')}
            disabled={!pages || busy}
          >
            Export PNG
          </button>
        </div>
        {issues.length > 0 && (
          <div className="text-red-600">
            <strong>Issues:</strong>
            <ul>
              {issues.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <Preview pages={pages} onCardClick={(p, i, name) => openPicker(p, i, name)} />
      <CardArtSelector
        open={pickerOpen}
        name={pickerCardName}
        onClose={() => setPickerOpen(false)}
        onSave={(art) => {
          applySelectedArt(art.url)
          setPickerOpen(false)
        }}
      />
    </div>
  )
}

// Minimal shared types for initial compile
// types moved to lib/types
