// Time-domain checks (M4, docs/M4-plan.md "Tests"). No report has
// time-domain results, so the checks are closed forms, the frequency
// response and the DC point. LTspice is in export/ltspice.test.ts.
import { describe, expect, it } from 'vitest'
import { baseState, mk } from '../state/defaults'
import { buildPreset, PRESET_COUNT, PRESET_NAMES } from '../state/presets'
import { abs } from './complex'
import { point } from './ladder'
import { metrics } from './metrics'
import type { Design } from './model'
import { atCorner } from './oppoint'
import {
  buildTran,
  dcPoint,
  hotPlugAt,
  hotPlugRun,
  loadStepAt,
  loadStepRun,
  type Load,
  rippleWave,
  Sim,
  timeScale,
  tranResult,
} from './transient'

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

/** Linear interpolation of a sampled waveform at time t. */
function at(t: number[], y: number[], x: number): number {
  let k = 1
  while (k < t.length - 1 && t[k] < x) k++
  return y[k - 1] + ((y[k] - y[k - 1]) * (x - t[k - 1])) / (t[k] - t[k - 1])
}

/** Source Rs + Ls into one capacitor, no ESR or ESL, no cable. */
function rlc(R: number, L: number, C: number, vin = 12): Design {
  return baseState(
    'rlc',
    { vinMin: vin, vinNom: vin, vinMax: vin, pout: 10, eta: 1, vout: 5 },
    { R, L },
    [mk('cap', 'C1', { c: C, esr: 0, esl: 0, n: 1, derate: 0 })],
    {},
    {},
    { lCable: 0 }
  )
}

const D1_RDCD = PRESET_NAMES.findIndex((n) => n.startsWith('D1 · LC + Rd-Cd'))
const D4 = PRESET_NAMES.findIndex((n) => n.startsWith('D4'))
const D1_UNDAMPED = PRESET_NAMES.findIndex((n) =>
  n.startsWith('D1 · LC undamped')
)

describe('closed forms', () => {
  it('series Rs-Ls-C: V peak and inrush peak (test 1)', () => {
    const R = 0.1,
      L = 1e-6,
      C = 10e-6,
      vin = 12
    const r = hotPlugAt(rlc(R, L, C, vin), vin)
    const w0 = 1 / Math.sqrt(L * C)
    const zeta = (R / 2) * Math.sqrt(C / L)
    const a = R / (2 * L)
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    const vPk =
      vin * (1 + Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta ** 2)))
    const tp = Math.atan(wd / a) / wd
    const iPk = (vin / (wd * L)) * Math.exp(-a * tp) * Math.sin(wd * tp)
    expect(rel(r.vPeak, vPk)).toBeLessThan(1e-3)
    expect(rel(r.iPeak!, iPk)).toBeLessThan(1e-3)
    expect(rel(r.tPeak, Math.PI / wd)).toBeLessThan(5e-3)
    expect(r.status).toBe('settled')
  })

  it('overdamped Rs-Ls-C: inrush peak and I²t = C·Vin²/(2·Rs) (test 2)', () => {
    const R = 3,
      L = 1e-6,
      C = 10e-6,
      vin = 12
    const r = hotPlugAt(rlc(R, L, C, vin), vin)
    // Roots of L·C·s² + R·C·s + 1.
    const a = R / (2 * L),
      w0 = 1 / Math.sqrt(L * C)
    const s1 = -a + Math.sqrt(a * a - w0 * w0),
      s2 = -a - Math.sqrt(a * a - w0 * w0)
    const tp = Math.log(s2 / s1) / (s1 - s2)
    const iPk =
      (vin / (L * (s1 - s2))) * (Math.exp(s1 * tp) - Math.exp(s2 * tp))
    expect(rel(r.iPeak!, iPk)).toBeLessThan(1e-3)
    expect(rel(r.vPeak, vin)).toBeLessThan(1e-3)
    // Energy into R while charging C is C·V²/2, whatever L is.
    expect(rel(r.i2t!, (vin * vin * C) / (2 * R))).toBeLessThan(5e-3)
  })

  it('Rs-C, no cable L: V(tau) holds, inrush is not reported', () => {
    const R = 1,
      C = 10e-6,
      vin = 12
    const r = hotPlugAt(rlc(R, 0, C, vin), vin)
    expect(
      rel(at(r.wave.t, r.wave.v, R * C), vin * (1 - 1 / Math.E))
    ).toBeLessThan(1e-3)
    expect(r.iPeak).toBeNull()
    expect(r.i2t).toBeNull()
  })
})

/** Steady sine amplitude at the converter node over the last period. */
function sineAmp(
  st: Design,
  f: number,
  drive: 'v' | 'i',
  tRun: number
): number {
  const c = buildTran(st)
  const w = 2 * Math.PI * f
  const h = 1 / (400 * f)
  const load: Load | null = drive === 'i' ? (t) => [Math.sin(w * t), 0] : null
  const vs = drive === 'v' ? (t: number) => Math.sin(w * t) : () => 0
  const sim = new Sim(c, h, vs, load)
  sim.step() // 0+ point
  const n = Math.ceil(tRun / h)
  let lo = Infinity,
    hi = -Infinity
  for (let k = 0; k < n; k++) {
    sim.step()
    if (k >= n - 400) {
      lo = Math.min(lo, sim.vOut())
      hi = Math.max(hi, sim.vOut())
    }
  }
  return (hi - lo) / 2
}

describe('frequency cross-check (test 3)', () => {
  for (const i of [D1_RDCD, D4]) {
    const st = buildPreset(i)
    const { fLo, fHi } = timeScale(st)
    for (const k of [0.5, 1, 2, 4]) {
      const f = k * fHi
      const tRun = 40 / fLo + 10 / f
      it(`${PRESET_NAMES[i]}: |Hopen| and |Zout| at ${k}·f0`, () => {
        const p = point(st, f)
        expect(rel(sineAmp(st, f, 'v', tRun), abs(p.Hopen))).toBeLessThan(5e-3)
        expect(rel(sineAmp(st, f, 'i', tRun), abs(p.Zout))).toBeLessThan(5e-3)
      })
    }
  }
})

describe('DC point (test 4)', () => {
  it('hot-plug ends at Vin; load step ends at Vin − Rdc·P/(ηV)', () => {
    for (let i = 0; i < PRESET_COUNT; i++) {
      if (i === D1_UNDAMPED) continue
      const st = buildPreset(i)
      const vin = st.conv.vinNom
      const hp = hotPlugAt(st, vin)
      expect(Math.abs(hp.wave.v[hp.wave.v.length - 1] - vin)).toBeLessThan(
        0.01 * Math.max(hp.vPeak - vin, 1e-3 * vin)
      )
      const ls = loadStepAt(st, vin)
      const rdc = metrics(st).dc.r
      const { pout, eta } = st.conv
      expect(
        Math.abs(ls.vFull - (vin - (rdc * pout) / (eta * ls.vFull)))
      ).toBeLessThan(1e-6 * vin)
    }
  })

  it('dcPoint with no load is Vin at the converter node', () => {
    const st = buildPreset(D1_RDCD)
    const c = buildTran(st)
    expect(dcPoint(c, 48, null)[c.out]).toBeCloseTo(48, 9)
  })
})

/** Trapezoid converter current, the same shape as engine/emi.ts. */
function trapezoid(st: Design, tr: number): (t: number) => number {
  const cv = st.conv
  const N = Math.max(1, Math.round(cv.phases || 1))
  const D = Math.min(1, Math.max(0, cv.vout / (cv.vinNom * cv.eta)))
  const io = cv.pout / cv.vout
  const T = 1 / cv.fsw
  return (t) => {
    let s = 0
    for (let k = 0; k < N; k++) {
      const c = (k * T) / N
      let u = (((t - c) % T) + T) % T
      if (u > T / 2) u -= T
      const x = (D * T) / 2 + tr / 2 - Math.abs(u)
      s += (io / N) * Math.min(1, Math.max(0, x / tr))
    }
    return s
  }
}

describe('ripple waveform (test 5)', () => {
  it('Fourier synthesis matches a transient run to steady state', () => {
    const base = buildPreset(D1_RDCD)
    const st: Design = { ...base, emi: { ...base.emi, tr: 50e-9 } }
    const rw = rippleWave(st)
    const d = atCorner(st, {
      vin: st.conv.vinNom,
      pLoad: st.conv.pout,
      i: 0,
      label: '',
    })
    const c = buildTran(d)
    const T = 1 / st.conv.fsw
    const h = T / 500
    const shape = trapezoid(d, 50e-9)
    const idc = rw.iConv.reduce((a, b) => a + b, 0) / rw.iConv.length
    const x0 = dcPoint(c, st.conv.vinNom, () => [idc, 0])
    const sim = new Sim(
      c,
      h,
      () => st.conv.vinNom,
      (t) => [shape(t), 0],
      x0
    )
    sim.step()
    const { fLo } = timeScale(d)
    const periods = Math.ceil((30 / fLo) * st.conv.fsw)
    let lo = Infinity,
      hi = -Infinity
    for (let k = 0; k < periods * 500; k++) {
      sim.step()
      if (k >= (periods - 1) * 500) {
        lo = Math.min(lo, sim.iSrc())
        hi = Math.max(hi, sim.iSrc())
      }
    }
    expect(rel(hi - lo, rw.pp)).toBeLessThan(0.01)
    // The converter trace is the trapezoid itself.
    for (let k = 0; k < rw.t.length; k += 37)
      expect(Math.abs(rw.iConv[k] - shape(rw.t[k]))).toBeLessThan(
        0.02 * (st.conv.pout / st.conv.vout)
      )
  })
})

describe('stability (test 6)', () => {
  it('a Nyquist-unstable design grows under constant power', () => {
    const st = buildPreset(D1_UNDAMPED)
    expect(metrics(st).unstableAt).not.toBeNull()
    expect(loadStepAt(st, st.conv.vinNom).status).toBe('unstable')
  })

  it('every stable preset settles', () => {
    for (let i = 0; i < PRESET_COUNT; i++) {
      const st = buildPreset(i)
      if (metrics(st).unstableAt !== null) continue
      const r = tranResult(st)
      for (const x of [...r.hot, ...r.step])
        expect(x.status, PRESET_NAMES[i]).toBe('settled')
    }
  })
})

describe('step size (test 7)', () => {
  for (let i = 0; i < PRESET_COUNT; i++) {
    if (i === D1_UNDAMPED) continue
    it(`${PRESET_NAMES[i]}: a 4× finer step moves the results < 0.5 %`, () => {
      const st = buildPreset(i)
      const v = st.conv.vinMax
      const a = hotPlugAt(st, v),
        b = hotPlugRun(st, v, 4 * a.per)
      expect(rel(a.vPeak, b.vPeak)).toBeLessThan(5e-3)
      if (a.iPeak !== null) expect(rel(a.iPeak, b.iPeak!)).toBeLessThan(5e-3)
      const vl = Math.min(st.conv.vinMin, st.conv.vinNom, st.conv.vinMax)
      const c = loadStepAt(st, vl),
        d = loadStepRun(st, vl, 4 * c.per)
      expect(Math.abs(c.droop - d.droop)).toBeLessThan(
        5e-3 * Math.max(c.droop, 1e-3 * vl)
      )
    })
  }

  it('D4 (bead Cb 2 pF): no step-to-step sign alternation', () => {
    const st = buildPreset(D4)
    const r = hotPlugAt(st, st.conv.vinMax)
    const y = r.wave.i
    let run = 0,
      worst = 0
    for (let k = 2; k < y.length; k++) {
      const flip = (y[k] - y[k - 1]) * (y[k - 1] - y[k - 2]) < 0
      run = flip ? run + 1 : 0
      worst = Math.max(worst, run)
    }
    expect(worst).toBeLessThan(4)
  })
})

describe('every preset (test 8)', () => {
  it('finite hot-plug and load-step numbers', () => {
    for (let i = 0; i < PRESET_COUNT; i++) {
      const r = tranResult(buildPreset(i))
      for (const h of r.hot) {
        expect(Number.isFinite(h.vPeak), PRESET_NAMES[i]).toBe(true)
        expect(h.iPeak === null || Number.isFinite(h.iPeak)).toBe(true)
        expect(h.vPeak).toBeGreaterThanOrEqual(h.vin * 0.999)
      }
      for (const s of r.step)
        if (s.status !== 'unstable')
          expect(Number.isFinite(s.droop), PRESET_NAMES[i]).toBe(true)
      expect(r.ripple.pp).toBeGreaterThan(0)
    }
  })
})
