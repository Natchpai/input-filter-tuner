import { expect, test } from 'vitest'
import type { Design } from '../engine'
import { buildPreset, PRESET_NAMES } from '../state/presets'
import { forPeak } from './damping'

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
