// Several converters on one bus (M5): docs/M5-plan.md.
import { describe, expect, test } from 'vitest'
import { mkLoad } from '../state/defaults'
import { buildPreset } from '../state/presets'
import { bands, converters, iBus, pBus, rnBus, rnOf } from './bus'
import { db } from './complex'
import { checkRange, metrics } from './metrics'
import type { BusConv, Design } from './model'
import { cornerMetrics } from './oppoint'
import { peakZout } from './peak'

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

/** D1 Rd-Cd (48 V, 100 W, η = 1, f check 500 kHz; peak 1.06 Ω at 10 kHz). */
const d1 = () => buildPreset(1)

function withLoads(st: Design, loads: Partial<BusConv>[]): Design {
  return {
    ...st,
    loads: loads.map((v, i) => mkLoad(st.conv, `X${i + 2}`, v, `x${i}`)),
  }
}

describe('bus helpers', () => {
  test('converters: converter 1 first, extra ones only when on', () => {
    const st = withLoads(d1(), [{ pout: 5 }, { pout: 7, on: false }])
    expect(converters(st).map((c) => [c.name, c.pout])).toEqual([
      ['Conv 1', 100],
      ['X2', 5],
    ])
  })

  test('one converter: same numbers as today, one band = checkRange', () => {
    const st = d1()
    expect(rnBus(st, 48)).toBe(rnOf(st.conv, 48))
    expect(rnBus(st, 48, 1e9)).toBe(rnOf(st.conv, 48))
    const [lo, hi] = checkRange(st)
    expect(bands(st, 48, lo)).toEqual([
      { fLo: lo, fHi: hi, rn: rnOf(st.conv, 48), names: ['Conv 1'] },
    ])
    expect(iBus(st, 48, 'full')).toBe(st.conv.pout / (st.conv.eta * 48))
    expect(pBus(st, 'full')).toBe(st.conv.pout)
  })

  test('parallel Rn, per band; above every crossover the top band holds', () => {
    // A: 100 W, f check 500 kHz. B: 50 W at η 0.8, f check 20 kHz.
    const st = withLoads(d1(), [{ pout: 50, eta: 0.8, fcheck: 20e3 }])
    const rA = -(48 * 48) / 100
    const rAB = -(48 * 48) / (100 + 50 / 0.8)
    expect(rel(rnBus(st, 48), rAB)).toBeLessThan(1e-12)
    expect(rel(rnBus(st, 48, 1e3), rAB)).toBeLessThan(1e-12)
    expect(rel(rnBus(st, 48, 20e3), rAB)).toBeLessThan(1e-12) // at its top
    expect(rel(rnBus(st, 48, 21e3), rA)).toBeLessThan(1e-12)
    expect(rel(rnBus(st, 48, 1e9), rA)).toBeLessThan(1e-12)
    const b = bands(st, 48, 10)
    expect(b.map((x) => [x.fLo, x.fHi, x.names])).toEqual([
      [10, 20e3, ['Conv 1', 'X2']],
      [20e3, 500e3, ['Conv 1']],
    ])
    expect(rel(b[0].rn, rAB)).toBeLessThan(1e-12)
    expect(rel(b[1].rn, rA)).toBeLessThan(1e-12)
  })

  test('bus current and power, light and full', () => {
    const st = withLoads({ ...d1(), conv: { ...d1().conv, pLight: 10 } }, [
      { pout: 40, pLight: 99, eta: 0.8 },
    ])
    expect(pBus(st, 'full')).toBe(140)
    expect(pBus(st, 'light')).toBe(50) // 10 + min(99, 40)
    expect(iBus(st, 24, 'full')).toBeCloseTo(100 / 24 + 40 / (0.8 * 24), 12)
    expect(iBus(st, 24, 'light')).toBeCloseTo(10 / 24 + 40 / (0.8 * 24), 12)
  })
})

describe('checks on the bus', () => {
  test('two converters at P/2 give the same results as one at P', () => {
    const one = d1()
    const half = { ...one.conv, pout: 50, pLight: 0 }
    const two = withLoads({ ...one, conv: half }, [{ pout: 50 }])
    const a = metrics(one),
      b = metrics(two)
    expect(rel(b.margin, a.margin)).toBeLessThan(1e-9)
    expect(rel(b.rn.min, a.rn.min)).toBeLessThan(1e-9)
    expect(rel(b.peak.v, a.peak.v)).toBeLessThan(1e-9)
    expect(b.unstableAt).toBe(a.unstableAt)
    expect(rel(b.dc.iin, a.dc.iin)).toBeLessThan(1e-9)
    const ca = cornerMetrics(one).rows,
      cb = cornerMetrics(two).rows
    expect(cb.map((r) => r.label)).toEqual(ca.map((r) => r.label))
    cb.forEach((r, i) => {
      expect(rel(r.i, ca[i].i)).toBeLessThan(1e-9)
      expect(rel(r.margin, ca[i].margin)).toBeLessThan(1e-9)
    })
  })

  test('margin per band: the peak is judged against the Rn of its band', () => {
    const st0 = d1()
    const [lo] = checkRange(st0)
    // B's crossover above f0 (10 kHz): the peak sees A ∥ B, 6 dB less margin.
    const hiB = withLoads(st0, [{ pout: 100, fcheck: 50e3 }])
    const pk1 = peakZout(hiB, lo, 50e3).v
    const pk2 = peakZout(hiB, 50e3, 500e3).v
    const want = Math.min(db(11.52 / pk1), db(23.04 / pk2))
    expect(metrics(hiB).margin).toBeCloseTo(want, 9)
    expect(metrics(hiB).margin).toBeCloseTo(metrics(st0).margin - db(2), 3)
    // B's crossover below f0: the peak sees A only, the margin stays.
    const loB = withLoads(st0, [{ pout: 100, fcheck: 5e3 }])
    const q1 = peakZout(loB, lo, 5e3).v
    const q2 = peakZout(loB, 5e3, 500e3).v
    expect(metrics(loB).margin).toBeCloseTo(
      Math.min(db(11.52 / q1), db(23.04 / q2)),
      9
    )
    // Here the low band limits: |Zout| at its 5 kHz edge is already 0.75 Ω.
    // Still better than counting B at every frequency (−6 dB).
    const m = metrics(loB)
    expect(m.limitBand).toBe(0)
    expect(m.bands.map((b) => b.names)).toEqual([['Conv 1', 'X2'], ['Conv 1']])
    expect(m.margin).toBeGreaterThan(metrics(st0).margin - db(2) + 1)
    expect(m.margin).toBeLessThan(metrics(st0).margin)
  })

  test('Nyquist: a crossing is judged against the Rn of its band', () => {
    // 1536 W: |Rn_A| = 1.5 Ω; with B (same power) |Rn_A∥B| = 0.75 Ω. The
    // crossing near 10 kHz has Re(Zout) ≈ 1.06 Ω, between the two.
    const big = d1()
    big.conv = { ...big.conv, pout: 1536 }
    expect(metrics(big).unstableAt).toBeNull()
    const below = withLoads(big, [{ pout: 1536, fcheck: 5e3 }])
    expect(metrics(below).unstableAt).toBeNull()
    const above = withLoads(big, [{ pout: 1536, fcheck: 50e3 }])
    const f = metrics(above).unstableAt
    expect(f).not.toBeNull()
    expect(f!).toBeGreaterThan(5e3)
    expect(f!).toBeLessThan(50e3)
  })
})
