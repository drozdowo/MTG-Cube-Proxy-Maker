import React, { useEffect, useMemo, useRef, useState } from 'react'
import { searchAlternateArts } from '../lib/scryfall/search'

// Utility: read a File as DataURL
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// Resize image (maintain aspect) so max dimension <= maxPx; return PNG DataURL
async function resizeImage(dataUrl: string, maxPx = 1500): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width <= maxPx && height <= maxPx) {
        // Return original if already small enough
        resolve(dataUrl)
        return
      }
      const scale = Math.min(maxPx / width, maxPx / height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height)
        try {
          const out = canvas.toDataURL('image/png')
          resolve(out)
        } catch {
          resolve(dataUrl)
        }
      } else {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

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
  // Ref to hidden file input used for custom uploads
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // State for a custom uploaded art (DataURL)
  const [customArt, setCustomArt] = useState<SelectedArt | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleUploadCustom = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  async function handleFileChosen(file: File) {
    setUploadError(null)
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file.')
      return
    }
    // Basic size guard (~8MB) to avoid huge DataURLs
    if (file.size > 8 * 1024 * 1024) {
      setUploadError('Image too large (max 8MB). Consider resizing first.')
      return
    }
    setUploading(true)
    try {
      const raw = await fileToDataUrl(file)
      const resized = await resizeImage(raw, 1500)
      setCustomArt({ url: resized, id: 'custom-upload', backUrl: null })
      setSelectedIdx(null) // clear Scryfall selection
    } catch (e: any) {
      setUploadError(String(e?.message || 'Failed to load image'))
    } finally {
      setUploading(false)
    }
  }

  function clearCustom() {
    setCustomArt(null)
  }

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

  const canSave = useMemo(() => {
    if (uploading) return false
    if (customArt) return true
    return selectedIdx != null && results[selectedIdx] != null
  }, [selectedIdx, results, customArt, uploading])

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

        {/* Hidden file input for 'Upload Custom'. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            void handleFileChosen(file)
          }}
        />

        {/* Body */}
        <div className="p-4 overflow-auto">
          {loading && <div className="text-gray-600">Searching Scryfall…</div>}
          {uploading && <div className="text-indigo-600 mb-2">Processing image…</div>}
          {uploadError && <div className="text-red-600 mb-2">{uploadError}</div>}
          {customArt && (
            <div className="mb-4">
              <div className="text-sm font-medium mb-1 flex items-center justify-between">
                <span>Custom Image</span>
                <button
                  className="text-xs px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-50"
                  onClick={clearCustom}
                >Remove</button>
              </div>
              <div className="relative w-40 border rounded overflow-hidden">
                <img src={customArt.url} className="block w-full h-auto" />
              </div>
            </div>
          )}
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
            className="px-3 py-1.5 rounded border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50"
            onClick={handleUploadCustom}
            disabled={uploading}
            title="Upload a custom image"
          >
            {uploading ? 'Uploading…' : 'Upload Custom'}
          </button>
          <button
            className="px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700"
            disabled={!canSave}
            onClick={() => {
              // Prefer custom uploaded art if present
              if (customArt) {
                onSave(customArt)
                return
              }
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
