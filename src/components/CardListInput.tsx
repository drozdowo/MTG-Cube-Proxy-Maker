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
          inputRef={setInputRef(item.id)}
        />
      ))}
    </div>
  )
}
