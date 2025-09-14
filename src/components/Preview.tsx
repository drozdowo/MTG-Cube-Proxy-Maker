import type { LayoutPages } from '@/lib/types'

type Props = {
  pages: LayoutPages | null
}

export function Preview({ pages }: Props) {
  if (!pages) {
  return <div className="text-gray-500">No pages yet. Generate to preview.</div>
  }
  return (
  <div className="grid grid-cols-2 gap-3">
      {pages.map((p) => (
    <div key={p.id} className="border border-gray-300 p-2 rounded">
      <div className="mb-1.5 font-semibold">{p.role.toUpperCase()} — {p.id}</div>
      <div className="grid grid-cols-3 gap-1">
            {p.images.map((img, i) => (
        <img key={i} src={img.url} className="w-full bg-gray-50" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
