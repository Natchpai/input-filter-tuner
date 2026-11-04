import { expect, test } from 'vitest'
import { MAX_TOL } from '../engine'
import { emptyHistory, record, undo } from './history'
import { buildPreset } from './presets'
import { type Action, reducer } from './reducer'

const base = buildPreset(0) // D1 LC undamped: no tol anywhere
const id = base.blocks.find((b) => b.type === 'cap')!.id
const tolOf = (st: typeof base) =>
  (st.blocks.find((b) => b.id === id) as { tol?: Record<string, number> }).tol
const act = (v: number): Action => ({ t: 'tol', id, k: 'c', v })

test('tol: set, change, clamp', () => {
  const a = reducer(base, act(10))
  expect(tolOf(a)).toEqual({ c: 10 })
  expect(tolOf(base)).toBeUndefined() // not mutated
  expect(tolOf(reducer(a, act(25)))).toEqual({ c: 25 })
  expect(tolOf(reducer(a, act(500)))).toEqual({ c: MAX_TOL })
})

test('tol: deleting the last key removes tol from the block', () => {
  const a = reducer(base, act(10))
  for (const v of [0, -1, NaN, Infinity * -1]) {
    const b = reducer(a, act(v))
    const blk = b.blocks.find((x) => x.id === id)!
    expect('tol' in blk).toBe(false)
  }
  const two = reducer(
    reducer(base, { t: 'tol', id: base.blocks[0].id, k: 'L', v: 5 }),
    { t: 'tol', id: base.blocks[0].id, k: 'dR', v: 7 }
  )
  const one = reducer(two, {
    t: 'tol',
    id: base.blocks[0].id,
    k: 'L',
    v: 0,
  })
  expect((one.blocks[0] as { tol?: object }).tol).toEqual({ dR: 7 })
})

test('tol: no change returns the same state', () => {
  const a = reducer(base, act(10))
  expect(reducer(a, act(10))).toBe(a)
  expect(reducer(a, act(MAX_TOL + 5))).not.toBe(a)
  expect(reducer(base, act(0))).toBe(base)
  expect(reducer(base, act(NaN))).toBe(base)
  expect(reducer(base, { t: 'tol', id: 'nope', k: 'c', v: 5 })).toBe(base)
})

test('tol: same-key changes group into one undo step', () => {
  let st = base
  let h = emptyHistory()
  for (const [v, now] of [
    [5, 1000],
    [6, 1100],
    [7, 1200],
  ] as const) {
    const next = reducer(st, act(v))
    h = record(h, st, next, act(v), now)
    st = next
  }
  expect(tolOf(st)).toEqual({ c: 7 })
  const u = undo(h, st)
  expect(u && tolOf(u.st)).toBeUndefined()
})

test('emi: turning it off on the EMI tab goes back to Zout', () => {
  const on = reducer(base, { t: 'emi', patch: { on: true } })
  expect(on.emi.on).toBe(true)
  expect(on.plot.tab).toBe(base.plot.tab)
  const onTab = reducer(on, { t: 'plot', patch: { tab: 'emi' } })
  const off = reducer(onTab, { t: 'emi', patch: { on: false } })
  expect(off.emi.on).toBe(false)
  expect(off.plot.tab).toBe('zout')
  const zin = reducer(reducer(on, { t: 'plot', patch: { tab: 'zin' } }), {
    t: 'emi',
    patch: { on: false },
  })
  expect(zin.plot.tab).toBe('zin')
  expect(base.emi.on).toBe(false) // not mutated
})

test('emi: tr and margin are clamped like adopt()', () => {
  const r = (patch: Partial<typeof base.emi>) =>
    reducer(base, { t: 'emi', patch }).emi
  expect(r({ tr: 2e-6 }).tr).toBe(1e-6)
  expect(r({ tr: -1 }).tr).toBe(0)
  expect(r({ margin: 99 }).margin).toBe(40)
  expect(r({ margin: -3 }).margin).toBe(0)
  expect(r({ tr: 5e-9 }).tr).toBe(5e-9)
})

test('dup keeps block names within 40 characters', () => {
  const b0 = base.blocks[0]
  const long = reducer(base, {
    t: 'patch',
    id: b0.id,
    patch: { name: 'x'.repeat(40) },
  })
  const d = reducer(long, { t: 'dup', id: b0.id, newId: 'nx' })
  const copy = d.blocks.find((b) => b.id === 'nx')!
  expect(copy.name.length).toBe(40)
  const short = reducer(base, { t: 'dup', id: b0.id, newId: 'ny' })
  expect(short.blocks.find((b) => b.id === 'ny')!.name).toBe(b0.name + "'")
})
