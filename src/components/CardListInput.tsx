import React, { useEffect, useMemo, useRef, useState } from 'react'
import CardEntry from './CardEntry'
import type { ParseError } from '@/lib/types'

type Item = { id: number; value: string }

type Props = {
  value?: string
  onChange?: (next: string) => void
  errors?: ParseError[]
}

export function CardListInput({ value, onChange: onChangeProp }: Props) {
  const initialItems = useMemo<Item[]>(() => {
    const lines = (value ?? '').split(/\r?\n/)
    const vals = lines.length > 0 ? lines : ['']
    return vals.map((v, i) => ({ id: i, value: v }))
  }, [])

  const [items, setItems] = useState<Item[]>(initialItems)
  // Monotonic id generator seeded from initial items to avoid collisions.
  const nextId = useRef(initialItems.length > 0 ? Math.max(...initialItems.map(i => i.id)) + 1 : 1)

  // When the external value changes (e.g., loaded from localStorage),
  // sync our internal list to reflect it so the UI shows saved cards.
  useEffect(() => {
    const external = (value ?? '')
    const current = items.map(i => i.value).join('\n')
    if (external !== current) {
      const lines = external.split(/\r?\n/)
      const vals = lines.length > 0 ? lines : ['']
      const next: Item[] = vals.map((v, i) => ({ id: i, value: v }))
      setItems(next)
      nextId.current = next.length > 0 ? Math.max(...next.map(i => i.id)) + 1 : 1
    }
  }, [value])

  // Map of input elements by item id for focus management
  const inputRefs = useRef(new Map<number, HTMLInputElement>())
  const pendingFocusId = useRef<number | null>(null)

  // Focus the requested input after list updates
  useEffect(() => {
    if (pendingFocusId.current != null) {
      const el = inputRefs.current.get(pendingFocusId.current)
      if (el) el.focus()
      pendingFocusId.current = null
    }
  }, [items])

  const setInputRef = (id: number) => (el: HTMLInputElement | null) => {
    if (el) inputRefs.current.set(id, el)
    else inputRefs.current.delete(id)
  }

  // Convenience helpers
  const lastItem = () => items[items.length - 1]
  const focusOrQueue = (id: number) => {
    const el = inputRefs.current.get(id)
    if (el) el.focus()
    else pendingFocusId.current = id
  }

  const emit = (list: Item[]) => {
    onChangeProp?.(list.map(i => i.value).join('\n'))
  }

  const onChange = (id: number, value: string) => {
    const next = items.map(it => (it.id === id ? { ...it, value } : it))
    setItems(next)
    emit(next)
  }

  // If the bottom row is empty, focus it; otherwise append a new empty row and focus it.
  const addBelowOrFocusBottom = (_afterId: number) => {
    const last = lastItem()
    if (last && last.value === '') {
      focusOrQueue(last.id)
      return
    }
    const newId = nextId.current++
    const next = [...items, { id: newId, value: '' }]
    setItems(next)
    emit(next)
    focusOrQueue(newId)
  }

  const removeAndFocusPrev = (id: number) => {
    const idx = items.findIndex(it => it.id === id)
    if (items.length === 1) {
      // keep at least one input; focus it
      pendingFocusId.current = items[0].id
      return
    }
    const prevId = items[Math.max(0, idx - 1)]?.id ?? items[0].id
    const next = items.filter(it => it.id !== id)
    setItems(next)
    emit(next)
  focusOrQueue(prevId)
  }

  // Wire existing CardEntry key behaviors to our list ops
  const onSubmit = (id: number) => addBelowOrFocusBottom(id)
  const onErase = (id: number) => removeAndFocusPrev(id)

  // Handle pasting multiple lines into a single input: split into rows
  const onPaste = (id: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text') ?? ''
    if (!text) return
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
    if (lines.length <= 1) return // single-line paste behaves normally

    e.preventDefault()

    // Update current row with first line, insert additional rows below
    const idx = items.findIndex(it => it.id === id)
    if (idx === -1) return

    const first = lines[0]
    const rest = lines.slice(1)

    const updatedCurrent = items.map(it => (it.id === id ? { ...it, value: first } : it))

    // Build new items for remaining lines
    const newItems: Item[] = rest.map(v => ({ id: nextId.current++, value: v }))

    const nextList = [
      ...updatedCurrent.slice(0, idx + 1),
      ...newItems,
      ...updatedCurrent.slice(idx + 1),
    ]

    setItems(nextList)
    emit(nextList)

    // Focus the last inserted item if any, otherwise current
    const focusId = newItems.length > 0 ? newItems[newItems.length - 1].id : id
    focusOrQueue(focusId)
  }

  return (
    <div className="border border-gray-300 rounded p-2">
      <label className="block font-semibold mb-1.5">Card List</label>
      <hr className="w-full" />
      {items.map(item => (
        <CardEntry
          key={item.id}
          id={item.id}
          value={item.value}
          onChange={onChange}
          onSubmit={onSubmit}
          onErase={onErase}
          onPaste={(evt) => onPaste(item.id, evt)}
          inputRef={setInputRef(item.id)}
        />
      ))}
    </div>
  )
}
