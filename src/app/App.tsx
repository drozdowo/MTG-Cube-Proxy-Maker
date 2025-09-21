import { useEffect, useMemo, useRef, useState } from 'react'
import { CardListInput } from '@/components/CardListInput'
import { BackPicker } from '@/components/CardBack/BackPicker'
import { OptionsPanel } from '@/components/Options'
import { Preview } from '@/components/Preview'
import { CardArtSelector, type SelectedArt } from '@/components/CardArtSelector'
import { parseInput } from '@/lib/parse'
import { scryfallFetch } from '@/lib/scryfall'
import { buildLayout } from '@/lib/layout'
import { exportToPdf, exportToPngs, printPages } from '@/lib/export'
import { pageService } from '@/lib/pageService'
import type { LayoutPages } from '@/lib/types'
import type { ExportOptions } from '@/lib/types'
import cardback from '../components/CardBack/cardback.jpg' // Ensure webpack includes default back image
import { ensureCorsSafe } from '@/lib/image'

// Use shared helper for CORS-safe image URLs

export function App() {
  const [raw, setRaw] = useState(``)
  const [defaultBack, setDefaultBack] = useState<string | null>(cardback)
  const [options, setOptions] = useState<ExportOptions>({
    dpi: 360,
    paper: 'Letter',
    bleed: 1,
    margin: 10,
    orientation: 'portrait',
    alignmentOffsetX: 0,
    alignmentOffsetY: 0,
    printScaleCompensation: undefined,
    printerPreset: 'epson-normal',
    drawCutMargins: true,
    upscaleWithSD: false,
  })

  const parsed = useMemo(() => parseInput(raw), [raw])

  const [busy, setBusy] = useState(false)
  const [pages, setPages] = useState<LayoutPages | null>(null)
  const [issues, setIssues] = useState<string[]>([])

  // Modal state for picking alternate art
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerCardName, setPickerCardName] = useState<string | null>(null)
  const [pickerTarget, setPickerTarget] = useState<{ pageNumber: number; cardNumber: number } | null>(null)

  // Store per-copy art overrides: key = `${cardName}#${occurrenceIndex}` (occurrence is 1-based in reading order)
  // Value = overridden front image URL
  const [artOverrides, setArtOverrides] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('mtgpm:artOverrides')
      if (raw) return JSON.parse(raw)
    } catch {}
    return {}
  })

  function persistOverrides(next: Record<string, string>) {
    setArtOverrides(next)
    try { localStorage.setItem('mtgpm:artOverrides', JSON.stringify(next)) } catch {}
  }

  function makeOverrideKey(name: string, occurrence: number) {
    return `${name}#${occurrence}`
  }

  /** Compute the occurrence index (1-based) for a given front slot identified by page/card. */
  function computeOccurrenceIndex(pageNumber: number, cardNumber: number, targetName?: string | null): number | null {
    if (!targetName) return null
    const all = pageService.getAll()
    let count = 0
    for (const rec of all) {
      if (rec.side !== 'front') continue
      if (rec.pageNumber > pageNumber) break
      for (let i = 0; i < rec.slots.length; i++) {
        const s = rec.slots[i]
        if (s.name === targetName) {
          count++
        }
        if (rec.pageNumber === pageNumber && i === cardNumber - 1) {
          // We've reached target slot
          return s.name === targetName ? count : null
        }
      }
    }
    return null
  }

  /** Apply stored overrides to a freshly built layout in-place. */
  function applyOverridesToLayout(layout: LayoutPages) {
    const nameCounts: Record<string, number> = {}
    const usedKeys = new Set<string>()
    for (const page of layout) {
      if (page.role !== 'front') continue
      for (const img of page.images) {
        if (!img.name) continue
        nameCounts[img.name] = (nameCounts[img.name] || 0) + 1
        const key = makeOverrideKey(img.name, nameCounts[img.name])
        const overrideUrl = artOverrides[key]
        if (overrideUrl) {
          img.url = ensureCorsSafe(overrideUrl)
          usedKeys.add(key)
        }
      }
    }
    // Prune overrides that no longer match (e.g. list changed) to avoid unbounded growth
    if (Object.keys(artOverrides).length) {
      const pruned: Record<string, string> = {}
      for (const k of Object.keys(artOverrides)) if (usedKeys.has(k)) pruned[k] = artOverrides[k]
      if (Object.keys(pruned).length !== Object.keys(artOverrides).length) {
        persistOverrides(pruned)
      }
    }
  }

  // Persist card list to localStorage and hydrate on load
  const STORAGE_KEY = 'mtgpm:cardlist'
  const hydratedRef = useRef(false)
  const shouldAutoGenerateRef = useRef(false)

  // Hydrate from localStorage once on mount
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && saved.trim()) {
        setRaw(saved)
        // Trigger a single auto-generate after parse updates
        shouldAutoGenerateRef.current = true
      }
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  }, [])

  // Save changes to localStorage (skip empty)
  useEffect(() => {
    try {
      const text = (raw ?? '').trim()
      if (text) {
        localStorage.setItem(STORAGE_KEY, raw)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // ignore storage errors
    }
  }, [raw])

  // After hydration, auto-generate once if a saved list existed
  useEffect(() => {
    if (!shouldAutoGenerateRef.current) return
    if (!parsed.items || parsed.items.length === 0) return
    // Clear flag first to avoid accidental double runs
    shouldAutoGenerateRef.current = false
    // Fire and forget
    handleGenerate()
  }, [parsed])

  async function handleGenerate() {
    setBusy(true)
    setIssues([])
    try {
      // Persist the current card list explicitly on generate
      try {
        const text = (raw ?? '').trim()
        if (text) {
          localStorage.setItem(STORAGE_KEY, raw)
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }
      } catch {
        // ignore storage errors
      }
      console.log(parsed.items)
      const imgs = await scryfallFetch(parsed.items)
      const layout = await buildLayout(imgs, { ...options, defaultBack })
      // Reapply any user-selected art overrides before updating services/state
      applyOverridesToLayout(layout)
      setPages(layout)
      pageService.setFromLayout(layout)
    } catch (e: any) {
      setIssues([String(e?.message || e)])
    } finally {
      setBusy(false)
    }
  }

  async function handleExport() {
    if (!pages) return
    await exportToPngs(pages, options)
  }

  function openPicker(pageNumber: number, cardNumber: number, cardName?: string) {
    console.log('open picker', pageNumber, cardNumber, cardName)
    setPickerTarget({ pageNumber, cardNumber })
    setPickerCardName(cardName ?? null)
    setPickerOpen(true)
  }

  function applySelectedArt(art: SelectedArt) {
    if (!pickerTarget) return
    const { pageNumber, cardNumber } = pickerTarget
    // Replace in current page service
    pageService.replaceFront(pageNumber, cardNumber, ensureCorsSafe(art.url))
    // Record per-copy override so future Generate keeps it
    const targetRec = pageService.get(pageNumber, 'front')
    const slot = targetRec?.slots[cardNumber - 1]
    const name = slot?.name || pickerCardName
    const occurrence = computeOccurrenceIndex(pageNumber, cardNumber, name || null)
    if (name && occurrence != null) {
      const key = makeOverrideKey(name, occurrence)
      persistOverrides({ ...artOverrides, [key]: art.url })
    }
    setPages(pageService.toLayoutPages())
  }

  return (
    <div className="grid [grid-template-columns:360px_1fr] gap-4 p-4">
      <div className="grid gap-3 content-start">
        <CardListInput value={raw} onChange={setRaw} errors={parsed.errors} />
        <button className="w-full px-3 py-1.5 rounded bg-red-400 text-white" onClick={() => {
          setRaw('')
          handleGenerate()
        }}>Clear</button>
        <BackPicker value={defaultBack} onChange={setDefaultBack} />
        <OptionsPanel
          value={options}
          onChange={setOptions}
          onGenerate={handleGenerate}
          busy={busy}
          onClearCustomImages={() => {
            persistOverrides({})
            // Regenerate to restore original art (since overrides mutated layout image urls)
            if (!busy) {
              void handleGenerate()
            }
          }}
          customImagesCount={Object.keys(artOverrides).length}
        />
        <div className="flex gap-2">
          <button
            className="w-full px-3 py-1.5 rounded bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-700"
            onClick={() => handleExport()}
            disabled={!pages || busy}
          >
            Export
          </button>
          <button
            className="w-full px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700"
            onClick={async () => { if (pages) { await printPages(pages, options) } }}
            disabled={!pages || busy}
          >
            Print
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
      <Preview pages={pages} onCardClick={(p, i, name) => openPicker(p, i, name)} drawCutMargins={options.drawCutMargins} bleed={options.bleed} />
      <CardArtSelector
        open={pickerOpen}
        name={pickerCardName}
        onClose={() => setPickerOpen(false)}
        onSave={(art) => {
          applySelectedArt(art)
          setPickerOpen(false)
        }}
      />
    </div>
  )
}

// Minimal shared types for initial compile
// types moved to lib/types
