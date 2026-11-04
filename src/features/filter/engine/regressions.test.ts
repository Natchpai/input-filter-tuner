// Engine bugs found in the 2026-11-04 review (docs/bugfix-2026-11-04.md).
// Each test failed before its fix.
import { describe, expect, test } from 'vitest'
import { baseState, mk } from '../state/defaults'
import { buildPreset, PRESET_NAMES } from '../state/presets'
import { emiResult } from './emi'
import { checkRange, metrics } from './metrics'
import type { Design } from './model'
import { corners } from './oppoint'
import { primary } from './sections'

function preset(prefix: string): Design {
  const i = PRESET_NAMES.findIndex((n) => n.startsWith(prefix))
  if (i < 0) throw new Error('no preset ' + prefix)
  return buildPreset(i)
}

describe('check range does not follow the plot range', () => {
  const st = preset('D1 · LC undamped')
  const want = metrics(st)
  test('plot fmax below f0 keeps the margin (and the fail)', () => {
    const m = metrics({ ...st, plot: { ...st.plot, fmax: 5e3 } })
    expect(m.margin).toBeCloseTo(want.margin, 6)
    expect(m.pass).toBe(want.pass)
  })
  test('plot fmin above f0 keeps the margin', () => {
    const m = metrics({ ...st, plot: { ...st.plot, fmin: 20e3 } })
    expect(m.margin).toBeCloseTo(want.margin, 6)
  })
  test('the range ends at fcheck', () => {
    const [, hi] = checkRange({ ...st, plot: { ...st.plot, fmax: 1e3 } })
    expect(hi).toBe(st.conv.fcheck)
  })
})

test('Vin fields out of order: the margin uses the lowest Vin', () => {
  const st = preset('LQRx 02')
  const sw = { ...st, conv: { ...st.conv, vinMin: 28, vinMax: 15 } }
  expect(metrics(sw).margin).toBeCloseTo(metrics(st).margin, 9)
  expect(metrics(sw).dc.iin).toBeCloseTo(metrics(st).dc.iin, 12)
})

test('pLight above pout acts as full load: no light row', () => {
  const st = preset('D4')
  const c = corners({ ...st, conv: { ...st.conv, pout: 10, pLight: 20 } })
  expect(c.every((x) => x.pLoad === 10)).toBe(true)
})

test('the peak never lies above fcheck', () => {
  PRESET_NAMES.forEach((name, i) => {
    const st = buildPreset(i)
    const f0 = metrics(st).peak.f
    for (let j = 0; j <= 60; j++) {
      const k = 0.9 + j * 0.005
      const s = { ...st, conv: { ...st.conv, fcheck: f0 * k } }
      const [, hi] = checkRange(s)
      expect(metrics(s).peak.f, `${name} ×${k}`).toBeLessThanOrEqual(
        hi * (1 + 1e-12)
      )
    }
  })
})

test('primary(): an inductive block with no cap after it is skipped', () => {
  const st = baseState('t', {}, {}, [
    mk('ind', 'L1', { L: 10e-6 }),
    mk('cap', 'C1', { c: 10e-6 }),
    mk('bead2', 'FB1'),
  ])
  expect(primary(st)?.block.name).toBe('L1')
})

describe('EMI corners', () => {
  test('LQRx 03: the 9.39 V corner (D > 1) is reported as dropout', () => {
    const st = preset('LQRx 03')
    const r = emiResult({ ...st, emi: { ...st.emi, on: true } })
    expect(r.dropout).toEqual(['9.39 V, full'])
    expect(emiResult(preset('LQRx 02')).dropout).toEqual([])
  })
  test('the worst corner is found by index, not by label', () => {
    // 12 V and 12.001 V both read "12 V, full".
    const st = preset('D4')
    const s = {
      ...st,
      conv: { ...st.conv, vinMin: 12, vinNom: 12.001, vinMax: 24 },
      emi: { ...st.emi, on: true },
    }
    const r = emiResult(s)
    const row = r.rows[r.worst]
    expect(r.worstCorner).toBe(row.ci)
    expect(r.spectra[row.ci!].label).toBe(row.corner)
  })
})
