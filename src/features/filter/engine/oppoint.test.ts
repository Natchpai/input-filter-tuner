// Operating-point corners (M1a, docs/M1-plan.md): interp, corners, atCorner
// and cornerMetrics, checked against NP-DR-26004 (D4) and LQRx 02.
import { describe, expect, test } from 'vitest'
import { baseState } from '../state/defaults'
import { buildPreset, PRESET_NAMES } from '../state/presets'
import * as E from './index'
import type { BlockOf, BlockType, CapBlock, Conv, Design } from './index'

/** PASS when |got − want| ≤ |want|·tolPct/100. */
function near(name: string, got: () => number, want: number, tolPct = 2) {
  test(`${name} (want ${want} ±${tolPct}%)`, () => {
    const g = got()
    expect(Math.abs(g - want), `got ${g}, want ${want}`).toBeLessThanOrEqual(
      (Math.abs(want) * tolPct) / 100
    )
  })
}
/** PASS when |got − want| ≤ tol (absolute). */
function nearAbs(name: string, got: () => number, want: number, tol: number) {
  test(`${name} (want ${want} ±${tol})`, () => {
    const g = got()
    expect(Math.abs(g - want), `got ${g}, want ${want}`).toBeLessThanOrEqual(
      tol
    )
  })
}

let id = 0
function blk<T extends BlockType>(
  type: T,
  vals: Partial<BlockOf<T>> = {}
): BlockOf<T> {
  const b: Record<string, unknown> = {
    id: 'o' + id++,
    type,
    name: type,
    on: true,
  }
  for (const p of E.TYPES[type].p) b[p.key] = p.def
  if (type === 'ind') Object.assign(b, { dmode: 'none', dR: 1, dL: 1e-6 })
  return Object.assign(b, vals) as BlockOf<T>
}
function st(conv: Partial<Conv>, blocks: E.Block[]): Design {
  return baseState('test', conv, {}, blocks)
}
/** Computed once, on first use. */
function lazy<T>(fn: () => T): () => T {
  let v: T | undefined
  return () => (v === undefined ? (v = fn()) : v)
}
function preset(name: string): Design {
  const i = PRESET_NAMES.indexOf(name)
  if (i < 0) throw new Error('no preset ' + name)
  return buildPreset(i)
}
const LQRX02 = 'LQRx 02 · 24→12 V 240 W, 2-phase'

// ---- interp ----
describe('interp', () => {
  const c: E.Curve = [
    [10, 3],
    [0, 5],
    [5, 4],
  ]
  test('unsorted input is sorted before use', () => {
    expect(E.interp(c, 2.5)).toBeCloseTo(4.5, 12)
    expect(E.interp(c, 7.5)).toBeCloseTo(3.5, 12)
    expect(E.interp(c, 5)).toBe(4)
  })
  test('held flat below the first and above the last point', () => {
    expect(E.interp(c, -1)).toBe(5)
    expect(E.interp(c, 0)).toBe(5)
    expect(E.interp(c, 10)).toBe(3)
    expect(E.interp(c, 1e9)).toBe(3)
  })
  test('the input is not changed', () => {
    expect(c).toEqual([
      [10, 3],
      [0, 5],
      [5, 4],
    ])
  })
  test('one point is a constant', () => {
    expect(E.interp([[3, 7]], -5)).toBe(7)
    expect(E.interp([[3, 7]], 3)).toBe(7)
    expect(E.interp([[3, 7]], 50)).toBe(7)
  })
  test('two equal x: the one given first wins, no NaN', () => {
    const d: E.Curve = [
      [0, 1],
      [1, 2],
      [1, 4],
      [2, 6],
    ]
    expect(E.interp(d, 1)).toBe(2)
    expect(E.interp(d, 0.5)).toBeCloseTo(1.5, 12)
    expect(E.interp(d, 1.5)).toBeCloseTo(4, 12)
    // First in the input, not first after sorting.
    const u: E.Curve = [
      [1, 4],
      [0, 1],
      [1, 2],
    ]
    expect(E.interp(u, 1)).toBe(4)
    expect(E.interp(u, 0.5)).toBeCloseTo(2.5, 12)
    const pair: E.Curve = [
      [2, 1],
      [2, 3],
    ]
    expect(E.interp(pair, 2)).toBe(1)
    expect(E.interp(pair, 0)).toBe(1)
    expect(E.interp(pair, 5)).toBe(1)
  })
  test('empty curve gives NaN', () => {
    expect(E.interp([], 1)).toBeNaN()
  })
})

// ---- corners ----
describe('corners', () => {
  test('Vin values merged and sorted, full load only without li', () => {
    const s = st({ vinMin: 9, vinNom: 12, vinMax: 12, pout: 24, eta: 0.8 }, [
      blk('ind', { L: 1e-6 }),
      blk('cap', { c: 10e-6 }),
    ])
    const cs = E.corners(s)
    expect(cs.map((c) => c.vin)).toEqual([9, 12])
    expect(cs.map((c) => c.label)).toEqual(['9 V, full', '12 V, full'])
    expect(cs[0].i).toBeCloseTo(24 / (0.8 * 9), 12)
  })
  test('light rows only with li on an ON block and pLight != pout', () => {
    const li: E.Curve = [
      [0, 1e-6],
      [2, 0.5e-6],
    ]
    const conv = { vinMin: 9, vinNom: 12, vinMax: 15, pout: 24, pLight: 2 }
    const withLi = st(conv, [blk('ind', { L: 1e-6, li }), blk('cap')])
    expect(E.corners(withLi).map((c) => c.label)).toEqual([
      '9 V, light',
      '9 V, full',
      '12 V, light',
      '12 V, full',
      '15 V, light',
      '15 V, full',
    ])
    const off = st(conv, [blk('ind', { L: 1e-6, li, on: false }), blk('cap')])
    expect(E.corners(off)).toHaveLength(3)
    const same = st({ ...conv, pLight: 24 }, [
      blk('ind', { L: 1e-6, li }),
      blk('cap'),
    ])
    expect(E.corners(same)).toHaveLength(3)
    const empty = st(conv, [blk('ind', { L: 1e-6, li: [] }), blk('cap')])
    expect(E.corners(empty)).toHaveLength(3)
  })
})

// ---- invariance: no curves, pLight 0 ----
{
  const s = lazy(() => preset(LQRX02))
  test('LQRx 02 preset: full-load corner at vinMin equals metrics()', () => {
    const m = E.metrics(s())
    const { rows } = E.cornerMetrics(s())
    const r = rows.find((x) => x.vin === s().conv.vinMin && x.pLoad === 240)
    expect(r).toBeDefined()
    expect(r!.margin).toBe(m.margin)
    expect(r!.peak).toBe(m.peak.v)
    expect(r!.rn).toBe(Math.abs(m.rn.min))
  })
  test('atCorner does not change its input', () => {
    const before = structuredClone(s())
    for (const c of E.corners(s())) E.atCorner(s(), c)
    E.cornerMetrics(s())
    expect(s()).toEqual(before)
  })
}

// ---- one-point cv equal to the static derate ----
test('one-point cv = c·(1 − derate/100) matches the static derate', () => {
  const conv2 = {
    vinMin: 12,
    vinNom: 12,
    vinMax: 12,
    pout: 10,
    fsw: 1.1e6,
    fcheck: 1.1e6,
  }
  const cap = { c: 10e-6, esr: 0, n: 2, derate: 30 }
  const a = st(conv2, [
    blk('bead4', { rs: 50e-3, lb: 1e-6, rp: 150, cb: 2e-12 }),
    blk('res', { r: 68e-3, l: 0 }),
    blk('cap', cap),
  ])
  const b = st(conv2, [
    blk('bead4', { rs: 50e-3, lb: 1e-6, rp: 150, cb: 2e-12 }),
    blk('res', { r: 68e-3, l: 0 }),
    blk('cap', { ...cap, cv: [[5, cap.c * (1 - cap.derate / 100)]] }),
  ])
  const ra = E.cornerMetrics(a).rows[0]
  const rb = E.cornerMetrics(b).rows[0]
  const rel = (x: number, y: number) => Math.abs(x - y) / Math.abs(y)
  expect(rel(rb.margin, ra.margin)).toBeLessThanOrEqual(1e-9)
  expect(rel(rb.peak, ra.peak)).toBeLessThanOrEqual(1e-9)
  expect(rel(rb.attFsw, ra.attFsw)).toBeLessThanOrEqual(1e-9)
})

// ---- D4 (NP-DR-26004 report.md:230-237): Lb 1.0 uH at 0 A, 0.8 uH at 0.83 A ----
{
  const s = st(
    { vinMin: 12, vinNom: 12, vinMax: 12, pout: 10, fsw: 1.1e6, fcheck: 1.1e6 },
    [
      blk('bead4', {
        rs: 50e-3,
        lb: 1e-6,
        rp: 150,
        cb: 2e-12,
        li: [
          [0, 1.0e-6],
          [0.83, 0.8e-6],
        ],
      }),
      blk('res', { r: 68e-3, l: 0 }),
      blk('cap', { c: 10e-6, esr: 0, n: 2, derate: 30 }),
    ]
  )
  const cm = lazy(() => E.cornerMetrics(s))
  test('D4 has two corners: 12 V light, 12 V full', () => {
    expect(cm().rows.map((r) => r.label)).toEqual(['12 V, light', '12 V, full'])
    expect(cm().rows[0].i).toBe(0)
    expect(cm().rows[1].i).toBeCloseTo(10 / 12, 12)
  })
  const light = () => cm().rows[0]
  const full = () => cm().rows[1]
  near(
    'D4 light corner margin (report 26.8 dB)',
    () => light().margin,
    26.8,
    1.5
  )
  near('D4 light corner Q (report 2.26)', () => light().q!, 2.26, 2)
  near('D4 light corner peak |Zout| (report 0.66)', () => light().peak, 0.66, 3)
  near('D4 full corner margin (report 28.5 dB)', () => full().margin, 28.5, 1.5)
  near('D4 full corner Q (report 2.02)', () => full().q!, 2.02, 2)
  near('D4 full corner peak |Zout| (report 0.54)', () => full().peak, 0.54, 3)
  near(
    'D4 full corner attenuation at fsw (report 54.6 dB)',
    () => full().attFsw,
    54.6,
    1
  )
  test('D4 worst corner is light load', () => {
    expect(cm().worst).toBe(0)
  })
  test('D4 full corner clamps Lb to 0.8 uH', () => {
    const c = E.corners(s)[1]
    const b = E.atCorner(s, c).blocks[0] as BlockOf<'bead4'>
    expect(b.lb).toBe(0.8e-6)
    expect((s.blocks[0] as BlockOf<'bead4'>).lb).toBe(1e-6)
  })
}

// ---- LQRx 02 (report :144-146), no curves: 15, 24, 28 V at 240 W ----
{
  const cm = lazy(() => E.cornerMetrics(preset(LQRX02)))
  const row = (vin: number) => cm().rows.find((r) => r.vin === vin)!
  test('LQRx 02 has three corners at 15, 24, 28 V', () => {
    expect(cm().rows.map((r) => r.vin)).toEqual([15, 24, 28])
  })
  // The report rounds to whole dB, and engine.test.ts has no LQRx 02 margin
  // check, so these use ±0.5 dB absolute.
  nearAbs(
    'LQRx 02 margin at 24 V (report 21 dB)',
    () => row(24).margin,
    21,
    0.5
  )
  nearAbs(
    'LQRx 02 margin at 15 V (report 13 dB)',
    () => row(15).margin,
    13,
    0.5
  )
  test('LQRx 02 worst corner is 15 V', () => {
    expect(cm().rows[cm().worst].vin).toBe(15)
  })
}

// ---- falling C-vs-V curve ----
test('a falling cv gives lower C at Vin max than at Vin min', () => {
  const s0 = preset(LQRX02)
  const k = s0.blocks.findIndex((b) => b.type === 'cap')
  const s: Design = {
    ...s0,
    blocks: s0.blocks.map((b, j) =>
      j === k
        ? {
            ...(b as CapBlock),
            cv: [
              [0, 4.7e-6],
              [16, 2.5e-6],
              [35, 1.2e-6],
            ],
          }
        : b
    ),
  }
  const cs = E.corners(s)
  const lo = E.atCorner(s, cs[0]).blocks[k] as CapBlock
  const hi = E.atCorner(s, cs[cs.length - 1]).blocks[k] as CapBlock
  expect(cs[0].vin).toBe(15)
  expect(cs[cs.length - 1].vin).toBe(28)
  expect(hi.c).toBeLessThan(lo.c)
  expect(lo.derate).toBe(0)
  expect((s.blocks[k] as CapBlock).derate).toBe(33)
})
