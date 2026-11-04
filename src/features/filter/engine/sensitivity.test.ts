// Sensitivity table (M3).
import { expect, test } from 'vitest'
import { baseState, mk } from '../state/defaults'
import { buildPreset } from '../state/presets'
import { sensitivity } from './sensitivity'

test('+10 % C on a plain LC far above f0 gives 20·log10(1.1) more attenuation', () => {
  const st = baseState('LC', { fsw: 1e6, fcheck: 1e6 }, {}, [
    mk('ind', 'L1', { L: 10e-6, dcr: 0, cp: 0 }),
    mk('cap', 'C1', { c: 10e-6, esr: 0, esl: 0 }),
  ])
  const s = sensitivity(st)
  const c = s.rows.find((r) => r.label === 'C1 C (each)')!
  const l = s.rows.find((r) => r.label === 'L1 L')!
  // f0 = 15.9 kHz, fr = 1 MHz: |H| ≈ (f0/f)², so ±10 % in L or C is 0.83 dB.
  expect(c.dAtt).toBeCloseTo(20 * Math.log10(1.1), 2)
  expect(l.dAtt).toBeCloseTo(20 * Math.log10(1.1), 2)
  expect(s.fr).toBe(1e6)
  expect(s.rows).toHaveLength(2)
})

test('D1 Rd-Cd: every main value, damping R matters, rows sorted', () => {
  const st = buildPreset(1)
  const before = JSON.stringify(st)
  const s = sensitivity(st)
  expect(s.rows.map((r) => r.label).sort()).toEqual([
    'C1 C (each)',
    'L1 L',
    'Rd1 Cd',
    'Rd1 Rd',
  ])
  for (let i = 1; i < s.rows.length; i++)
    expect(Math.abs(s.rows[i].dMargin)).toBeLessThanOrEqual(
      Math.abs(s.rows[i - 1].dMargin)
    )
  // Q ≈ Rd/Z0 for parallel damping: +10 % Rd raises the peak, costs margin.
  expect(s.rows.find((r) => r.label === 'Rd1 Rd')!.dMargin).toBeLessThan(0)
  // The design is not changed.
  expect(JSON.stringify(st)).toBe(before)
})

test('off blocks and unused damping keys are skipped', () => {
  const st = buildPreset(0)
  st.blocks[1] = { ...st.blocks[1], on: false }
  const s = sensitivity(st)
  expect(s.rows.map((r) => r.label)).toEqual(['L1 L'])
})
