import { describe, expect, it } from 'vitest'
import {
  BACKUP_KEY,
  loadLibrary,
  MAX_ITEMS,
  MAX_NAME,
  parseLibrary,
  type SavedDesign,
  withItem,
} from './library'
import { buildPreset } from './presets'

const d = buildPreset(1)
const item = (over: Partial<SavedDesign> = {}) => ({
  id: 'a',
  name: 'A',
  savedAt: 1,
  overlay: true,
  auto: false,
  design: d,
  ...over,
})
const lib = (items: unknown[]) => ({ v: 1, items })
/** As it comes back from localStorage. */
const roundTrip = (x: unknown) => JSON.parse(JSON.stringify(x))

describe('parseLibrary (hostile storage)', () => {
  it('rejects anything that is not the v1 shape', () => {
    for (const raw of [
      null,
      'x',
      42,
      [],
      {},
      { v: 2, items: [] },
      { v: 1, items: 'x' },
      { v: 1 },
    ])
      expect(parseLibrary(raw)).toEqual([])
  })

  it('reads a good item and runs its design through adopt', () => {
    const [x] = parseLibrary(roundTrip(lib([item()])))
    expect(x.name).toBe('A')
    expect(x.overlay).toBe(true)
    expect(x.auto).toBe(false)
    expect(x.design.blocks.length).toBe(d.blocks.length)
    expect(x.design.conv).toEqual(d.conv)
  })

  it('drops bad items and keeps the good ones', () => {
    const out = parseLibrary(
      roundTrip(
        lib([
          null,
          'x',
          { id: 'b', name: 'no design' },
          { id: 'c', name: 'bad design', design: { blocks: 'x' } },
          item({ id: 'ok' }),
        ])
      )
    )
    expect(out.map((x) => x.id)).toEqual(['ok'])
  })

  it('cleans fields: names, flags, dates, ids', () => {
    const [x, y] = parseLibrary(
      roundTrip(
        lib([
          {
            ...item(),
            name: 'a\nb\u0000c' + 'x'.repeat(500),
            overlay: 'yes',
            auto: 1,
            savedAt: 'never',
            id: { evil: 1 },
          },
          { ...item(), id: 'a', name: '' },
        ])
      )
    )
    expect(x.name).toHaveLength(MAX_NAME)
    expect(x.name.startsWith('a b c')).toBe(true)
    expect(x.overlay).toBe(false)
    expect(x.auto).toBe(false)
    expect(x.savedAt).toBe(0)
    expect(typeof x.id).toBe('string')
    expect(y.name).toBe(d.name) // empty name falls back to the design name
    expect(y.id).not.toBe(x.id)
  })

  it('makes duplicate ids unique', () => {
    const out = parseLibrary(roundTrip(lib([item(), item(), item()])))
    expect(new Set(out.map((x) => x.id)).size).toBe(3)
  })

  it('caps 1000 items at MAX_ITEMS', () => {
    const many = Array.from({ length: 1000 }, (_, i) => item({ id: 'i' + i }))
    expect(parseLibrary(roundTrip(lib(many)))).toHaveLength(MAX_ITEMS)
  })
})

describe('withItem', () => {
  const full = (auto: boolean) =>
    Array.from({ length: MAX_ITEMS }, (_, i) => item({ id: 'i' + i, auto }))

  it('adds to a list with room', () => {
    expect(withItem([item()], item({ id: 'b' }))).toHaveLength(2)
  })

  it('drops the oldest snapshot when full', () => {
    const list = full(false)
    list[3] = item({ id: 'snap', auto: true })
    const out = withItem(list, item({ id: 'new' }))!
    expect(out).toHaveLength(MAX_ITEMS)
    expect(out.some((x) => x.id === 'snap')).toBe(false)
    expect(out[out.length - 1].id).toBe('new')
  })

  it('refuses when full of named designs', () => {
    expect(withItem(full(false), item({ id: 'new' }))).toBeNull()
  })
})

describe('loadLibrary keeps an unreadable list', () => {
  const mem = new Map<string, string>()
  const fake = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  }
  const KEY = 'input-filter-tuner-designs-v1'
  it('copies bad JSON and unknown versions to the backup key once', () => {
    const old = (globalThis as { localStorage?: unknown }).localStorage
    ;(globalThis as { localStorage?: unknown }).localStorage = fake
    try {
      mem.clear()
      mem.set(KEY, '{not json')
      expect(loadLibrary()).toEqual([])
      expect(mem.get(BACKUP_KEY)).toBe('{not json')
      mem.set(KEY, JSON.stringify({ v: 2, items: [] }))
      loadLibrary()
      expect(mem.get(BACKUP_KEY)).toBe('{not json') // first copy kept
      mem.clear()
      mem.set(KEY, JSON.stringify(lib([item()])))
      expect(loadLibrary()).toHaveLength(1)
      expect(mem.has(BACKUP_KEY)).toBe(false)
    } finally {
      ;(globalThis as { localStorage?: unknown }).localStorage = old
    }
  })
  it('an item with a bad name or time is dropped or defaulted, not thrown', () => {
    const out = parseLibrary(
      lib([
        item({ id: 'x', name: { toString: 1 } as unknown as string }),
        item({ id: 'y', savedAt: 'soon' as unknown as number }),
      ])
    )
    expect(out.map((x) => x.id)).toEqual(['x', 'y'])
    expect(out[0].name).toBe(d.name)
    expect(out[1].savedAt).toBe(0)
  })
})
