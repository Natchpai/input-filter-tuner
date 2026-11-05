// M3b optimizer (docs/M3-plan.md). No report optimizes, so the ground truth
// is the engine itself: a brute-force exact grid, the E-series neighbours,
// and the applied design's own metrics.
import { describe, expect, test } from 'vitest'
import { buildPreset } from '../state/presets'
import type { StageVals } from './design'
import { snap } from './eseries'
import { metrics } from './metrics'
import type { Design, OptGoal } from './model'
import { applyOpt, optContext, optimize, rhoOf } from './optimize'

/** D1 (NP-DR-26001, 48 V 100 W, 22 uH / 10 uF) with the optimizer on. */
function d1(goal: OptGoal, more: Partial<Design['asst']> = {}): Design {
  const p = buildPreset(0)
  return { ...p, asst: { ...p.asst, on: true, goal, ...more } }
}

const run = new Map<string, ReturnType<typeof optimize>>()
const opt = (goal: OptGoal) => {
  if (!run.has(goal)) run.set(goal, optimize(d1(goal)))
  return run.get(goal)!
}

describe('optimizer on D1, 1 stage, 40 dB at fsw', () => {
  for (const goal of ['cd', 'ctot', 'loss'] as const)
    test(`${goal}: exact and E-series pass, inside the ranges, on the series`, () => {
      const r = opt(goal)
      expect(r.reachable).toBe(true)
      expect(r.exactX.pass).toBe(true)
      expect(r.roundedX.pass).toBe(true)
      const rg = r.ranges[0]
      const s = r.rounded.stages[0]
      expect(s.L).toBeGreaterThanOrEqual(rg.lMin * 0.9999)
      expect(s.L).toBeLessThanOrEqual(rg.lMax * 1.0001)
      expect(s.C).toBeGreaterThanOrEqual(rg.cMin * 0.9999)
      expect(s.C).toBeLessThanOrEqual(rg.cMax * 1.0001)
      const ser = d1(goal).asst.ser
      expect(snap(s.L, ser.L).lower).toBe(s.L)
      expect(snap(s.C, ser.C).lower).toBe(s.C)
      if (s.cd !== null) expect(snap(s.cd, ser.C).lower).toBe(s.cd)
      // Rounding cannot beat the continuous optimum by much.
      expect(r.value.rounded).toBeGreaterThanOrEqual(r.value.exact * 0.97)
    })

  test('ctot: an exact 10 x 10 grid finds no feasible design 1 % better', () => {
    const st = d1('ctot')
    const r = opt('ctot')
    const x = optContext(st)
    const rg = x.ranges[0]
    let best = Infinity
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 10; j++) {
        const L = rg.lMin * (rg.lMax / rg.lMin) ** (i / 9)
        const C = rg.cMin * (rg.cMax / rg.cMin) ** (j / 9)
        const s = x.solveG({ L: [L], C: [C], forms: ['rc'], g: [1] })
        if (s) best = Math.min(best, x.goalOf(s.s))
      }
    expect(best).toBeGreaterThan(r.value.exact * 0.99)
  })

  test('loss: with L free down to 0.1 uH, 3 % less L fails for every C', () => {
    const rng = d1('loss').asst.rng
    const st = d1('loss', {
      rng: [{ ...rng[0], lMin: 0.1e-6 }, rng[1]],
    })
    const r = optimize(st)
    expect(r.roundedX.pass).toBe(true)
    expect(r.binding).not.toContain('L at its min')
    const x = optContext(st)
    const rg = x.ranges[0]
    const L = r.exact.stages[0].L * 0.97
    for (let j = 0; j < 16; j++) {
      const C = rg.cMin * (rg.cMax / rg.cMin) ** (j / 15)
      expect(x.solveG({ L: [L], C: [C], forms: ['rc'], g: [1] })).toBeNull()
    }
  })

  test('cd: no passing one-step E-series neighbour has less Cd', () => {
    const st = d1('cd')
    const r = opt('cd')
    const x = optContext(st)
    const s0 = r.rounded.stages[0]
    const ser = st.asst.ser
    const step = (v: number, k: 'L' | 'C' | 'R', d: number) =>
      d === 0
        ? v
        : d > 0
          ? snap(v * 1.0001, ser[k]).upper
          : snap(v * 0.9999, ser[k]).lower
    let better = 0
    for (const dL of [-1, 0, 1])
      for (const dC of [-1, 0, 1])
        for (const dR of [-1, 0, 1])
          for (const dD of [-1, 0, 1]) {
            if (!dL && !dC && !dR && !dD) continue
            const s: StageVals = {
              ...s0,
              L: step(s0.L, 'L', dL),
              C: step(s0.C, 'C', dC),
              rd: s0.rd === null ? null : step(s0.rd, 'R', dR),
              cd: s0.cd === null ? null : step(s0.cd, 'C', dD),
            }
            const rg = x.ranges[0]
            if (
              s.L < rg.lMin ||
              s.L > rg.lMax ||
              s.C < rg.cMin ||
              s.C > rg.cMax
            )
              continue
            if (x.goalOf([s]) < r.value.rounded && x.fullCheck([s]).pass)
              better++
          }
    expect(better).toBe(0)
  })

  test('Apply: blocks carry DCR = rho·L and give the checked margin', () => {
    const st = d1('ctot')
    const r = opt('ctot')
    let n = 0
    const d = applyOpt(st, r, () => 'b' + n++)
    const ind = d.blocks.find((b) => b.type === 'ind')!
    expect(ind.type === 'ind' && ind.dcr).toBeCloseTo(
      rhoOf(st)[0] * r.rounded.stages[0].L,
      12
    )
    expect(metrics(d).margin).toBeCloseTo(r.roundedX.margin, 9)
  })

  test("rho: the old inductor's DCR per henry (20 mOhm / 22 uH)", () => {
    expect(rhoOf(d1('loss'))[0]).toBeCloseTo(20e-3 / 22e-6, 6)
  })

  test('Qpeak off gives a total C no larger than with Qpeak 2.5', () => {
    const off = optimize(d1('ctot', { qPeak: 0 }))
    expect(off.reachable).toBe(true)
    expect(off.value.exact).toBeLessThanOrEqual(opt('ctot').value.exact * 1.01)
    expect(opt('ctot').exactX.hPeak).toBeLessThanOrEqual(2.5)
  })
})

test('D4 EMI with 1 stage and 1 % loss cannot be met: not reachable', () => {
  const p = buildPreset(8)
  const r = optimize({
    ...p,
    emi: { ...p.emi, on: true },
    asst: { ...p.asst, on: true, goal: 'ctot', target: 'emi' },
  })
  expect(r.reachable).toBe(false)
  expect(r.warnings.join(' ')).toMatch(/No design in the L and C ranges/)
})
