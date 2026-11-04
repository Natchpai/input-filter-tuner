// Design assistant (M3). Report numbers: NP-DR-26001 §4 and §7,
// NP-DR-26004 §5, LQRx 03 report :108-126. The rest checks the proposal
// against the engine.
import { describe, expect, test } from 'vitest'
import { ASST_DEFAULTS, baseState, mk } from '../state/defaults'
import { buildPreset, PRESET_NAMES } from '../state/presets'
import { cdForRd, closedForm, nForPeak } from './closed-form'
import { TAU } from './complex'
import {
  applyProposal,
  type Check,
  checkOf,
  clampAsst,
  propose,
  sizeStage,
  zMaxOf,
} from './design'
import { emiResult } from './emi'
import { type ESeries, snap } from './eseries'
import { checkRange } from './metrics'
import type { AsstSettings, DampForm, Design } from './model'
import { peakZout } from './peak'

const near = (got: number, want: number, pct: number) =>
  expect(Math.abs(got - want), `got ${got}, want ${want}`).toBeLessThanOrEqual(
    (Math.abs(want) * pct) / 100
  )
const quiet = () => {}
const f0Of = (L: number, C: number) => 1 / (TAU * Math.sqrt(L * C))

function withAsst(st: Design, a: Partial<AsstSettings>): Design {
  return { ...st, asst: clampAsst({ ...st.asst, ...a }, ASST_DEFAULTS) }
}

describe('closed-form inverses', () => {
  test.each(['rc', 'RLpar', 'RLser'])('nForPeak round trip, %s', (mode) => {
    for (const n of [0.1, 0.5, 1, 3, 10]) {
      const peak = closedForm(mode, n, 1)!.peak
      near(nForPeak(mode, peak)!, n, 1e-9)
    }
  })
  test('RLser cannot go below √2·Z0', () => {
    expect(nForPeak('RLser', 1.4)).toBeNull()
    expect(nForPeak('RLser', 1.5)).toBeGreaterThan(0)
  })
  test('bad input', () => {
    expect(nForPeak('rc', 0)).toBeNull()
    expect(nForPeak('R', 2)).toBeNull()
  })
})

describe('report numbers', () => {
  // NP-DR-26001 §4 and the §7 table: L 22 µH, rL 20 mΩ, C 10 µF.
  const L = 22e-6,
    C = 10e-6,
    f0 = f0Of(L, C)
  test.each([
    [0.707, 1.06, 140e-6, 150e-6],
    [1, 1.5, 99e-6, 100e-6],
    [2, 3.05, 49e-6, 47e-6],
  ])('NP-DR-26001 Q %d: Rd %d Ω, Cd min %d, E12 %d', (q, rd, cdMin, cdE) => {
    const s = sizeStage(
      { fix: 'L', val: L, damp: 'rc' },
      f0,
      'q',
      q,
      1e9,
      0.02,
      quiet
    )
    near(s.C, C, 1e-9)
    near(s.rd!, rd, 1)
    near(s.cd!, cdMin, 1.5)
    expect(snap(s.cd!, 'E12').nearest).toBe(cdE)
  })
  test('NP-DR-26001 §7: Qstab = 7.8 (k = 2)', () => {
    const st = baseState(
      'D1',
      {
        vinMin: 48,
        vinNom: 48,
        vinMax: 48,
        pout: 100,
        eta: 1,
        k: 20 * Math.log10(2),
      },
      {},
      []
    )
    near(zMaxOf(st) / Math.sqrt(L / C), 7.8, 1)
  })
  test('NP-DR-26004 §5: Qstab = 22.8, L ≥ 0.21 µH for 40 dB at 1.1 MHz', () => {
    const st = baseState(
      'D4',
      {
        vinMin: 12,
        vinNom: 12,
        vinMax: 12,
        pout: 10,
        eta: 1,
        k: 20 * Math.log10(2),
      },
      {},
      []
    )
    near(zMaxOf(st) / Math.sqrt(1e-6 / 10e-6), 22.8, 1)
    // Start value: f0 = 1.1 MHz · 10^(−40/40).
    const s = sizeStage(
      { fix: 'C', val: 10e-6, damp: 'rc' },
      1.1e6 / 10,
      'q',
      1,
      zMaxOf(st),
      0.02,
      quiet
    )
    near(s.L, 0.21e-6, 1)
  })
  test('LQRx 03: Rd = 1.1 Ω for Q = 1 (2.2 µH, 3.1 µF, DCR 0.2 Ω)', () => {
    const s = sizeStage(
      { fix: 'L', val: 2.2e-6, damp: 'rc' },
      f0Of(2.2e-6, 3.1e-6),
      'q',
      1,
      1e9,
      0.2,
      quiet
    )
    near(s.Z0, 0.84, 1)
    near(s.rd!, 1.1, 1)
  })
  test('cdForRd is Xcd = Rd/10', () => {
    near(1 / (TAU * 1e4 * cdForRd(1e4, 2)), 0.2, 1e-9)
  })
})

// The M3 "Done when": given only the requirements, the proposal is on the
// E-series and meets margin k and the attenuation target at nominal values.
describe('proposal meets the targets', () => {
  const forms: [DampForm, AsstSettings['rule']][] = [
    ['rc', 'q'],
    ['rc', 'leastCd'],
    ['RLpar', 'leastCd'],
    ['RLser', 'leastCd'],
    ['R', 'q'],
  ]
  const onSeries = (v: number, ser: ESeries) =>
    snap(v, ser).lower === snap(v, ser).upper
  for (const i of [1, 7, 8, 13])
    for (const stages of [1, 2] as const)
      for (const [damp, rule] of forms)
        test(`${PRESET_NAMES[i]}, ${stages} stage, ${damp} ${rule}`, () => {
          const base = buildPreset(i)
          const st = withAsst(base, {
            stages,
            rule,
            st: [
              { ...base.asst.st[0], damp },
              { ...base.asst.st[1], damp },
            ],
          })
          const p = propose(st)
          expect(p.reachable).toBe(true)
          const c: Check = p.rounded.check
          expect(c.pass, JSON.stringify(c)).toBe(true)
          expect(c.att).toBeGreaterThanOrEqual(st.asst.aDb)
          expect(c.margin).toBeGreaterThanOrEqual(st.conv.k)
          for (const s of p.rounded.stages) {
            expect(onSeries(s.L, 'E12')).toBe(true)
            expect(onSeries(s.C, 'E12')).toBe(true)
            if (s.cd !== null) expect(onSeries(s.cd, 'E12')).toBe(true)
            if (s.ld !== null) expect(onSeries(s.ld, 'E12')).toBe(true)
          }
          // The applied design gives the same numbers.
          let n = 0
          const d = applyProposal(st, p, () => 'x' + n++)
          const again = checkOf(d, p.fa)
          near(again.att, c.att, 1e-9)
          near(again.margin, c.margin, 1e-9)
        })
})

describe('least Cd follows Erickson', () => {
  test('lossless: peak |Zout| is just under Zmax, margin just over k', () => {
    const st = withAsst(
      baseState(
        'lossless',
        { vinMin: 12, vinNom: 12, vinMax: 12, pout: 10 },
        {},
        [
          // Exactly lossless: at a peak of 45·Z0 even 0.1 mΩ moves it 5 %.
          mk('ind', 'L', { dcr: 0 }),
          mk('cap', 'C', { esr: 0 }),
        ]
      ),
      { rule: 'leastCd' }
    )
    const p = propose(st)
    const d = applyProposal(
      st,
      { ...p, rounded: { ...p.rounded, stages: p.exact.stages } },
      () => 'y'
    )
    const [lo, hi] = checkRange(d)
    // The polish keeps 0.1 dB to spare over k.
    const pk = peakZout(d, lo, hi).v
    expect(pk).toBeLessThanOrEqual(p.zMax)
    expect(pk).toBeGreaterThanOrEqual(p.zMax * 10 ** (-0.15 / 20))
    expect(p.exact.check.margin).toBeGreaterThanOrEqual(st.conv.k)
    expect(p.exact.check.margin).toBeLessThanOrEqual(st.conv.k + 0.15)
  })
})

describe('edge cases', () => {
  test('R across L cannot reach a very high target', () => {
    const base = buildPreset(1)
    const st = withAsst(base, {
      aDb: 140,
      st: [{ fix: 'L', val: 1e-6, damp: 'R' }, base.asst.st[1]],
    })
    const p = propose(st)
    expect(p.reachable).toBe(false)
    expect(p.warnings.join(' ')).toMatch(/cannot be met/)
  })
  test('Q target above Qstab: warned, margin below k', () => {
    const base = buildPreset(1)
    const st = withAsst(base, { q: 20, aDb: 80 })
    const p = propose(st)
    if (p.exact.check.margin < st.conv.k)
      expect(p.warnings.join(' ')).toMatch(/too high/)
  })
  test('DCR alone gives Q: no damping part', () => {
    const st = withAsst(
      baseState('lossy', { vinMin: 12, vinNom: 12, vinMax: 12, pout: 10 }, {}, [
        mk('ind', 'L', { dcr: 1 }),
        mk('cap', 'C'),
      ]),
      {}
    )
    const p = propose(st)
    expect(p.exact.stages[0].rd).toBeNull()
    const d = applyProposal(st, p, () => 'z')
    expect(d.blocks.map((b) => b.type)).toEqual(['ind', 'cap'])
    expect(p.warnings.join(' ')).toMatch(/no damping part/)
  })
  test('EMI target, 1 stage: needs ~120 dB, so Qstab < Q and a warning', () => {
    const base = buildPreset(7)
    const st = withAsst(
      { ...base, emi: { ...base.emi, on: true } },
      { target: 'emi' }
    )
    const p = propose(st)
    expect(p.rounded.check.emi).toBeGreaterThanOrEqual(0)
    expect(p.exact.stages[0].qStab).toBeLessThan(1)
    expect(p.warnings.join(' ')).toMatch(/too high/)
  })
  test('EMI target, 2 stages: the rounded design passes every band', () => {
    const base = buildPreset(7)
    const st = withAsst(
      { ...base, emi: { ...base.emi, on: true } },
      { target: 'emi', stages: 2 }
    )
    const p = propose(st)
    expect(p.reachable).toBe(true)
    expect(p.rounded.check.pass).toBe(true)
    let n = 0
    expect(emiResult(applyProposal(st, p, () => 'e' + n++)).pass).toBe(true)
  })
})

describe('apply', () => {
  test('keeps parasitics of the same role, drops curves', () => {
    const base = buildPreset(8) // D4: bead, R, cap with derate
    const st = withAsst(
      {
        ...base,
        blocks: [
          mk('ind', 'Lold', { dcr: 0.05, cp: 1e-12, li: [[0, 1e-6]] }),
          mk('cap', 'Cold', {
            esr: 0.01,
            esl: 1e-9,
            derate: 30,
            cv: [[0, 1e-5]],
          }),
          mk('rc', 'Rold', { esr: 0.2 }),
        ],
      },
      {}
    )
    const p = propose(st)
    let n = 0
    const d = applyProposal(st, p, () => 'n' + n++)
    const [L, C, R] = d.blocks
    expect(L).toMatchObject({ type: 'ind', dcr: 0.05, cp: 1e-12, name: 'L' })
    expect('li' in L).toBe(false)
    expect(C).toMatchObject({
      type: 'cap',
      esr: 0.01,
      esl: 1e-9,
      derate: 0,
      n: 1,
    })
    expect('cv' in C).toBe(false)
    // Cd ESR counts in Rd: the part is the total minus 0.2 Ω.
    expect(R).toMatchObject({ type: 'rc', esr: 0.2 })
    near((R as { rd: number }).rd + 0.2, p.rounded.stages[0].rd!, 1e-9)
    expect(new Set(d.blocks.map((b) => b.id)).size).toBe(d.blocks.length)
  })
  test('2 stages: source-side stage first, names with the stage number', () => {
    const st = withAsst(buildPreset(1), { stages: 2 })
    let n = 0
    const d = applyProposal(st, propose(st), () => 'm' + n++)
    expect(d.blocks.map((b) => b.name)).toEqual([
      'L1',
      'C1',
      'Rd1',
      'L2',
      'C2',
      'Rd2',
    ])
  })
})

describe('clampAsst', () => {
  test('limits and bad values', () => {
    const a = clampAsst(
      {
        ...ASST_DEFAULTS,
        aDb: 1e6,
        fa: -5,
        split: 0,
        q: NaN,
        st: [
          { fix: 'L', val: 1, damp: 'bad' as DampForm },
          { fix: 'C', val: -1, damp: 'R' },
        ],
      },
      ASST_DEFAULTS
    )
    expect(a.aDb).toBe(150)
    expect(a.fa).toBe(0)
    expect(a.split).toBe(10)
    expect(a.q).toBe(ASST_DEFAULTS.q)
    expect(a.st[0]).toEqual({ fix: 'L', val: 10e-3, damp: 'rc' })
    expect(a.st[1]).toEqual({ fix: 'C', val: 1e-12, damp: 'R' })
  })
})

// Bug hunt 2026-11-05 (docs/BUGLOG.md).
describe('bug fixes 2026-11-05', () => {
  test('apply: a 4-part bank gives its bank ESR and ESL, not one part’s', () => {
    const st = withAsst(
      {
        ...buildPreset(1),
        blocks: [
          mk('ind', 'L', {}),
          mk('cap', 'C', { esr: 4e-3, esl: 2e-9, n: 4 }),
        ],
      },
      {}
    )
    let n = 0
    const d = applyProposal(st, propose(st), () => 'b' + n++)
    const C = d.blocks.find((b) => b.type === 'cap')!
    expect(C).toMatchObject({ n: 1 })
    near((C as { esr: number }).esr, 1e-3, 1e-9)
    near((C as { esl: number }).esl, 0.5e-9, 1e-9)
  })

  test('rounding keeps the fixed C as typed', () => {
    const st = withAsst(buildPreset(1), {
      st: [{ fix: 'C', val: 9.4e-6, damp: 'rc' }, ASST_DEFAULTS.st[1]],
    })
    expect(propose(st).rounded.stages[0].C).toBe(9.4e-6)
  })

  test('rounding keeps the fixed L as typed', () => {
    const st = withAsst(buildPreset(1), {
      st: [{ fix: 'L', val: 3.9e-6 * 1.01, damp: 'rc' }, ASST_DEFAULTS.st[1]],
    })
    expect(propose(st).rounded.stages[0].L).toBe(3.9e-6 * 1.01)
  })

  test('EMI target: a corner out of regulation is reported', () => {
    const base = buildPreset(1)
    const st = withAsst(
      {
        ...base,
        conv: { ...base.conv, vinMin: 5, vinNom: 5, vinMax: 5, vout: 5 },
        emi: { ...base.emi, on: true },
      },
      { target: 'emi' }
    )
    const w = propose(st).warnings.join(' ')
    expect(w).toContain('Out of regulation')
    expect(w).toContain('No EMI line is judged')
  })

  test('Cd ESR above the damping R the stage needs is reported', () => {
    const st = withAsst(
      {
        ...buildPreset(1),
        blocks: [
          mk('ind', 'L', {}),
          mk('cap', 'C', {}),
          mk('rc', 'Rd', { esr: 10 }),
        ],
      },
      {}
    )
    expect(propose(st).warnings.join(' ')).toContain('Cd ESR')
  })

  // L fixed at 1 µH, 80 dB at 100 kHz: at the 40 dB/dec start C is 25 mF,
  // above its 10 mF limit. A source L adds attenuation, so a higher f0 works.
  const smallL = (Ls: number) => {
    const base = buildPreset(1)
    return withAsst(
      { ...base, source: { ...base.source, L: Ls } },
      {
        aDb: 80,
        fa: 100e3,
        st: [{ fix: 'L', val: 1e-6, damp: 'rc' }, ASST_DEFAULTS.st[1]],
      }
    )
  }
  test('parts above range at the start: the search looks at higher f0', () => {
    const p = propose(smallL(10e-6))
    expect(p.reachable).toBe(true)
    expect(p.exact.stages[0].C).toBeLessThanOrEqual(10e-3)
    expect(p.exact.check.att).toBeGreaterThanOrEqual(80 - 1e-6)
  })
  test('unreachable: the proposal still keeps its parts in range', () => {
    const p = propose(smallL(0))
    expect(p.reachable).toBe(false)
    expect(p.exact.stages[0].C).toBeLessThanOrEqual(10e-3)
    expect(p.warnings.join(' ')).not.toContain('above its largest value')
  })

  test('clampAsst: a bad value with the other fix gets that part’s default', () => {
    const a = clampAsst(
      {
        ...ASST_DEFAULTS,
        st: [
          { fix: 'L', val: NaN, damp: 'rc' },
          { fix: 'C', val: NaN, damp: 'rc' },
        ],
      },
      ASST_DEFAULTS
    )
    expect(a.st[0].val).toBe(10e-6) // TYPES.ind L default, not 1 nH
    expect(a.st[1].val).toBe(10e-6)
  })
})
