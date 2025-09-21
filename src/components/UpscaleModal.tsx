import React from 'react'

export function UpscaleModal({ open, current, total }: { open: boolean; current: number; total: number }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded shadow-lg p-6 w-80 flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" aria-label="Loading" />
        <div className="text-gray-700 font-medium">Upscaling... {current}/{total}</div>
        <div className="w-full bg-gray-200 h-2 rounded overflow-hidden">
          <div className="bg-emerald-500 h-full transition-all" style={{ width: total > 0 ? `${(current / total) * 100}%` : '0%' }} />
        </div>
        <div className="text-xs text-gray-500">Stable Diffusion image enhancement in progress.</div>
      </div>
    </div>
  )
}
