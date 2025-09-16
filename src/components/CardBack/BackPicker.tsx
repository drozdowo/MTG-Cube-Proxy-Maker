import { useId } from 'react'

type Props = {
  value: string | null
  onChange: (v: string | null) => void
}

export function BackPicker({ value, onChange }: Props) {
  const inputId = useId()
  function handleFile(file: File | null) {
    if (!file) return onChange(null)
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result as string)
    reader.readAsDataURL(file);
  }

  return (
    <div className="border border-gray-300 rounded p-3 flex flex-col justify-center w-full">
      <label className="block font-semibold mb-1.5 text-center">Card Back</label>
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept="image/*"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={inputId}
        className="inline-flex items-center justify-center w-full sm:w-auto text-sm font-medium rounded bg-blue-600 text-white px-3 py-2 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        role="button"
        aria-label="Choose card back image"
      >
        Choose file
      </label>
      {value && (
        <div className="mt-2 flex justify-center">
          <div className="w-40 aspect-[63/88] relative border border-gray-300 rounded bg-gray-50 overflow-hidden">
            <img src={value} alt="Back preview" className="absolute inset-0 w-full h-full object-cover" />
          </div>
        </div>
      )}
    </div>
  )
}
