// Design assistant (M3): propose L, C and damping from the requirements,
// round to E-series and check the result with the engine.
import { bands, converters, vinLow } from './bus'
import { cdForRd, closedForm, nForPeak, rdForQ } from './closed-form'
import { abs, db, TAU } from './complex'
import { emiResult } from './emi'
import { type ESeries, isESeries, snap, stepE } from './eseries'
import { point } from './ladder'
import { checkRange, marginBands, nyquistAt } from './metrics'
import type {
  AsstSettings,
  Block,
  CapBlock,
  DampForm,
  Design,
  IndBlock,
  RcBlock,
  StageIn,
} from './model'
import { cornerMetrics } from './oppoint'
import { type ParamSpec, TYPES } from './types'

// ---- Inputs and their limits (shared by adopt() and the reducer) ----

const spec = (t: 'ind' | 'cap' | 'rc', k: string) =>
  (TYPES[t].p as readonly ParamSpec<string>[]).find((p) => p.key === k)!
const L_LIM = spec('ind', 'L'),
  C_LIM = spec('cap', 'c'),
  RD_LIM = spec('rc', 'rd'),
  CD_LIM = spec('rc', 'cd')

export const ASST_LIM = {
  aDb: [1, 150],
  fa: [1, 1e9],
  split: [10, 90],
  q: [0.3, 20],
} as const

export const DAMP_FORMS: readonly DampForm[] = ['rc', 'RLpar', 'RLser', 'R']

export const DAMP_FORM_LABEL: Record<DampForm, string> = {
  rc: 'Rd-Cd across C',
  RLpar: 'Parallel Rd-Ld (across L)',
  RLser: 'Series Rd∥Ld (with L)',
  R: 'R across L',
}

const clamp = (v: number, [lo, hi]: readonly [number, number], def: number) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def

function clampStage(s: StageIn, def: StageIn): StageIn {
  const fix = s.fix === 'L' || s.fix === 'C' ? s.fix : def.fix
  const lim = fix === 'L' ? L_LIM : C_LIM
  return {
    fix,
    // A bad value falls back to the part default, as the Fix switch does.
    val: clamp(s.val, [lim.min, lim.max], fix === def.fix ? def.val : lim.def),
    damp: DAMP_FORMS.includes(s.damp) ? s.damp : def.damp,
  }
}

/**
 * The assistant inputs within their limits. adopt() and the reducer both
 * use it, so a reload gives back what was typed. `def` fills bad values.
 */
export function clampAsst(a: AsstSettings, def: AsstSettings): AsstSettings {
  return {
    on: a.on === true,
    stages: a.stages === 2 ? 2 : 1,
    target: a.target === 'emi' ? 'emi' : 'db',
    aDb: clamp(a.aDb, ASST_LIM.aDb, def.aDb),
    // 0 means auto; any value at or below 0 is auto.
    fa: !(a.fa > 0) ? 0 : clamp(a.fa, ASST_LIM.fa, def.fa),
    split: clamp(a.split, ASST_LIM.split, def.split),
    rule: a.rule === 'leastCd' ? 'leastCd' : 'q',
    q: clamp(a.q, ASST_LIM.q, def.q),
    st: [clampStage(a.st[0], def.st[0]), clampStage(a.st[1], def.st[1])],
    ser: {
      L: isESeries(a.ser.L) ? a.ser.L : def.ser.L,
      C: isESeries(a.ser.C) ? a.ser.C : def.ser.C,
      R: isESeries(a.ser.R) ? a.ser.R : def.ser.R,
    },
  }
}

// ---- Requirements of the bus ----

/** Target frequency: fa, or the lowest N·fsw of the converters that are on. */
export function faOf(st: Design): number {
  if (st.asst.fa > 0) return st.asst.fa
  return Math.min(
    ...converters(st).map((c) => Math.max(1, Math.round(c.phases || 1)) * c.fsw)
  )
}

/**
 * Highest allowed peak |Zout|: the lowest band |Rn| at Vin min, full power,
 * divided by the margin k.
 */
export function zMaxOf(st: Design): number {
  const [fLo] = checkRange(st)
  const rn = Math.min(
    ...bands(st, vinLow(st.conv), fLo).map((b) => Math.abs(b.rn))
  )
  return rn * 10 ** (-st.conv.k / 20)
}

// ---- One stage ----

/**
 * Values of one stage. rd is the total damping R (part value + Cd ESR);
 * null when the DCR alone gives the target Q, so no damping part is used.
 */
export type StageVals = {
  form: DampForm
  L: number
  C: number
  rd: number | null
  /** Cd (rc). */
  cd: number | null
  /** Ld (RLpar, RLser). */
  ld: number | null
}

export type StageOut = StageVals & {
  f0: number
  Z0: number
  /** Qstab = Zmax/Z0. */
  qStab: number
  /** Peak target used, as a multiple of Z0. */
  r: number
  /** n = Cd/C (rc) or Ld/L (RLpar, RLser); null for R. */
  n: number | null
}

/** Old blocks that give their parasitics to stage i of a new design. */
type Carry = { ind: IndBlock | null; cap: CapBlock | null; rc: RcBlock | null }

function carryOf(st: Design, stages: number): Carry[] {
  const on = st.blocks.filter((b) => b.on)
  const inds = on.filter((b): b is IndBlock => b.type === 'ind')
  const caps = on.filter((b): b is CapBlock => b.type === 'cap')
  const rcs = on.filter((b): b is RcBlock => b.type === 'rc')
  // Counted from the converter side: a 1-stage design takes the parts
  // nearest the converter.
  const at = <T>(list: T[], i: number) => list[list.length - stages + i] ?? null
  return Array.from({ length: stages }, (_, i) => ({
    ind: at(inds, i),
    cap: at(caps, i),
    rc: at(rcs, i),
  }))
}

const dcrOf = (c: Carry) => (c.ind ? c.ind.dcr : TYPES.ind.p[1].def)

/**
 * Size one stage at f0. r is the peak target as a multiple of Z0 (target Q,
 * or Qstab for the 'leastCd' rule). rc with rule 'q' follows NP-DR-26001:
 * Rd = Z0²/(Z0/Q − rL), Xcd = Rd/10 at f0. The other cases use the
 * closed-form optimum (Erickson) for that peak.
 */
export function sizeStage(
  inp: StageIn,
  f0: number,
  rule: AsstSettings['rule'],
  r: number,
  zMax: number,
  rL: number,
  warn: (w: string) => void
): StageOut {
  const w2 = (TAU * f0) ** 2
  const L = inp.fix === 'L' ? inp.val : 1 / (w2 * inp.val)
  const C = inp.fix === 'C' ? inp.val : 1 / (w2 * inp.val)
  const Z0 = Math.sqrt(L / C)
  const qStab = zMax / Z0
  const out = { L, C, f0, Z0, qStab, r, form: inp.damp }
  const rdQ = () => {
    const rd = rdForQ(Z0, r, rL)
    if (Number.isFinite(rd)) return rd
    warn(`The DCR alone gives Q ≤ ${r.toPrecision(3)}: no damping part.`)
    return null
  }
  if (inp.damp === 'R')
    return { ...out, rd: rdQ(), cd: null, ld: null, n: null }
  if (inp.damp === 'rc' && rule === 'q') {
    const rd = rdQ()
    if (rd === null) return { ...out, rd, cd: null, ld: null, n: null }
    const cd = cdForRd(f0, rd)
    return { ...out, rd, cd, ld: null, n: cd / C }
  }
  let rr = r
  if (inp.damp === 'RLser' && !(r * r > 2)) {
    warn('Series Rd∥Ld cannot get the peak below 1.41·Z0; used 1.5·Z0.')
    rr = 1.5
  }
  const n = nForPeak(inp.damp, rr)!
  const rd = closedForm(inp.damp, n, Z0)!.rd
  if (inp.damp === 'rc') return { ...out, r: rr, rd, cd: n * C, ld: null, n }
  return { ...out, r: rr, rd, cd: null, ld: n * L, n }
}

// ---- Blocks ----

/**
 * The block list of a proposal, source side first: per stage an inductor
 * (with its damping mode), a capacitor bank, and an Rd-Cd leg for 'rc'.
 * Parasitics come from the old block in the same role, else TYPES
 * defaults; curves, tolerances and DC-bias loss belong to the old part and
 * are dropped. The rc leg's Cd ESR counts in Rd, so the part is rd − ESR.
 */
export function blocksOf(
  st: Design,
  vals: StageVals[],
  mkId: () => string
): Block[] {
  const carry = carryOf(st, vals.length)
  const out: Block[] = []
  vals.forEach((v, i) => {
    const c = carry[i]
    const tag = vals.length > 1 ? String(i + 1) : ''
    const dmode =
      v.rd === null || v.form === 'rc' ? 'none' : v.form === 'R' ? 'R' : v.form
    out.push({
      id: mkId(),
      type: 'ind',
      name: 'L' + tag,
      on: true,
      L: v.L,
      dcr: dcrOf(c),
      cp: c.ind ? c.ind.cp : 0,
      dmode,
      dR: v.rd === null || dmode === 'none' ? (c.ind?.dR ?? 1) : v.rd,
      dL: v.ld ?? c.ind?.dL ?? 10e-6,
    })
    out.push({
      id: mkId(),
      type: 'cap',
      name: 'C' + tag,
      on: true,
      c: v.C,
      // The new bank is one part: the old bank's ESR and ESL, not one part's.
      esr: c.cap ? c.cap.esr / Math.max(1, c.cap.n) : TYPES.cap.p[1].def,
      esl: c.cap ? c.cap.esl / Math.max(1, c.cap.n) : 0,
      n: 1,
      derate: 0,
    })
    if (v.form === 'rc' && v.rd !== null && v.cd !== null) {
      const esr = c.rc ? c.rc.esr : 0
      out.push({
        id: mkId(),
        type: 'rc',
        name: 'Rd' + tag,
        on: true,
        rd: Math.max(RD_LIM.min, v.rd - esr),
        cd: v.cd!,
        esr,
        esl: c.rc ? c.rc.esl : 0,
      })
    }
  })
  return out
}

let probeId = 0
const probe = () => 'asst' + probeId++

const withVals = (st: Design, vals: StageVals[]): Design => ({
  ...st,
  blocks: blocksOf(st, vals, probe),
})

// ---- Checks ----

export type Check = {
  /** Attenuation at fa, dB, positive. */
  att: number
  /** Lowest EMI band margin, dB (target 'emi'); null otherwise. */
  emi: number | null
  /** Nominal margin, dB (Vin min, full power). */
  margin: number
  unstableAt: number | null
  /** Attenuation (or EMI) and margin targets both met, and stable. */
  pass: boolean
  /** How far from the targets, dB summed; 0 when pass. */
  short: number
}

function emiMin(d: Design): number {
  const r = emiResult(d)
  let m = Infinity
  for (const row of r.rows) if (row.margin !== null) m = Math.min(m, row.margin)
  return m
}

function attOf(d: Design, fa: number) {
  return -db(abs(point(d, fa).Hopen))
}

/** Shortfall of the attenuation or EMI target alone, dB. */
function attShort(d: Design, fa: number): number {
  return d.asst.target === 'emi'
    ? Math.max(0, -emiMin(d))
    : Math.max(0, d.asst.aDb - attOf(d, fa))
}

export function checkOf(d: Design, fa: number): Check {
  const att = attOf(d, fa)
  const emi = d.asst.target === 'emi' ? emiMin(d) : null
  const mb = marginBands(d, vinLow(d.conv))
  const unstableAt = nyquistAt(d, mb.bands)
  const aS = emi !== null ? Math.max(0, -emi) : Math.max(0, d.asst.aDb - att)
  const short =
    aS + Math.max(0, d.conv.k - mb.margin) + (unstableAt !== null ? 10 : 0)
  return {
    att,
    emi: emi === Infinity ? null : emi,
    margin: mb.margin,
    unstableAt,
    pass: short === 0,
    short,
  }
}

// ---- The proposal ----

export type Proposal = {
  fa: number
  zMax: number
  /** Continuous values after the attenuation solve and margin polish. */
  exact: { stages: StageOut[]; check: Check }
  /** Values on their E-series; `moved` lists parts not at the nearest value. */
  rounded: { stages: StageVals[]; check: Check; moved: string[] }
  /** Worst operating-point corner of the rounded design. */
  corner: { label: string; margin: number; pass: boolean } | null
  /** False when the target cannot be met within the part ranges. */
  reachable: boolean
  warnings: string[]
}

/** Lowest f0 scale tried: f0 below fa/10⁴ is not a filter. */
const U_MIN = 1e-4

/** A value out of its TYPES range. */
function outOfRange(s: StageVals): string | null {
  if (s.L > L_LIM.max) return 'L'
  if (s.C > C_LIM.max) return 'C'
  if (s.cd !== null && s.cd > CD_LIM.max) return 'Cd'
  if (s.ld !== null && s.ld > L_LIM.max) return 'Ld'
  return null
}

/**
 * Propose a design for st.asst. Pure; ids in the result are probes, so
 * use applyProposal() to make a design from it.
 */
export function propose(st: Design): Proposal {
  const a = st.asst
  const S = a.stages
  const fa = faOf(st)
  const zMax = zMaxOf(st)
  const warnings: string[] = []
  const warn = (w: string) => {
    if (!warnings.includes(w)) warnings.push(w)
  }
  const carry = carryOf(st, S)
  // dB per stage. EMI: the equivalent dB at fa from the EMI f0 hint.
  let aTot = a.aDb
  if (a.target === 'emi') {
    const bare = emiResult({ ...st, blocks: [] })
    aTot = bare.f0Max ? 40 * Math.log10(fa / bare.f0Max) : 20
    if (!st.emi.on) warn('EMI is off; the target uses its current settings.')
    // Lesson 12: corners with no switching are not judged; say so.
    if (bare.dropout.length)
      warn(
        `Out of regulation at ${bare.dropout.join('; ')} (Vout ≥ Vin·η): ` +
          'the EMI target does not judge it.'
      )
    if (!bare.rows.some((r) => r.margin !== null))
      warn('No EMI line is judged, so the EMI target sets nothing.')
  }
  const share = S === 1 ? [1] : [a.split / 100, 1 - a.split / 100]
  const f0s = share.map((s) => fa * 10 ** (-(aTot * s) / 40))
  const stageIns = a.st.slice(0, S)

  /** Stages at f0 scale u and peak-target factor g. */
  const size = (u: number, g: number, w = warn) =>
    stageIns.map((inp, i) => {
      const f0 = f0s[i] * u
      const Z0 = inp.fix === 'L' ? inp.val * TAU * f0 : 1 / (TAU * f0 * inp.val)
      const r = (a.rule === 'q' ? a.q : zMax / Z0) * g
      return sizeStage(inp, f0, a.rule, r, zMax, dcrOf(carry[i]), w)
    })
  const quiet = () => {}
  const inRange = (u: number, g: number) =>
    !size(u, g, quiet).some((s) => outOfRange(s))
  const attOk = (u: number, g: number) =>
    inRange(u, g) && attShort(withVals(st, size(u, g, quiet)), fa) === 0
  const belowFa = (u: number) => f0s.every((f) => f * u < fa)
  /** u0, or the lowest scale above it that keeps every part in range. */
  const upToRange = (u0: number, g: number) => {
    let u = u0
    while (!inRange(u, g) && belowFa(u * 2)) u *= 2
    return u
  }

  // The search stops when an f0 reaches fa: C and the source alone
  // already meet the target.
  let atFa = false
  /** Largest f0 scale u that meets the attenuation target, or null. */
  const solveU = (g: number, start: number): number | null => {
    // A higher f0 scale makes the parts smaller: when a part is above its
    // range at the start, look upwards first.
    const u0 = upToRange(start, g)
    let lo: number, hi: number
    if (attOk(u0, g)) {
      lo = u0
      hi = u0 * 2
      while (attOk(hi, g)) {
        lo = hi
        hi *= 2
        if (f0s.some((f) => f * lo >= fa)) {
          atFa = true
          return lo
        }
      }
    } else {
      hi = u0
      lo = u0 / 2
      while (!attOk(lo, g)) {
        hi = lo
        lo /= 2
        if (lo < U_MIN) return null
      }
    }
    while (hi / lo > 1.001) {
      const mid = Math.sqrt(lo * hi)
      if (attOk(mid, g)) lo = mid
      else hi = mid
    }
    return lo
  }

  let reachable = true
  let g = 1
  let u = solveU(g, 1)
  if (u === null) {
    reachable = false
    // The lowest scale that keeps every part in range.
    u = upToRange(1, g)
    while (u > U_MIN && inRange(u / 2, g)) u /= 2
    warn(
      a.target === 'emi'
        ? 'The EMI target cannot be met within the part ranges.'
        : `${a.aDb} dB at ${fa.toPrecision(3)} Hz cannot be met within the part ranges.`
    )
  }
  // Margin polish ('leastCd' only): lower the peak target until the
  // nominal margin holds with 0.1 dB to spare, then solve f0 again.
  const marginOk = (uu: number, gg: number) => {
    // A lower peak target makes Cd or Ld larger: keep it in range.
    if (!inRange(uu, gg)) return false
    const d = withVals(st, size(uu, gg, quiet))
    const mb = marginBands(d, vinLow(d.conv))
    return mb.margin >= st.conv.k + 0.1 && nyquistAt(d, mb.bands) === null
  }
  if (a.rule === 'leastCd' && reachable)
    for (let round = 0; round < 2 && !marginOk(u, g); round++) {
      let lo = 0.02,
        hi = g
      if (!marginOk(u, lo)) break
      while (hi / lo > 1.002) {
        const mid = Math.sqrt(lo * hi)
        if (marginOk(u, mid)) lo = mid
        else hi = mid
      }
      g = lo
      u = solveU(g, u) ?? u
    }
  if (atFa)
    warn(
      'C and the source impedance alone almost meet the target: L is very small.'
    )
  const exactStages = size(u, g)
  const exactDesign = withVals(st, exactStages)
  const exactCheck = checkOf(exactDesign, fa)
  exactStages.forEach((s, i) => {
    const o = outOfRange(s)
    if (o) warn(`${o} is above its largest value.`)
    // The Rd part is the total minus the carried Cd ESR; it cannot go below 0.
    const esr = carry[i].rc?.esr ?? 0
    if (s.form === 'rc' && s.rd !== null && s.rd - esr < RD_LIM.min)
      warn(
        `The Cd ESR (${esr.toPrecision(3)} Ω) is above the damping R the ` +
          `stage needs (${s.rd.toPrecision(3)} Ω): use a Cd with less ESR.`
      )
  })
  if (a.rule === 'q' && exactCheck.margin < st.conv.k) {
    const qs = Math.min(...exactStages.map((s) => s.qStab))
    warn(
      `Q ${a.q} is too high for margin k: Qstab = ${qs.toPrecision(3)}. ` +
        'Lower the target Q or use "Just meet margin k".'
    )
  }

  const rounded = roundE(st, exactStages, fa)
  const rd = withVals(st, rounded.stages)
  const cm = cornerMetrics(rd)
  const w = cm.rows[cm.worst]
  return {
    fa,
    zMax,
    exact: { stages: exactStages, check: exactCheck },
    rounded,
    corner: w ? { label: w.label, margin: w.margin, pass: w.pass } : null,
    reachable,
    warnings,
  }
}

// ---- E-series ----

type PartRef = { i: number; key: 'L' | 'C' | 'rd' | 'cd' | 'ld'; ser: ESeries }

function partsOf(stages: StageVals[], a: AsstSettings): PartRef[] {
  const out: PartRef[] = []
  const ser = a.ser
  stages.forEach((s, i) => {
    // The fixed L or C is the user's part: keep it as typed.
    if (a.st[i].fix !== 'L') out.push({ i, key: 'L', ser: ser.L })
    if (a.st[i].fix !== 'C') out.push({ i, key: 'C', ser: ser.C })
    if (s.rd !== null) out.push({ i, key: 'rd', ser: ser.R })
    if (s.cd !== null) out.push({ i, key: 'cd', ser: ser.C })
    if (s.ld !== null) out.push({ i, key: 'ld', ser: ser.L })
  })
  return out
}

export const PART_LABEL = { L: 'L', C: 'C', rd: 'Rd', cd: 'Cd', ld: 'Ld' }

/**
 * Snap every value to its series (log-nearest), then, while a target
 * fails, move one part to its other neighbour: each round tries every part
 * and keeps the move that cuts the shortfall most.
 */
function roundE(
  st: Design,
  exact: StageVals[],
  fa: number
): { stages: StageVals[]; check: Check; moved: string[] } {
  const parts = partsOf(exact, st.asst)
  const carry = carryOf(st, exact.length)
  // Rd is rounded as the part value: total minus the Cd ESR of the leg.
  const esr = (i: number) =>
    exact[i].form === 'rc' && carry[i].rc ? carry[i].rc!.esr : 0
  const partVal = (s: StageVals[], p: PartRef) =>
    p.key === 'rd' ? s[p.i].rd! - esr(p.i) : (s[p.i][p.key] as number)
  const setPart = (s: StageVals[], p: PartRef, v: number): StageVals[] =>
    s.map((x, i) =>
      i !== p.i ? x : { ...x, [p.key]: p.key === 'rd' ? v + esr(i) : v }
    )
  let cur = exact
  for (const p of parts)
    cur = setPart(cur, p, snap(partVal(exact, p), p.ser).nearest)
  const nearest = cur
  let check = checkOf(withVals(st, cur), fa)
  for (let round = 0; round < parts.length && !check.pass; round++) {
    let best: { s: StageVals[]; c: Check } | null = null
    for (const p of parts) {
      const now = partVal(cur, p)
      for (const v of [stepE(now, p.ser, 1), stepE(now, p.ser, -1)]) {
        const s = setPart(cur, p, v)
        if (outOfRange(s[p.i])) continue
        const c = checkOf(withVals(st, s), fa)
        if (c.short < (best?.c.short ?? check.short)) best = { s, c }
      }
    }
    if (!best) break
    cur = best.s
    check = best.c
  }
  const moved = parts
    .filter((p) => partVal(cur, p) !== partVal(nearest, p))
    .map((p) => PART_LABEL[p.key] + (exact.length > 1 ? String(p.i + 1) : ''))
  return { stages: cur, check, moved }
}

/** The design with the proposal's E-series values in place of its blocks. */
export function applyProposal(
  st: Design,
  p: Proposal,
  mkId: () => string
): Design {
  return { ...st, blocks: blocksOf(st, p.rounded.stages, mkId) }
}
