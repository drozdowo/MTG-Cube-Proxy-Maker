import type { ParseError } from '@/lib/types'
import type React from 'react'

type Props = {
  value: string
  onChange: (v: string) => void
  errors: ParseError[]
}

export function CardListInput({ value, onChange, errors }: Props) {
  return (
    <div>
      <label className="block font-semibold mb-1.5">Card List</label>
      <textarea
        value={value}
  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        rows={14}
        className="w-full font-mono border border-gray-300 rounded p-2 min-h-40"
        placeholder={`One card per line\nUse Scryfall syntax if needed\nExample:\nLightning Bolt\nLightning Bolt\nToken: Saproling`}
      />
      {errors.length > 0 && (
        <ul className="text-red-600 mt-1.5 list-disc list-inside space-y-0.5">
          {errors.map((e, i) => (
            <li key={i}>Line {e.line}: {e.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
