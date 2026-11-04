// Part tolerances (M1b, docs/M1-plan.md): rng, percentile, tolItems,
// applyTol, extremes and monteCarlo, checked against the NP-DR-26001 Q table
// and against cornerMetrics().
import { describe, expect, test } from 'vitest'
import { buildPreset, PRESET_NAMES } from '../state/presets'
import * as E from './index'
import type { Block, CapBlock, Design } from './index'

/** PASS when |got − want| ≤ |want|·tolPct/100. */
function near(name: string, got: () => number, want: number, tolPct = 2) {
  test(`${name} (want ${want} ±${tolPct}%)`, () => {
    const g = got()
    expect(Math.abs(g - want), `got ${g}, want ${want}`).toBeLessThanOrEqual(
      (Math.abs(want) * tolPct) / 100
    )
  })
}
/** Computed once, on first use. */
function lazy<T>(fn: () => T): () => T {
  let v: T | undefined
  return () => (v === undefined ? (v = fn()) : v)
}
/** Preset with every tol removed, so each test sets its own. */
function preset(name: string): Design {
  const i = PRESET_NAMES.indexOf(name)
  if (i < 0) throw new Error('no preset ' + name)
  const st = buildPreset(i)
  return {
    ...st,
    blocks: st.blocks.map((b) => {
      const c = { ...b }
      delete c.tol
      return c
    }),
  }
}
/** Copy of st with fn applied to the block named name (not type-checked). */
function edit(st: Design, name: string, fn: (b: Block) => object): Design {
  if (!st.blocks.some((b) => b.name === name))
    throw new Error('no block ' + name)
  return {
    ...st,
    blocks: st.blocks.map((b) => (b.name === name ? (fn(b) as Block) : b)),
  }
}
const idOf = (st: Design, name: string) =>
  st.blocks.find((b) => b.name === name)!.id
const LQRX02 = 'LQRx 02 · 24→12 V 240 W, 2-phase'
const D1RC = 'D1 · LC + Rd-Cd, Q = 0.707'

// ---- rng and percentile ----
describe('rng', () => {
  test('same seed gives the same values', () => {
    const a = E.rng(42),
      b = E.rng(42)
    const va = Array.from({ length: 5 }, a)
    const vb = Array.from({ length: 5 }, b)
    expect(va).toEqual(vb)
  })
  test('a different seed gives different values', () => {
    const a = E.rng(1),
      b = E.rng(2)
    const va = Array.from({ length: 5 }, a)
    const vb = Array.from({ length: 5 }, b)
    expect(va).not.toEqual(vb)
  })
  test('1000 values all in [0, 1)', () => {
    const r = E.rng(7)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('percentile', () => {
  const a = Array.from({ length: 100 }, (_, i) => i + 1)
  test('nearest rank on 1..100', () => {
    expect(E.percentile(a, 0.01)).toBe(1)
    expect(E.percentile(a, 0.5)).toBe(50)
    expect(E.percentile(a, 1)).toBe(100)
    expect(E.percentile(a, 0)).toBe(1)
  })
  test('empty gives NaN', () => {
    expect(E.percentile([], 0.5)).toBeNaN()
  })
})

// ---- tolItems ----
describe('tolItems', () => {
  test('block order, then TOL_KEYS order; OFF, unused and bad tol skipped', () => {
    let s = preset(D1RC)
    s = edit(s, 'L1', (b) => ({
      ...b,
      dmode: 'none',
      tol: { dR: 10, L: 30, dL: 5 },
    }))
    s = edit(s, 'C1', (b) => ({ ...b, tol: { c: 0 } }))
    s = edit(s, 'Rd1', (b) => ({ ...b, tol: { cd: 20, rd: 5 } }))
    expect(E.tolItems(s)).toEqual([
      { id: idOf(s, 'L1'), key: 'L', tol: 30 },
      { id: idOf(s, 'Rd1'), key: 'rd', tol: 5 },
      { id: idOf(s, 'Rd1'), key: 'cd', tol: 20 },
    ])
    // Damping keys count once a mode uses them.
    const r = edit(s, 'L1', (b) => ({ ...b, dmode: 'R' }))
    expect(E.tolItems(r).map((i) => i.key)).toEqual(['L', 'dR', 'rd', 'cd'])
    const rl = edit(s, 'L1', (b) => ({ ...b, dmode: 'RLser' }))
    expect(E.tolItems(rl).map((i) => i.key)).toEqual([
      'L',
      'dR',
      'dL',
      'rd',
      'cd',
    ])
    // OFF block, negative, NaN and Infinity.
    const off = edit(s, 'Rd1', (b) => ({ ...b, on: false }))
    expect(E.tolItems(off).map((i) => i.key)).toEqual(['L'])
    const bad = edit(s, 'L1', (b) => ({ ...b, tol: { L: -5 } }))
    const bad2 = edit(bad, 'C1', (b) => ({ ...b, tol: { c: NaN } }))
    const bad3 = edit(bad2, 'Rd1', (b) => ({
      ...b,
      tol: { rd: Infinity, cd: 0 },
    }))
    expect(E.tolItems(bad3)).toEqual([])
  })
})

// ---- no tolerances: same numbers as cornerMetrics() ----
{
  const s = lazy(() => preset(LQRX02))
  test('no tolerances: extremes() equals cornerMetrics() per corner', () => {
    const cm = E.cornerMetrics(s())
    const ex = E.extremes(s())!
    expect(ex).toHaveLength(cm.rows.length)
    ex.forEach((row, i) => {
      expect(row.label).toBe(cm.rows[i].label)
      expect(row.nominal.margin).toBeCloseTo(cm.rows[i].margin, 9)
      expect(row.worst.margin).toBeCloseTo(cm.rows[i].margin, 9)
      expect(row.nominal.peak).toBeCloseTo(cm.rows[i].peak, 9)
      expect(row.signs).toEqual([])
      expect(row.qMin).toBe(row.nominal.q)
      expect(row.qMax).toBe(row.nominal.q)
    })
  })
  test('no tolerances: every Monte Carlo board is the worst corner', () => {
    const cm = E.cornerMetrics(s())
    const want = Math.min(...cm.rows.map((r) => r.margin))
    const mc = E.monteCarlo(s(), 20)
    expect(mc.n).toBe(20)
    expect(mc.items).toEqual([])
    expect(mc.board).toHaveLength(20)
    for (const v of mc.board) expect(v).toBeCloseTo(want, 9)
    expect(mc.worstBoard).toEqual({ index: 0, d: [] })
  })
}

// ---- NP-DR-26001 Q table (report.md:229-235), Rd 1.06 Ω fixed ----
{
  const s = lazy(() => preset(D1RC))
  const qAt = (d: number[]) => {
    const st = s()
    const items: E.TolItem[] = [
      { id: idOf(st, 'L1'), key: 'L', tol: 30 },
      { id: idOf(st, 'C1'), key: 'c', tol: 40 },
    ]
    const base = E.atCorner(st, E.corners(st)[0])
    return E.evalCase(E.applyTol(base, items, d)).q!
  }
  near('D1 Q nominal (report 0.71)', () => qAt([0, 0]), 0.71)
  near('D1 Q at L −30 % (report 0.84)', () => qAt([-0.3, 0]), 0.84)
  near('D1 Q at C −40 % (report 0.55)', () => qAt([0, -0.4]), 0.55)
  near('D1 Q at L −30 %, C −40 % (report 0.66)', () => qAt([-0.3, -0.4]), 0.66)
  const ex = lazy(
    () => E.extremes(edit(s(), 'L1', (b) => ({ ...b, tol: { L: 30 } })))![0]
  )
  near('D1 extremes with L ±30 %: qMax (report 0.84)', () => ex().qMax!, 0.84)
  // L −30 % gives the highest Q, but L +30 % gives the higher peak (Z0 grows
  // with L), so the worst margin is the + case.
  test('D1 extremes with L ±30 %: worst margin is L +30 %', () => {
    expect(ex().signs).toEqual([1])
    expect(ex().worst.margin).toBeLessThan(ex().nominal.margin)
    expect(ex().qMax).toBeCloseTo(qAt([-0.3, 0]), 12)
  })
}

// ---- applyTol ----
describe('applyTol', () => {
  test('changes only the listed blocks; others stay shared', () => {
    const s = preset(D1RC)
    const items: E.TolItem[] = [{ id: idOf(s, 'L1'), key: 'L', tol: 30 }]
    const t = E.applyTol(s, items, [-0.3])
    expect((t.blocks[0] as E.IndBlock).L).toBeCloseTo(22e-6 * 0.7, 18)
    expect((s.blocks[0] as E.IndBlock).L).toBe(22e-6)
    expect(t.blocks[1]).toBe(s.blocks[1])
    expect(t.blocks[2]).toBe(s.blocks[2])
  })
  test('the change applies after the C-vs-V curve', () => {
    const cv: E.Curve = [
      [0, 10e-6],
      [48, 6e-6],
    ]
    const s = edit(preset(LQRX02), 'Cf', (b) => ({
      ...(b as CapBlock),
      derate: 0,
      cv,
      tol: { c: 10 },
    }))
    const items = E.tolItems(s)
    expect(items).toHaveLength(1)
    const k = s.blocks.findIndex((b) => b.name === 'Cf')
    for (const c of E.corners(s)) {
      const t = E.applyTol(E.atCorner(s, c), items, [-0.1])
      const got = (t.blocks[k] as CapBlock).c
      const want = 0.9 * E.interp(cv, c.vin)
      expect(Math.abs(got - want) / want).toBeLessThanOrEqual(1e-12)
    }
  })
})

// ---- more than 8 items ----
test('nine tolerances: extremes() is null, monteCarlo() still runs', () => {
  const s0 = preset(D1RC)
  const caps: Block[] = Array.from({ length: 9 }, (_, i) => ({
    ...(s0.blocks[1] as CapBlock),
    id: 'tc' + i,
    name: 'TC' + i,
    c: 1e-6,
    tol: { c: 10 },
  }))
  const s: Design = { ...s0, blocks: [...s0.blocks, ...caps] }
  expect(E.tolItems(s)).toHaveLength(9)
  expect(E.extremes(s)).toBeNull()
  const mc = E.monteCarlo(s, 10)
  expect(mc.board).toHaveLength(10)
  expect(mc.worstBoard.d).toHaveLength(9)
})

// ---- Monte Carlo: one draw is one board ----
{
  const s = lazy(() => {
    let st = preset(LQRX02)
    st = edit(st, 'Cf', (b) => ({ ...b, tol: { c: 20 } }))
    st = edit(st, 'L101', (b) => ({ ...b, tol: { L: 20 } }))
    return st
  })
  const N = 30
  const mc = lazy(() => E.monteCarlo(s(), N, 5))
  test('LQRx 02 with tolerances has 3 corners and 2 items', () => {
    expect(E.corners(s())).toHaveLength(3)
    expect(mc().items.map((i) => i.key)).toEqual(['L', 'c'])
  })
  test('board value is the lowest corner margin of the same draw', () => {
    const items = E.tolItems(s())
    const r = E.rng(5)
    const ds: number[][] = []
    for (let j = 0; j < N; j++)
      ds.push(items.map((it) => (it.tol / 100) * (2 * r() - 1)))
    for (const j of [0, 7, N - 1]) {
      const want = Math.min(
        ...E.corners(s()).map(
          (c) => E.evalCase(E.applyTol(E.atCorner(s(), c), items, ds[j])).margin
        )
      )
      expect(mc().board[j]).toBe(want)
    }
    const w = mc().worstBoard
    expect(w.d).toEqual(ds[w.index])
    expect(mc().board[w.index]).toBe(Math.min(...mc().board))
    for (const d of ds)
      d.forEach((x, i) =>
        expect(Math.abs(x)).toBeLessThanOrEqual(items[i].tol / 100)
      )
  })
  test('per-corner stats are ordered and the worst corner bounds the board', () => {
    for (const c of mc().corners) {
      expect(c.worst).toBeLessThanOrEqual(c.p1)
      expect(c.p1).toBeLessThanOrEqual(c.median)
    }
    expect(Math.min(...mc().corners.map((c) => c.worst))).toBe(
      Math.min(...mc().board)
    )
  })
  test('two runs give the same result', () => {
    const again = E.monteCarlo(s(), N, 5)
    expect(Array.from(again.board)).toEqual(Array.from(mc().board))
    expect(again.corners).toEqual(mc().corners)
    expect(again.worstBoard).toEqual(mc().worstBoard)
  })
  test('progress every 25 draws and at the end; n clamped', () => {
    const seen: number[] = []
    E.monteCarlo(s(), N, 5, (k) => seen.push(k))
    expect(seen).toEqual([25, 30])
    expect(E.monteCarlo(s(), 0).n).toBe(1)
    expect(E.monteCarlo(s(), 2.7).n).toBe(2)
    expect(E.monteCarlo(s(), NaN).n).toBe(1)
  })
  test('inputs are not changed', () => {
    const before = JSON.stringify(s())
    const items = E.tolItems(s())
    const itemsBefore = JSON.stringify(items)
    const d = [-0.2, 0.1]
    E.applyTol(s(), items, d)
    E.extremes(s())
    E.monteCarlo(s(), 5)
    expect(JSON.stringify(s())).toBe(before)
    expect(JSON.stringify(items)).toBe(itemsBefore)
    expect(d).toEqual([-0.2, 0.1])
  })
}
