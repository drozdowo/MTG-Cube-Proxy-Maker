type Props = {
  value: string | null
  onChange: (v: string | null) => void
}

export function BackPicker({ value, onChange }: Props) {
  function handleFile(file: File | null) {
    if (!file) return onChange(null)
    const reader = new FileReader()
    reader.onload = () => onChange(reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <label className="block font-semibold mb-1.5">Default Card Back</label>
      <input className="block text-sm" type="file" accept="image/*" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
      {value && (
        <div className="mt-2">
          <img src={value} alt="Default back" className="max-w-40 border border-gray-300 rounded" />
        </div>
      )}
    </div>
  )
}
