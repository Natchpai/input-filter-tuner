// Several converters on one bus (M5): docs/M5-plan.md.
import { describe, expect, test } from 'vitest'
import { mkLoad } from '../state/defaults'
import { buildPreset } from '../state/presets'
import { bands, converters, iBus, pBus, rnBus, rnOf } from './bus'
import { db } from './complex'
import { emiResult, emiSpectrum } from './emi'
import { checkRange, metrics } from './metrics'
import type { BusConv, Design } from './model'
import { cornerMetrics } from './oppoint'
import { peakZout } from './peak'
import { loadStepAt, rippleWave } from './transient'

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

describe('EMI, ripple and time domain on the bus', () => {
  const half = () => {
    const one = d1()
    return withLoads({ ...one, conv: { ...one.conv, pout: 50, pLight: 0 } }, [
      { pout: 50 },
    ])
  }

  test('EMI: two at P/2 and the same fsw read like one at P (in phase)', () => {
    const a = emiResult(d1()),
      b = emiResult(half())
    expect(b.rows.map((r) => r.f)).toEqual(a.rows.map((r) => r.f))
    b.rows.forEach((r, i) => {
      if (r.pred === null) return expect(a.rows[i].pred).toBeNull()
      expect(r.pred).toBeCloseTo(a.rows[i].pred!, 9)
      expect(r.aReq!).toBeCloseTo(a.rows[i].aReq!, 9)
    })
    expect(b.dropout).toEqual(a.dropout)
  })

  test('EMI: different fsw give both sets of lines; dropout names the one', () => {
    const st = withLoads(d1(), [{ pout: 20, fsw: 2.1e6, vout: 47.9, eta: 0.9 }])
    const pts = emiSpectrum(st)
    const f1 = pts.filter((p) => p.src === 0).map((p) => p.f)
    const f2 = pts.filter((p) => p.src === 1).map((p) => p.f)
    expect(f1.length).toBeGreaterThan(0)
    expect(f2.length).toBeGreaterThan(0)
    expect(
      f1.every((f) => Math.abs(f / 500e3 - Math.round(f / 500e3)) < 1e-9)
    ).toBe(true)
    expect(
      f2.every((f) => Math.abs(f / 2.1e6 - Math.round(f / 2.1e6)) < 1e-9)
    ).toBe(true)
    expect(pts.every((p, i) => i === 0 || p.f >= pts[i - 1].f)).toBe(true)
    // 47.9 V out at 48 V in and η 0.9: converter X2 cannot regulate.
    expect(emiResult(st).dropout).toEqual(['48 V, full (X2)'])
  })

  test('ripple in metrics(): P/2 + P/2 at one fsw equals P; worst converter', () => {
    const a = metrics(d1()).ripple,
      b = metrics(half()).ripple
    expect(rel(b.isrc, a.isrc)).toBeLessThan(1e-9)
    expect(rel(b.vout, a.vout)).toBeLessThan(1e-9)
    // Each d1() call makes new block ids: compare in block order.
    const va = Object.values(a.perBlock),
      vb = Object.values(b.perBlock)
    expect(vb.length).toBe(va.length)
    va.forEach((x, k) =>
      expect(Math.abs(vb[k] - x) <= 1e-9 * Math.abs(x) + 1e-18).toBe(true)
    )
    // A converter at 50 kHz is filtered less: it becomes the worst one.
    const slow = metrics(withLoads(d1(), [{ pout: 10, fsw: 50e3 }])).ripple
    expect(slow.per.map((r) => r.fr)).toEqual([500e3, 50e3])
    expect(slow.worst).toBe(1)
    expect(slow.fr).toBe(50e3)
    const own = (st: Design) => metrics(st).ripple.isrc
    const alone = own(
      withLoads({ ...d1(), conv: { ...d1().conv, pout: 1e-9 } }, [
        { pout: 10, fsw: 50e3 },
      ])
    )
    expect(slow.isrc).toBeGreaterThan(Math.max(a.isrc, alone))
    expect(slow.isrc).toBeLessThan(a.isrc + alone)
  })

  test('load step and ripple wave: P/2 + P/2 equals P', () => {
    const a = loadStepAt(d1(), 48),
      b = loadStepAt(half(), 48)
    expect(rel(b.vMin, a.vMin)).toBeLessThan(1e-6)
    expect(rel(b.droop, a.droop)).toBeLessThan(1e-6)
    expect(b.status).toBe(a.status)
    const ra = rippleWave(d1()),
      rb = rippleWave(half())
    expect(rel(rb.pp, ra.pp)).toBeLessThan(1e-9)
    expect(rb.t.length).toBe(ra.t.length)
  })

  test('ripple wave: two fsw, window of the lowest one, more samples', () => {
    const st = withLoads(d1(), [{ pout: 10, fsw: 2e6 }])
    const w = rippleWave(st)
    expect(w.t[w.t.length - 1]).toBeCloseTo(3 / 500e3, 15)
    expect(w.t.length).toBe(3 * 400 * 4 + 1)
    expect(w.pp).toBeGreaterThan(rippleWave(d1()).pp)
  })
})
