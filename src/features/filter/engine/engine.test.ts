// Checks the filter engine against numbers from the design reports
// (NP-DR-26001, NP-DR-26003, NP-DR-26004, LQRx 02/03, AOH-DR-26006).
// Ported 1:1 from legacy/test/engine.test.mjs: same names, same tolerances.
import { expect, test } from 'vitest'
import { baseState } from '../state/defaults'
import { buildPreset } from '../state/presets'
import * as E from './index'
import type { BlockOf, BlockType, Conv, Design, Source } from './index'

/** PASS when |got − want| ≤ |want|·tolPct/100. */
function near(name: string, got: () => number, want: number, tolPct = 2) {
  test(`${name} (want ${want} ±${tolPct}%)`, () => {
    const g = got()
    expect(Math.abs(g - want), `got ${g}, want ${want}`).toBeLessThanOrEqual(
      (Math.abs(want) * tolPct) / 100
    )
  })
}
function check(name: string, ok: () => boolean) {
  test(name, () => expect(ok()).toBe(true))
}

let id = 0
function blk<T extends BlockType>(
  type: T,
  vals: Partial<BlockOf<T>> = {}
): BlockOf<T> {
  const b: Record<string, unknown> = {
    id: 't' + id++,
    type,
    name: type,
    on: true,
  }
  for (const p of E.TYPES[type].p) b[p.key] = p.def
  if (type === 'ind') Object.assign(b, { dmode: 'none', dR: 1, dL: 1e-6 })
  return Object.assign(b, vals) as BlockOf<T>
}
function st(
  conv: Partial<Conv>,
  blocks: E.Block[],
  source: Partial<Source> = {}
): Design {
  return baseState('test', conv, source, blocks)
}
/** Metrics computed once per design, on first use. */
function lazy<T>(fn: () => T): () => T {
  let v: T | undefined
  return () => (v === undefined ? (v = fn()) : v)
}

// ---- D1 (NP-DR-26001): 48 V, 100 W, 22 uH, 20 mOhm, 10 uF ----
const d1conv = {
  vinMin: 48,
  vinNom: 48,
  vinMax: 48,
  pout: 100,
  eta: 1,
  vout: 12,
  fsw: 500e3,
  fcheck: 500e3,
}
{
  const m = lazy(() =>
    E.metrics(
      st(d1conv, [
        blk('ind', { L: 22e-6, dcr: 20e-3 }),
        blk('cap', { c: 10e-6, esr: 0 }),
      ])
    )
  )
  near('D1 undamped Z0', () => m().prim!.Z0, 1.483, 0.5)
  near('D1 undamped f0', () => m().prim!.f0, 10.73e3, 0.5)
  near('D1 Rn', () => m().rn.min, -23.04, 0.5)
  near('D1 undamped peak |Zout| (report 110 ohm)', () => m().peak.v, 110, 2)
  near('D1 undamped margin (report -13.6 dB)', () => m().margin, -13.6, 2)
  check('D1 undamped Nyquist reports unstable', () => m().unstableAt !== null)
}
{
  const Z0 = Math.sqrt(22e-6 / 10e-6)
  near(
    'D1 Rd for Q=0.707 (report 1.06)',
    () => E.rdForQ(Z0, 0.707, 0.02),
    1.06,
    1
  )
  near('D1 Rd for Q=1 (report 1.50)', () => E.rdForQ(Z0, 1, 0.02), 1.5, 1)
  near('D1 Rd for Q=2 (report 3.05)', () => E.rdForQ(Z0, 2, 0.02), 3.05, 1)
  // NP-DR-26001 §6.2 and §6.5: methods A and D add Δr = Z0/Q − rL in the loop.
  near(
    'D1 series R for Q=0.707 (report methods A, D: 2.08)',
    () => E.drForQ(Z0, 0.707, 0.02),
    2.08,
    0.5
  )
  check(
    'D1 series R: rL alone already meets Q',
    () => E.drForQ(Z0, 100, 0.02) <= 0
  )
  const m = lazy(() =>
    E.metrics(
      st(d1conv, [
        blk('ind', { L: 22e-6, dcr: 20e-3 }),
        blk('cap', { c: 10e-6, esr: 0 }),
        blk('rc', { rd: 1.06, cd: 150e-6, esr: 0 }),
      ])
    )
  )
  near('D1 Rd-Cd Q=0.707 peak |Zout| (report 1.06)', () => m().peak.v, 1.06, 3)
  near('D1 Rd-Cd Q=0.707 margin (report 26.8 dB)', () => m().margin, 26.8, 1.5)
  check('D1 Rd-Cd stable', () => m().unstableAt === null)
}

// ---- D3 (NP-DR-26003): bead Rdc 0.16, Lb 1u, Rb 50, C 10u, 12 V, 10 W ----
{
  const conv = {
    vinMin: 12,
    vinNom: 12,
    vinMax: 12,
    pout: 10,
    fsw: 1.1e6,
    fcheck: 1.1e6,
  }
  const m = lazy(() =>
    E.metrics(
      st(conv, [
        blk('bead2', { rdc: 0.16, lb: 1e-6, rb: 50 }),
        blk('cap', { c: 10e-6, esr: 0 }),
      ])
    )
  )
  near('D3 Z0 (report 0.316)', () => m().prim!.Z0, 0.316, 0.5)
  near('D3 f0 (report 50.3 kHz)', () => m().prim!.f0, 50.3e3, 0.5)
  near('D3 peak |Zout| (report 0.695)', () => m().peak.v, 0.695, 3)
  near('D3 margin at 10 W (report 26.3 dB)', () => m().margin, 26.3, 1.5)
  const m2 = lazy(() =>
    E.metrics(
      st(conv, [
        blk('bead2', { rdc: 0.015, lb: 1e-6, rb: 50 }),
        blk('cap', { c: 10e-6, esr: 0 }),
      ])
    )
  )
  near('D3 typical bead peak (report 5.89)', () => m2().peak.v, 5.89, 3)
  near('D3 typical bead margin (report 7.8 dB)', () => m2().margin, 7.8, 3)
}

// ---- D4 (NP-DR-26004): bead4 + 68 mOhm + 2x10uF at -30 % (14 uF), 12 V 10 W ----
{
  const s = st(
    { vinMin: 12, vinNom: 12, vinMax: 12, pout: 10, fsw: 1.1e6, fcheck: 1.1e6 },
    [
      blk('bead4', { rs: 50e-3, lb: 1e-6, rp: 150, cb: 2e-12 }),
      blk('res', { r: 68e-3, l: 0 }),
      blk('cap', { c: 10e-6, esr: 0, n: 2, derate: 30 }),
    ]
  )
  const m = lazy(() => E.metrics(s))
  near('D4 peak |Zout| (report 0.66)', () => m().peak.v, 0.66, 3)
  near('D4 margin (report 26.8 dB)', () => m().margin, 26.8, 1.5)
  near(
    'D4 gain at fsw, Lb 1 uH (report 7.6: -56.5 dB)',
    () => -E.db(m().ripple.hfsw),
    56.5,
    1
  )
  near('D4 Q series form (report 2.26)', () => m().qSeries!, 2.26, 2)
  // Same design at 0.83 A, Lb = 0.8 uH (report 6.3 table)
  const m83 = lazy(() =>
    E.metrics(E.withParam(s, s.blocks[0].id, 'lb', 0.8e-6))
  )
  near('D4 0.83 A peak |Zout| (report 0.54)', () => m83().peak.v, 0.54, 3)
  near('D4 0.83 A margin (report 28.5 dB)', () => m83().margin, 28.5, 1.5)
  near('D4 0.83 A Q (report 2.02)', () => m83().qSeries!, 2.02, 2)
  near(
    'D4 0.83 A attenuation at fsw (report 54.6 dB)',
    () => -E.db(m83().ripple.hfsw),
    54.6,
    1
  )
  const bd = E.beadFromDatasheet({
    rdc: 0.3,
    fx: 1e6,
    x: 2 * Math.PI * 1e6 * 1.208e-6,
    fsrf: 1 / (2 * Math.PI * Math.sqrt(1.208e-6 * 1.678e-12)),
    zmax: 0.3 + 1082,
  })
  near('D4 datasheet extraction Lb', () => bd.lb, 1.208e-6, 0.1)
  near('D4 datasheet extraction Cb', () => bd.cb, 1.678e-12, 0.1)
  near('D4 datasheet extraction Rp', () => bd.rp, 1082, 0.1)
}

// ---- LQRx 02: R101 5m, 1 uH/5.6 mOhm, Cf 8x4.7u -33 %, ESR 0.195 + 94 uF, 24 V 240 W eta 0.95 ----
{
  const m = lazy(() =>
    E.metrics(
      st(
        {
          vinMin: 24,
          vinNom: 24,
          vinMax: 24,
          pout: 240,
          eta: 0.95,
          vout: 12,
          fsw: 200e3,
          phases: 2,
          fcheck: 200e3,
        },
        [
          blk('res', { r: 5e-3, l: 0 }),
          blk('ind', { L: 1e-6, dcr: 5.6e-3 }),
          blk('cap', { c: 4.7e-6, esr: 0, n: 8, derate: 33 }),
          blk('rc', { rd: 0, cd: 94e-6, esr: 0.195 }),
        ]
      )
    )
  )
  near('LQRx02 Z0 (report 0.199)', () => m().prim!.Z0, 0.199, 1)
  near('LQRx02 f0 (report 31.7 kHz)', () => m().prim!.f0, 31.7e3, 1)
  near('LQRx02 |Rn| (report 2.28)', () => Math.abs(m().rn.min), 2.28, 1)
  near('LQRx02 peak |Zout| (report 0.199)', () => m().peak.v, 0.199, 5)
  near('LQRx02 peak frequency (report 27.1 kHz)', () => m().peak.f, 27.1e3, 5)
  near(
    'LQRx02 attenuation at 200 kHz (report 32 dB)',
    () => -E.db(m().ripple.hfsw),
    32,
    5
  )
  near(
    'LQRx02 attenuation at 400 kHz (report 44 dB)',
    () => -E.db(m().ripple.hfr),
    44,
    5
  )
}

// ---- LQRx 03: R301 20m, 2.2 uH/0.2, CF 4.7u -33 %, 0.1 uF, 1 ohm + 22 uF; 9.39 V, 9 W, eta 0.85 ----
{
  const m = lazy(() =>
    E.metrics(
      st(
        {
          vinMin: 9.39,
          vinNom: 9.39,
          vinMax: 9.39,
          pout: 9,
          eta: 0.85,
          vout: 9,
          fsw: 1.1e6,
          fcheck: 1.1e6,
        },
        [
          blk('res', { r: 20e-3, l: 0 }),
          blk('ind', { L: 2.2e-6, dcr: 0.2 }),
          blk('cap', { c: 4.7e-6, esr: 0, derate: 33 }),
          blk('cap', { c: 0.1e-6, esr: 0 }),
          blk('rc', { rd: 0, cd: 22e-6, esr: 1 }),
        ]
      )
    )
  )
  near('LQRx03 peak |Zout| (report 0.77)', () => m().peak.v, 0.77, 3)
  near('LQRx03 peak frequency (report 62.4 kHz)', () => m().peak.f, 62.4e3, 3)
  near('LQRx03 |Rn| (report 8.3)', () => Math.abs(m().rn.min), 8.3, 1)
  near(
    'LQRx03 attenuation at 1.1 MHz (report 50.7 dB)',
    () => -E.db(m().ripple.hfsw),
    50.7,
    2
  )
}

// ---- D6 (AOH-DR-26006): R_SRC 56m, 3x10u ESR 5m, 0.33u/0.13, 3x10u ----
{
  const m = lazy(() =>
    E.metrics(
      st(
        {
          vinMin: 4.5,
          vinNom: 4.5,
          vinMax: 4.5,
          pout: 6.6,
          eta: 0.9,
          vout: 3.3,
          fsw: 2.5e6,
          fcheck: 2.5e6,
        },
        [
          blk('cap', { c: 10e-6, esr: 5e-3, n: 3 }),
          blk('ind', { L: 0.33e-6, dcr: 0.13 }),
          blk('cap', { c: 10e-6, esr: 5e-3, n: 3 }),
        ],
        { R: 0.056 }
      )
    )
  )
  near('D6 peak |Zout| (report about 0.19)', () => m().peak.v, 0.19, 8)
  near('D6 |Rin| at 2 A (report 2.8)', () => Math.abs(m().rn.min), 2.76, 2)
}

// ---- Closed-form optimum vs numeric optimum, lossless L = C = 1 ----
for (const mode of ['rc', 'RLpar', 'RLser'] as const) {
  for (const n of [0.25, 1, 3]) {
    const opt = lazy(() => {
      const L = 1e-6,
        C = 1e-6
      const blocks =
        mode === 'rc'
          ? [
              blk('ind', { L, dcr: 0 }),
              blk('cap', { c: C, esr: 0 }),
              blk('rc', { rd: 1, cd: n * C, esr: 0 }),
            ]
          : [
              blk('ind', { L, dcr: 0, dmode: mode, dL: n * L, dR: 1 }),
              blk('cap', { c: C, esr: 0 }),
            ]
      const s = st({ fsw: 1e8, fcheck: 1e8 }, blocks)
      s.plot.fmin = 1e3
      s.plot.fmax = 1e8
      const target = mode === 'rc' ? blocks[2] : blocks[0]
      const key = E.dampKey(target)!
      return E.optimizeParam(s, target.id, key, 1e-3, 1e3)
    })
    const cf = E.closedForm(mode, n, 1)!
    near(`closed form ${mode} n=${n} peak`, () => opt().peak, cf.peak, 0.5)
    near(`closed form ${mode} n=${n} Rd`, () => opt().val, cf.rd, 3)
  }
}

// ---- Erickson, APEC 1999 (references/README.md): the paper's own numbers
// through the engine, lossless parts, ideal source ----
{
  const pk = (blocks: E.Block[]) => {
    const s = st({ fsw: 1e7, fcheck: 1e7 }, blocks)
    return E.peakZout(s, 1e3, 1e6, undefined, 2000)
  }
  // Table I, design 1: R-Ld parallel, L 5.8 uH, C 11.7 uF, Ld 2.9 uH,
  // R 0.65 ohm: max |Zo| 1.0 ohm at fm 27.22 kHz (eq. 11, 12).
  const t1 = lazy(() =>
    pk([
      blk('ind', { L: 5.8e-6, dcr: 0, dmode: 'RLpar', dL: 2.9e-6, dR: 0.65 }),
      blk('cap', { c: 11.7e-6, esr: 0 }),
    ])
  )
  near('Erickson Table I design 1 peak |Zo|', () => t1().v, 1.0, 2)
  near('Erickson Table I design 1 fm', () => t1().f, 27.22e3, 2)
  // Eqs. 26-30, section 1: L1 31.2 uH, C1 6.9 uF, n1·L1 15.6 uH, R1 1.9 ohm
  // for a 3 ohm peak.
  near(
    'Erickson eqs. 26-30 section 1 peak |Zo|',
    () =>
      pk([
        blk('ind', {
          L: 31.2e-6,
          dcr: 0,
          dmode: 'RLpar',
          dL: 15.6e-6,
          dR: 1.9,
        }),
        blk('cap', { c: 6.9e-6, esr: 0 }),
      ]).v,
    3.0,
    2
  )
  // Rd-Cd at n = 4, Z0 = 1 ohm (eqs. 18-20): optimum Rd = 0.612 ohm gives
  // peak 0.866 ohm at fm = f0·sqrt(2/(2+n)).
  const f0 = 1 / (2 * Math.PI * 1e-6)
  const rc = (rd: number) =>
    pk([
      blk('ind', { L: 1e-6, dcr: 0 }),
      blk('cap', { c: 1e-6, esr: 0 }),
      blk('rc', { rd, cd: 4e-6, esr: 0 }),
    ])
  near('Erickson Rd-Cd n=4 optimum peak', () => rc(0.612).v, 0.866, 0.5)
  near('Erickson Rd-Cd n=4 fm', () => rc(0.612).f, f0 * Math.sqrt(1 / 3), 1)
  // App-note shortcut (SNVA538, Flex AN 323): Rd = Z0 with Cd = 4C is not
  // the optimum; its peak is higher (docs/equations.md).
  check(
    'Rd = Z0, Cd = 4C peaks above the optimum',
    () => rc(1).v > 1.1 * rc(0.612).v
  )
}

// ---- peakH: gain peak of Hopen (M3b Qpeak check) ----
{
  // R across C (Cd large), L = C = 1 (Z0 = 1), R = 2: Q = R/Z0 = 2,
  // |H|max = Q/sqrt(1 − 1/(4Q²)) (second-order low-pass, docs/equations.md).
  const s = st({ fsw: 1e7, fcheck: 1e7 }, [
    blk('ind', { L: 1e-6, dcr: 0 }),
    blk('cap', { c: 1e-6, esr: 0 }),
    blk('rc', { rd: 2, cd: 1, esr: 0 }),
  ])
  near(
    'peakH: R across C, Q = 2',
    () => E.peakH(s, 1e3, 1e7).v,
    2 / Math.sqrt(1 - 1 / 16),
    0.1
  )
  // High-Q stage (1 uH / 1 mOhm / 2 uF): a coarse grid steps over it.
  const hq = st(d1conv, [
    blk('ind', { L: 1e-6, dcr: 1e-3 }),
    blk('cap', { c: 2e-6, esr: 0 }),
  ])
  const truth = E.peakH(hq, 10, 1e6, undefined, 40000).v
  near(
    'peakH coarse grid (n=160) finds a narrow peak',
    () => E.peakH(hq, 10, 1e6, undefined, 160).v,
    truth,
    1
  )
}

// ---- Regression: narrow peaks, Nyquist crossing, stage lookup, check range ----
{
  // Stage 1 damped (D1), stage 2 high-Q (1 uH / 1 mOhm / 2 uF, f0 = 112.5 kHz).
  const mk2 = () =>
    st(d1conv, [
      blk('ind', { L: 22e-6, dcr: 20e-3 }),
      blk('cap', { c: 10e-6, esr: 0 }),
      blk('rc', { rd: 1.06, cd: 150e-6, esr: 0 }),
      blk('ind', { L: 1e-6, dcr: 1e-3 }),
      blk('cap', { c: 2e-6, esr: 0 }),
    ])
  const s = mk2()
  const truth = E.peakZout(s, 10, 500e3, undefined, 20000).v
  near(
    'coarse peak search (n=160) finds the high-Q stage-2 peak',
    () => E.peakZout(s, 10, 500e3, undefined, 160).v,
    truth,
    1
  )
  // The design that reproduced a 17x miss (stage 1 over-damped with Rd = 10 ohm).
  const sMiss = st(d1conv, [
    blk('ind', { L: 22e-6, dcr: 20e-3 }),
    blk('cap', { c: 10e-6, esr: 0 }),
    blk('rc', { rd: 10, cd: 30e-6, esr: 0 }),
    blk('ind', { L: 1e-6, dcr: 1e-3 }),
    blk('cap', { c: 2e-6, esr: 0 }),
  ])
  const tMiss = E.peakZout(sMiss, 10, 500e3, undefined, 20000).v
  near(
    'coarse peak search (n=160), reproduced 17x case',
    () => E.peakZout(sMiss, 10, 500e3, undefined, 160).v,
    tMiss,
    1
  )
  near(
    'metrics peak, reproduced 17x case',
    () => E.metrics(sMiss).peak.v,
    tMiss,
    1
  )
  const m = lazy(() => E.metrics(s))
  near('metrics peak equals the true peak', () => m().peak.v, truth, 1)
  check(
    'Nyquist flags the stage-2 peak above |Rn|',
    () => truth > Math.abs(m().rn.min) && m().unstableAt !== null
  )

  // Optimum Rd on a 2-stage filter is no worse than a brute-force scan.
  test('optimizer is no worse than a 400-point Rd scan', () => {
    const s2 = st(d1conv, [
      blk('ind', { L: 22e-6, dcr: 20e-3 }),
      blk('cap', { c: 10e-6, esr: 0 }),
      blk('rc', { rd: 1, cd: 30e-6, esr: 0 }),
      blk('ind', { L: 1e-6, dcr: 1e-3 }),
      blk('cap', { c: 2e-6, esr: 0 }),
      blk('rc', { rd: 0.5, cd: 10e-6, esr: 0 }),
    ])
    const tgt = s2.blocks[5]
    const opt = E.optimizeParam(s2, tgt.id, 'rd', 1e-3, 1e3)
    let brute = Infinity
    for (let i = 0; i <= 400; i++) {
      const v = 10 ** (-3 + (6 * i) / 400)
      brute = Math.min(
        brute,
        E.peakZout(E.withParam(s2, tgt.id, 'rd', v), 10, 500e3, undefined, 4000)
          .v
      )
    }
    expect(opt.peak, `opt ${opt.peak} vs scan ${brute}`).toBeLessThanOrEqual(
      brute * 1.01
    )
  }, 120_000)

  // Each damping leg is matched to its own stage.
  const two = st({}, [
    blk('ind', { L: 10e-6, dcr: 12e-3 }),
    blk('cap', { c: 4.7e-6, esr: 4e-3, n: 2, derate: 35 }),
    blk('rc', { rd: 1.2, cd: 33e-6 }),
    blk('ind', { L: 2.2e-6, dcr: 6e-3 }),
    blk('cap', { c: 4.7e-6, esr: 4e-3, n: 4, derate: 35 }),
    blk('rc', { rd: 0.5, cd: 47e-6 }),
  ])
  const sec1 = E.sectionOf(two, two.blocks[2].id)
  const sec2 = E.sectionOf(two, two.blocks[5].id)
  near(
    'sectionOf: Rd1 belongs to stage 1 (C = 6.11 uF)',
    () => (sec1 ? sec1.C : 0),
    2 * 4.7e-6 * 0.65,
    0.1
  )
  near(
    'sectionOf: Rd2 belongs to stage 2 (C = 12.22 uF)',
    () => (sec2 ? sec2.C : 0),
    4 * 4.7e-6 * 0.65,
    0.1
  )
  near('sectionOf: L1 section uses L1', () => (sec1 ? sec1.L : 0), 10e-6, 0.1)
  const secL1 = E.sectionOf(two, two.blocks[0].id)
  near(
    'sectionOf: an inductor uses its own stage',
    () => (secL1 ? secL1.C : 0),
    2 * 4.7e-6 * 0.65,
    0.1
  )

  // Nyquist scan stays inside the check range: an HF self-resonance must not fail the design.
  check('HF self-resonance above f check is not reported unstable', () => {
    const hf = st(d1conv, [
      blk('ind', { L: 22e-6, dcr: 20e-3 }),
      blk('cap', { c: 10e-6, esr: 0 }),
      blk('rc', { rd: 1.06, cd: 150e-6, esr: 0 }),
      blk('ind', { L: 1e-6, dcr: 1e-3, cp: 10e-12 }),
    ])
    return E.metrics(hf).unstableAt === null
  })

  // Inverted check range is corrected.
  check('check range is never inverted', () => {
    const inv = mk2()
    inv.plot.fmin = 1e6
    const [lo, hi] = E.checkRange(inv)
    return hi > lo
  })
}

// ---- S21 sanity ----
{
  check('S21 of a through is 0 dB', () => {
    const s = st({}, [blk('res', { r: 0, l: 0 })])
    return Math.abs(E.db(E.abs(E.point(s, 1e6).S21))) < 1e-6
  })
  const c = 1e-9,
    f = 1e6
  near(
    'S21 of a shunt C',
    () => E.abs(E.point(st({}, [blk('cap', { c, esr: 0, esl: 0 })]), f).S21),
    1 / Math.hypot(1, Math.PI * f * 50 * c), // |S21| = |2/(2 + jwCZ0)|
    0.01
  )
  near(
    'S21 of a series 50 ohm (-3.52 dB)',
    () => E.db(E.abs(E.point(st({}, [blk('res', { r: 50, l: 0 })]), f).S21)),
    20 * Math.log10(2 / 3),
    0.01
  )
}

// Lesson 1: the plot's Points setting must not change the Nyquist verdict.
// With n = NaN the old grid (max(400, n)) had no points and found nothing.
test('Nyquist scan does not read plot.n', () => {
  const st = buildPreset(0) // D1 LC undamped: Nyquist encircles -1
  const at = (n: number) =>
    E.metrics({ ...st, plot: { ...st.plot, n } }).unstableAt
  expect(at(800)).not.toBeNull()
  for (const n of [50, 5000, NaN]) expect(at(n)).toBe(at(800))
})
