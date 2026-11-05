// Conducted EMI prediction (M2, docs/M2-plan.md). No design report has EMI
// numbers, so these checks use closed forms, an independent DFT and the
// reports' input AC current.
import { describe, expect, test } from 'vitest'
import { baseState } from '../state/defaults'
import { buildPreset, PRESET_NAMES } from '../state/presets'
import { abs, add, cx, div, TAU } from './complex'
import {
  dutyOf,
  emiMarginOf,
  emiPrep,
  emiResult,
  emiSpectrum,
  harmonicAmp,
  harmonics,
  hPort,
  zLisn,
} from './emi'
import { bandLimit, bandsOf } from './emi-limits'
import { point } from './ladder'
import { metrics } from './metrics'
import type { Block, BlockOf, BlockType, Conv, Design } from './model'
import { atCorner, corners } from './oppoint'
import { TYPES } from './types'

const conv = (o: Partial<Conv>): Conv => baseState('t', o, {}, []).conv

let id = 0
function blk<T extends BlockType>(
  type: T,
  vals: Partial<BlockOf<T>> = {}
): BlockOf<T> {
  const b: Record<string, unknown> = {
    id: 'e' + id++,
    type,
    name: type,
    on: true,
  }
  for (const p of TYPES[type].p) b[p.key] = p.def
  if (type === 'ind') Object.assign(b, { dmode: 'none', dR: 1, dL: 1e-6 })
  return Object.assign(b, vals) as BlockOf<T>
}

/**
 * Peak amplitude of harmonic n from a DFT of the sampled waveform: N phases,
 * each a trapezoid of height io/N, width D·T at the 50 % points and edge
 * time tr, shifted by T/N.
 */
function dftAmp(c: Conv, tr: number, ns: number[], M = 1 << 16): number[] {
  const { D, io, N } = dutyOf(c)
  const T = 1 / c.fsw
  const one = (t: number) => {
    // t in [0, T); the pulse is centred on D·T/2.
    let x = t - (D * T) / 2
    x -= T * Math.round(x / T)
    const half = (D * T) / 2,
      a = Math.abs(x)
    if (a <= half - tr / 2) return 1
    if (a >= half + tr / 2) return 0
    return (half + tr / 2 - a) / tr
  }
  const s = new Float64Array(M)
  for (let i = 0; i < M; i++) {
    const t = (i / M) * T
    let v = 0
    for (let p = 0; p < N; p++) v += one((((t - (p * T) / N) % T) + T) % T)
    s[i] = (v * io) / N
  }
  return ns.map((n) => {
    let re = 0,
      im = 0
    for (let i = 0; i < M; i++) {
      const ph = (2 * Math.PI * n * i) / M
      re += s[i] * Math.cos(ph)
      im -= s[i] * Math.sin(ph)
    }
    return (2 * Math.hypot(re, im)) / M
  })
}

describe('input current spectrum', () => {
  test('tr = 0: harmonic N equals metrics().ripple.ih on every preset', () => {
    PRESET_NAMES.forEach((name, i) => {
      const st = buildPreset(i)
      const m = metrics(st)
      const c = harmonicAmp(st.conv, 0, m.ripple.N)
      expect(Math.abs(c - m.ripple.ih), name).toBeLessThanOrEqual(
        1e-12 * Math.max(1, m.ripple.ih)
      )
    })
  })

  test('Parseval: sum of c_n²/2 equals metrics().ripple.iacRms²', () => {
    PRESET_NAMES.forEach((name, i) => {
      const st = buildPreset(i)
      const m = metrics(st)
      let s = 0
      for (let n = 1; n <= 2e5; n++) s += harmonicAmp(st.conv, 0, n) ** 2 / 2
      const want = m.ripple.iacRms ** 2
      expect(Math.abs(s - want), name).toBeLessThanOrEqual(0.005 * want + 1e-12)
    })
  })

  test('NP-DR-26003 report.md:110: 2.0 A at D 0.42 gives 0.99 A rms', () => {
    const c = conv({ vinNom: 12, vout: 5, pout: 10, eta: 1, fsw: 1.1e6 })
    let s = 0
    for (let n = 1; n <= 2e5; n++) s += harmonicAmp(c, 0, n) ** 2 / 2
    expect(Math.sqrt(s)).toBeCloseTo(0.99, 2)
  })

  test('2 phases: only even harmonics; D 0.5 nulls the 400 kHz line', () => {
    // LQRx 02 report.md:60-71: no ripple at 24 V (D = 0.5), 2 phases.
    const c = conv({
      vinNom: 24,
      vout: 12,
      pout: 240,
      eta: 1,
      fsw: 200e3,
      phases: 2,
    })
    expect(harmonicAmp(c, 10e-9, 1)).toBe(0)
    expect(harmonicAmp(c, 10e-9, 3)).toBe(0)
    expect(harmonicAmp(c, 10e-9, 2)).toBeLessThan(1e-12)
    const h = harmonics(c, 10e-9, 150e3, 108e6)
    expect(h[0].f).toBe(400e3)
    expect(h.every((x) => x.n % 2 === 0)).toBe(true)
    expect(h[h.length - 1].f).toBeLessThanOrEqual(108e6)
  })

  test('D 0.25: every 4th harmonic is exactly zero', () => {
    const c = conv({ vinNom: 48, vout: 12, pout: 100, eta: 1, fsw: 500e3 })
    for (const n of [4, 8, 400, 2000]) expect(harmonicAmp(c, 10e-9, n)).toBe(0)
    expect(harmonicAmp(c, 10e-9, 5)).toBeGreaterThan(0)
  })

  test('harmonics() starts at the first multiple of N·fsw ≥ fLo', () => {
    const c = conv({ fsw: 100e3, phases: 1 })
    const h = harmonics(c, 0, 150e3, 1e6)
    expect(h.map((x) => x.n)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  for (const [N, D] of [
    [1, 0.3],
    [2, 0.3],
    [3, 0.55],
  ] as const) {
    test(`trapezoid matches a DFT to 108 MHz (N ${N}, D ${D}, tr 20 ns)`, () => {
      const c = conv({
        vinNom: 10,
        vout: 10 * D,
        pout: 10 * D,
        eta: 1,
        fsw: 400e3,
        phases: N,
      })
      const ns = Array.from({ length: 270 }, (_, k) => k + 1)
      const got = ns.map((n) => harmonicAmp(c, 20e-9, n))
      const ref = dftAmp(c, 20e-9, ns)
      ns.forEach((n, k) => {
        expect(
          Math.abs(got[k] - ref[k]),
          `n ${n}: got ${got[k]}, dft ${ref[k]}`
        ).toBeLessThanOrEqual(2e-6 + 0.012 * ref[k])
      })
    })
  }
})

describe('source-port transfer', () => {
  const L = 2.2e-6,
    C = 10e-6
  const blocks: Block[] = [
    blk('ind', { L, dcr: 0 }),
    blk('cap', { c: C, esr: 0, esl: 0, n: 1, derate: 0 }),
  ]
  test('series L + shunt C equals Zc/(Zc + ZL + Zs)', () => {
    for (const f of [150e3, 1e6, 30e6]) {
      const w = TAU * f
      const zs = cx(50, w * 5e-6)
      const zl = cx(0, w * L),
        zc = cx(0, -1 / (w * C))
      const want = abs(div(zc, add(add(zc, zl), zs)))
      expect(abs(hPort(blocks, f, zs)) / want).toBeCloseTo(1, 9)
    }
  })
  test('with Zs = Rsrc + jωLsrc it equals point().Hopen on every preset', () => {
    PRESET_NAMES.forEach((name, i) => {
      const st = buildPreset(i)
      for (const f of [st.conv.fsw, 3.3e6, 50e6]) {
        const zs = cx(st.source.R, TAU * f * st.source.L)
        const got = abs(hPort(st.blocks, f, zs)),
          want = abs(point(st, f).Hopen)
        expect(Math.abs(got - want), name).toBeLessThanOrEqual(
          1e-12 + 1e-9 * want
        )
      }
    })
  })
})

describe('artificial networks', () => {
  test('CISPR 25: (5 µH + 1 Ω) ∥ 50 Ω', () => {
    // 1 MHz: (1 + j31.42)·50/(51 + j31.42) → 26.24 Ω.
    expect(abs(zLisn('cispr25', 1e6))).toBeCloseTo(26.24, 2)
    expect(abs(zLisn('cispr25', 100e6))).toBeCloseTo(50, 0)
  })
  test('CISPR 32 V-AMN: 50 µH ∥ 50 Ω', () => {
    // 150 kHz: X = 47.12 Ω, 50·X/√(50² + X²) → 34.29 Ω.
    expect(abs(zLisn('cispr32', 150e3))).toBeCloseTo(34.29, 2)
    expect(abs(zLisn('cispr32', 30e6))).toBeCloseTo(50, 1)
  })
})

describe('limits', () => {
  test('CISPR 25 classes step from class 5', () => {
    const lw = (c: string) => bandsOf('cispr25', c)[0]
    expect(lw('5')).toMatchObject({ name: 'LW', pk: 70, qp: 57, av: 50 })
    expect(lw('1')).toMatchObject({ pk: 110, qp: 97, av: 90 })
    expect(bandsOf('cispr25', '3')[1]).toMatchObject({ name: 'MW', qp: 57 })
    expect(bandsOf('cispr25', '1')[2]).toMatchObject({ name: 'SW', av: 57 })
    const tv = bandsOf('cispr25', '5').find((b) => b.name === 'TV I')!
    expect(tv.qp).toBeUndefined()
    expect(tv).toMatchObject({ pk: 34, av: 24, rbw: 120e3 })
    const fm = bandsOf('cispr25', '1').slice(-1)[0]
    expect(fm).toMatchObject({ name: 'FM', fHi: 108e6, pk: 62, qp: 49, av: 42 })
    expect(bandLimit(lw('5'), 0.2e6)).toBe(50)
  })
  test('CISPR 32 class B falls with log f below 0.5 MHz', () => {
    const b = bandsOf('cispr32', 'B')[0]
    expect(bandLimit(b, 0.15e6)).toBeCloseTo(56, 9)
    expect(bandLimit(b, 0.5e6)).toBeCloseTo(46, 9)
    expect(bandLimit(b, Math.sqrt(0.15e6 * 0.5e6))).toBeCloseTo(51, 9)
    expect(bandsOf('cispr32', 'A').map((x) => x.av)).toEqual([66, 60])
  })
  test('unknown class gives no bands', () => {
    expect(bandsOf('cispr25', '6')).toEqual([])
    expect(bandsOf('cispr25', 'A')).toEqual([])
    expect(bandsOf('cispr32', '5')).toEqual([])
  })
})

function emiDesign(blocks: Block[], o: Partial<Conv> = {}): Design {
  return baseState(
    't',
    {
      vinMin: 12,
      vinNom: 12,
      vinMax: 12,
      vout: 5,
      pout: 10,
      eta: 1,
      fsw: 400e3,
      ...o,
    },
    {},
    blocks
  )
}

describe('required attenuation', () => {
  test('no filter: prediction equals bare, margin = −required attenuation', () => {
    const r = emiResult(emiDesign([]))
    for (const row of r.rows)
      if (row.margin !== null) expect(row.margin).toBeCloseTo(-row.aReq!, 9)
    expect(r.pass).toBe(false)
    expect(r.f0Max).not.toBeNull()
  })
  test('an ideal LC at f0Max/2 passes; at 4·f0Max it fails', () => {
    const f0 = emiResult(emiDesign([])).f0Max!
    const lc = (fc: number) => {
      const C = 1e-3,
        L = 1 / ((TAU * fc) ** 2 * C)
      return emiDesign([
        blk('ind', { L, dcr: 0 }),
        blk('cap', { c: C, esr: 0, esl: 0, n: 1, derate: 0 }),
      ])
    }
    expect(emiResult(lc(f0 / 2)).pass).toBe(true)
    expect(emiResult(lc(4 * f0)).pass).toBe(false)
  })
})

describe('band results', () => {
  test('the worst margin per band is the lowest over the Vin corners', () => {
    const st = buildPreset(
      PRESET_NAMES.indexOf('LQRx 02 · 24→12 V 240 W, 2-phase')
    )
    const r = emiResult(st)
    expect(r.spectra.length).toBe(3)
    const one = corners(st)
      .filter((c) => c.pLoad === st.conv.pout)
      .map((c) => emiResult(atCorner(st, c)))
    r.rows.forEach((row, k) => {
      const ms = one
        .map((x) => x.rows[k].margin)
        .filter((m): m is number => m !== null)
      if (row.margin === null) expect(ms).toEqual([])
      else expect(row.margin).toBeCloseTo(Math.min(...ms), 9)
    })
    if (r.worst >= 0)
      expect(r.spectra[r.worstCorner].label).toBe(r.rows[r.worst].corner)
  })
  test('a falling C(V) curve raises the reading at Vin max', () => {
    const cap = (cv?: [number, number][]) =>
      blk('cap', {
        c: 10e-6,
        esr: 0,
        esl: 0,
        n: 1,
        derate: 0,
        ...(cv ? { cv } : {}),
      })
    const mkSt = (cv?: [number, number][]) =>
      emiDesign([blk('ind', { L: 2.2e-6, dcr: 0 }), cap(cv)], { vinMax: 24 })
    const vmax = (st: Design) =>
      emiSpectrum(
        atCorner(
          st,
          corners(st).find((c) => c.vin === 24)!
        )
      )
    const a = vmax(mkSt()),
      b = vmax(
        mkSt([
          [0, 10e-6],
          [24, 4e-6],
        ])
      )
    const hi = a.findIndex((p) => p.f >= 5e6)
    expect(b[hi].vPred).toBeGreaterThan(a[hi].vPred)
  })
  test('2 lines: same bare reading as 1 line', () => {
    const st = emiDesign([])
    const a = emiSpectrum(st),
      b = emiSpectrum({ ...st, emi: { ...st.emi, lines: 2 } })
    a.forEach((p, i) => expect(b[i].vBare).toBe(p.vBare))
  })
  test('harmonics closer than RBW/2 are summed and flagged', () => {
    expect(emiResult(emiDesign([], { fsw: 50e3 })).rbwSum).toBe(true)
    expect(emiResult(emiDesign([], { fsw: 400e3 })).rbwSum).toBe(false)
  })
  test('CISPR 32 stops at 30 MHz, CISPR 25 at 108 MHz', () => {
    const st = emiDesign([])
    const f25 = emiSpectrum(st).slice(-1)[0].f
    const f32 = emiSpectrum({
      ...st,
      emi: { ...st.emi, std: 'cispr32', cls: 'B' },
    }).slice(-1)[0].f
    expect(f25).toBeLessThanOrEqual(108e6)
    expect(f25).toBeGreaterThan(107e6)
    expect(f32).toBeLessThanOrEqual(30e6)
  })
})

describe('emiPrep / emiMarginOf (M3b)', () => {
  /** Worst band margin of emiResult, Infinity when nothing is judged. */
  const worst = (s: Design) => {
    let m = Infinity
    for (const r of emiResult(s).rows)
      if (r.margin !== null) m = Math.min(m, r.margin)
    return m
  }
  /** The design with every C(V) and L(I) curve removed (optimizer parts). */
  const plain = (s: Design): Design => ({
    ...s,
    blocks: s.blocks.map((b) => {
      const c = { ...b } as Record<string, unknown>
      delete c.cv
      delete c.li
      return c as unknown as Block
    }),
  })
  test('equals emiResult on every preset, CISPR 25 and CISPR 32', () => {
    PRESET_NAMES.forEach((name, pi) => {
      for (const std of ['cispr25', 'cispr32'] as const)
        for (const lines of [1, 2] as const) {
          const p = buildPreset(pi)
          const s = plain({
            ...p,
            emi: {
              ...p.emi,
              on: true,
              std,
              cls: std === 'cispr25' ? '5' : 'B',
              lines,
            },
          })
          const got = emiMarginOf(emiPrep(s), s.blocks)
          const want = worst(s)
          if (want === Infinity) expect(got).toBe(Infinity)
          else
            expect(
              Math.abs(got - want),
              `${name} ${std} ${lines}`
            ).toBeLessThan(1e-9)
        }
    })
  })
  test('equals emiResult on a 2-converter bus', () => {
    const p = buildPreset(0)
    const s = plain({
      ...p,
      emi: { ...p.emi, on: true },
      loads: [
        {
          id: 'b1',
          name: 'B',
          on: true,
          pout: 20,
          pLight: 0,
          eta: 0.9,
          vout: 5,
          fsw: 1.1e6,
          phases: 1,
          fcheck: 1e5,
        },
      ],
    })
    expect(Math.abs(emiMarginOf(emiPrep(s), s.blocks) - worst(s))).toBeLessThan(
      1e-9
    )
  })
})
