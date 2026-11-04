import { expect, it } from 'vitest'
import { initialDesign, LS_BACKUP_KEY } from './persist'

// Lesson 11: an unreadable saved design is kept before the next save
// overwrites it (bug hunt 2026-11-05).
it('keeps a copy of an unreadable saved design and says so', () => {
  const mem = new Map<string, string>()
  const fake = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  }
  const g = globalThis as { localStorage?: unknown }
  const old = g.localStorage
  g.localStorage = fake
  try {
    mem.set('input-filter-tuner-v1', '{cut short')
    const r = initialDesign()
    expect(r.st.blocks.length).toBeGreaterThan(0) // preset 1
    expect(mem.get(LS_BACKUP_KEY)).toBe('{cut short')
    expect(r.warning).toContain(LS_BACKUP_KEY)
    // A readable design loads with no warning and no copy.
    mem.clear()
    mem.set('input-filter-tuner-v1', JSON.stringify(r.st))
    expect(initialDesign().warning).toBeUndefined()
    expect(mem.has(LS_BACKUP_KEY)).toBe(false)
  } finally {
    g.localStorage = old
  }
})
