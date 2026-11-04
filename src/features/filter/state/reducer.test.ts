import { expect, test } from 'vitest'
import { MAX_BLOCK_NAME, MAX_LOADS, MAX_TOL } from '../engine'
import { mkLoad } from './defaults'
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

test('tran: cable values clamped like adopt(); off on the Time tab → Zout', () => {
  const r = (patch: Partial<typeof base.tran>) =>
    reducer(base, { t: 'tran', patch }).tran
  expect(r({ lCable: 1 }).lCable).toBe(100e-6)
  expect(r({ lCable: -1 }).lCable).toBe(0)
  expect(r({ rCable: 50 }).rCable).toBe(10)
  expect(r({ rCable: 0.1 }).rCable).toBe(0.1)
  const on = reducer(base, { t: 'tran', patch: { on: true } })
  const onTab = reducer(on, { t: 'plot', patch: { tab: 'time' } })
  const off = reducer(onTab, { t: 'tran', patch: { on: false } })
  expect(off.plot.tab).toBe('zout')
  const zin = reducer(reducer(on, { t: 'plot', patch: { tab: 'zin' } }), {
    t: 'tran',
    patch: { on: false },
  })
  expect(zin.plot.tab).toBe('zin')
  expect(base.tran.on).toBe(false) // not mutated
})

test('loads: add, set, move, dup, delete; at most 5; no mutation', () => {
  const l = (id: string, name = id) => mkLoad(base.conv, name, {}, id)
  let st = reducer(base, { t: 'loadAdd', load: l('x1') })
  expect(base.loads).toEqual([])
  expect(st.loads.map((x) => x.id)).toEqual(['x1'])
  st = reducer(st, { t: 'loadAdd', load: l('x2') })
  st = reducer(st, { t: 'loadSet', id: 'x2', patch: { pout: 3, on: false } })
  expect(st.loads[1]).toMatchObject({ pout: 3, on: false })
  st = reducer(st, { t: 'loadSet', id: 'x1', patch: { name: 'n'.repeat(90) } })
  expect(st.loads[0].name).toHaveLength(MAX_BLOCK_NAME)
  st = reducer(st, { t: 'loadMove', id: 'x2', dir: -1 })
  expect(st.loads.map((x) => x.id)).toEqual(['x2', 'x1'])
  expect(reducer(st, { t: 'loadMove', id: 'x2', dir: -1 })).toBe(st)
  st = reducer(st, { t: 'loadDup', id: 'x2', newId: 'x3' })
  expect(st.loads.map((x) => x.id)).toEqual(['x2', 'x3', 'x1'])
  expect(st.loads[1].pout).toBe(3)
  st = reducer(st, { t: 'loadDel', id: 'x3' })
  expect(st.loads.map((x) => x.id)).toEqual(['x2', 'x1'])
  // Unknown ids leave the state as it is (no undo step).
  for (const a of [
    { t: 'loadSet', id: 'no', patch: { pout: 1 } },
    { t: 'loadDel', id: 'no' },
    { t: 'loadDup', id: 'no', newId: 'y' },
  ] as Action[])
    expect(reducer(st, a)).toBe(st)
  for (let i = 4; i < 10; i++)
    st = reducer(st, { t: 'loadAdd', load: l('x' + i) })
  expect(st.loads).toHaveLength(MAX_LOADS)
  expect(reducer(st, { t: 'loadDup', id: 'x1', newId: 'z' })).toBe(st)
})

test('loads: a drag on one field is one undo step; undo removes an added one', () => {
  let h = emptyHistory()
  let st = base
  const step = (a: Action, now: number) => {
    const next = reducer(st, a)
    h = record(h, st, next, a, now)
    st = next
  }
  step({ t: 'loadAdd', load: mkLoad(base.conv, 'A', {}, 'a') }, 0)
  for (let i = 0; i < 5; i++)
    step({ t: 'loadSet', id: 'a', patch: { pout: 1 + i } }, 5000 + i * 100)
  expect(h.past).toHaveLength(2)
  let u = undo(h, st)!
  expect(u.st.loads[0].pout).toBe(base.conv.pout)
  u = undo(u.hist, u.st)!
  expect(u.st.loads).toEqual([])
})
