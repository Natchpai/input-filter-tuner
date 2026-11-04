import { expect, test } from 'vitest'
import type { Design } from '../engine'
import { buildPreset, PRESET_NAMES } from '../state/presets'
import { forPeak, reportMethod, valueForQ } from './damping'

const preset = (prefix: string): Design =>
  buildPreset(PRESET_NAMES.findIndex((n) => n.startsWith(prefix)))
const ind = (st: Design) => st.blocks.find((b) => b.type === 'ind')!

// The optimum presets: L 22 µH, C 10 µF, so Z0 = 1.483 Ω.
test('forPeak: parallel Rd-Ld, peak √2·Z0 gives the n = 0.5 preset', () => {
  const st = preset('LC + parallel Rd-Ld')
  const r = forPeak(st, ind(st), Math.SQRT2)!
  expect(r.n).toBeCloseTo(0.5, 9)
  expect(r.ld).toBeCloseTo(11e-6, 12)
  expect(r.rd).toBeCloseTo(1.35, 2)
})

test('forPeak: series Rd∥Ld, peak √12·Z0 gives the n = 1 preset', () => {
  const st = preset('LC + series Rd∥Ld')
  const r = forPeak(st, ind(st), Math.sqrt(12))!
  expect(r.n).toBeCloseTo(1, 9)
  expect(r.ld).toBeCloseTo(22e-6, 12)
  expect(r.rd).toBeCloseTo(0.76, 2)
})

test('forPeak: null when unreachable or not an Rd-Ld form', () => {
  const ser = preset('LC + series Rd∥Ld')
  expect(forPeak(ser, ind(ser), 1.4)).toBeNull()
  const b = preset('D1 · Method B')
  expect(forPeak(b, ind(b), 1.5)).toBeNull()
})

// NP-DR-26001 §6, Q = 0.707: A and D add 2.08 Ω in the loop, B and C 1.06 Ω.
const byType = (st: Design, t: string) => st.blocks.find((b) => b.type === t)!
test.each([
  ['D1 · Method A', 'cap', 'A', 'esr', 2.08],
  ['D1 · Method B', 'ind', 'B', 'dR', 1.06],
  ['D1 · LC + Rd-Cd', 'rc', 'C', 'rd', 1.06],
  ['D1 · Method D', 'res', 'D', 'r', 2.08],
])('valueForQ: %s', (prefix, type, m, k, v) => {
  const st = preset(prefix)
  const b = byType(st, type)
  expect(reportMethod(st, b)).toBe(m)
  const r = valueForQ(st, b, 0.707)!
  expect(r.k).toBe(k)
  expect(r.v!).toBeCloseTo(v, 2)
})

test('reportMethod: no Q box on a cap or R that does not damp', () => {
  const rc = preset('D1 · LC + Rd-Cd')
  expect(reportMethod(rc, byType(rc, 'cap'))).toBeNull()
  const d = preset('D1 · Method D')
  expect(reportMethod(d, byType(d, 'cap'))).toBeNull()
  const und = preset('D1 · LC undamped')
  expect(reportMethod(und, byType(und, 'cap'))).toBe('A')
})

test('valueForQ: null value when rL alone gives Q', () => {
  const st = preset('D1 · Method D')
  expect(valueForQ(st, byType(st, 'res'), 100)!.v).toBeNull()
})
