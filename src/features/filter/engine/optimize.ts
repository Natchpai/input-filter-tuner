// Design optimizer (M3b, docs/M3-plan.md): the design with the least Cd,
// total C or DC loss that meets the attenuation or EMI target, margin k,
// the gain-peak limit and the DC loss limit. Pure; it runs in
// workers/optimize.worker.ts.
import { bands, iBus, pBus, vinLow } from './bus'
import { closedForm, nForPeak, rdForQ } from './closed-form'
import { abs, db, TAU } from './complex'
import {
  blocksOf,
  carryOf,
  type Check,
  DAMP_FORMS,
  faOf,
  outOfRange,
  type Proposal,
  roundE,
  type StageOut,
  type StageVals,
  withVals,
  zMaxOf,
} from './design'
import { type EmiPrep, emiMarginOf, emiPrep, emiResult } from './emi'
import { point } from './ladder'
import { checkRange, marginBands, nyquistAt } from './metrics'
import type { DampForm, Design, OptGoal, StageRng } from './model'
import { cornerMetrics } from './oppoint'
import { peakH, peaksZH } from './peak'
import { type ParamSpec, TYPES } from './types'

const spec = (t: 'ind' | 'cap', k: string) =>
  (TYPES[t].p as readonly ParamSpec<string>[]).find((p) => p.key === k)!
const L_LIM = spec('ind', 'L'),
  C_LIM = spec('cap', 'c'),
  DCR_DEF = spec('ind', 'dcr').def

/** The exact check plus the two M3b limits. */
export type OptCheck = Check & {
  /** Gain peak max|Hopen|, ratio. */
  hPeak: number
  /** Filter DC loss, % of bus Pout. */
  loss: number
}

/** Q window of one stage (NP-DR-26004 §4; docs/equations.md). */
export type QWindow = {
  qStab: number
  /** Qpeak limit, null when off. */
  qPeak: number | null
  /** Qloss = Z0/(ε·Vin²/Pin), null when the loss limit is off. */
  qLoss: number | null
}

export type OptResult = Proposal & {
  goal: OptGoal
  /** Goal value of the exact and the E-series design (F or %). */
  value: { exact: number; rounded: number }
  exactX: OptCheck
  roundedX: OptCheck
  window: QWindow[]
  /** Constraints that hold with little slack on the exact design. */
  binding: string[]
  /** The resolved L and C ranges per stage. */
  ranges: StageRng[]
}

/** One candidate: L and C per stage, the damping forms, the peak factors. */
type Cand = { L: number[]; C: number[]; forms: DampForm[]; g: number[] }

const clampTo = (v: number, lim: ParamSpec<string>) =>
  Math.min(lim.max, Math.max(lim.min, v))

/** L and C ranges: 0 is the part in that role ×0.1…×10, clipped. */
export function rangesOf(st: Design): StageRng[] {
  const S = st.asst.stages
  const carry = carryOf(st, S)
  return Array.from({ length: S }, (_, i) => {
    const r = st.asst.rng[i]
    const c = carry[i]
    const L0 = c.ind ? c.ind.L : L_LIM.def
    const C0 = c.cap ? c.cap.c * Math.max(1, c.cap.n) : C_LIM.def
    const lo = (v: number, x: number, lim: ParamSpec<string>) =>
      v > 0 ? v : clampTo(x / 10, lim)
    const hi = (v: number, x: number, lim: ParamSpec<string>) =>
      v > 0 ? v : clampTo(x * 10, lim)
    return {
      lMin: lo(r.lMin, L0, L_LIM),
      lMax: hi(r.lMax, L0, L_LIM),
      cMin: lo(r.cMin, C0, C_LIM),
      cMax: hi(r.cMax, C0, C_LIM),
    }
  })
}

/** DCR per henry of each stage: the old inductor's, else the defaults. */
export function rhoOf(st: Design): number[] {
  return carryOf(st, st.asst.stages).map((c) =>
    c.ind && c.ind.L > 0 ? c.ind.dcr / c.ind.L : DCR_DEF / L_LIM.def
  )
}

/**
 * One stage from L, C, the form and the peak target r (multiple of Z0),
 * with the least damping for that peak (closed forms; R across L from
 * rdForQ with Q = r). null when the form cannot reach r.
 */
function sizeLC(
  L: number,
  C: number,
  form: DampForm,
  r: number,
  rL: number,
  qStab: number
): StageOut | null {
  const Z0 = Math.sqrt(L / C)
  const f0 = 1 / (TAU * Math.sqrt(L * C))
  const base = { L, C, f0, Z0, qStab, r, form }
  if (form === 'R') {
    const rd = rdForQ(Z0, r, rL)
    return {
      ...base,
      rd: Number.isFinite(rd) ? rd : null,
      cd: null,
      ld: null,
      n: null,
    }
  }
  const n = nForPeak(form, r)
  if (n === null || !(n > 0)) return null
  const rd = closedForm(form, n, Z0)!.rd
  return form === 'rc'
    ? { ...base, rd, cd: n * C, ld: null, n }
    : { ...base, rd, cd: null, ld: n * L, n }
}

/** Every combination of the allowed forms over the stages. */
function formSets(st: Design): DampForm[][] {
  const a = st.asst
  const per = a.st
    .slice(0, a.stages)
    .map((s) =>
      a.goal === 'cd'
        ? ['rc' as const]
        : a.allForms
          ? [...DAMP_FORMS]
          : [s.damp]
    )
  return per.reduce<DampForm[][]>(
    (acc, fs) => acc.flatMap((x) => fs.map((f) => [...x, f])),
    [[]]
  )
}

const logGrid = (lo: number, hi: number, n: number) =>
  Array.from({ length: n }, (_, i) =>
    n === 1 ? lo : lo * (hi / lo) ** (i / (n - 1))
  )

/**
 * Everything one optimizer run shares: values, goal, checks and the
 * damping solve. Exported for the tests (optimize.test.ts).
 */
export function optContext(st: Design) {
  const a = st.asst
  const S = a.stages
  const goal = a.goal === 'meet' ? 'ctot' : a.goal
  const fa = faOf(st)
  const zMax = zMaxOf(st)
  const rho = rhoOf(st)
  const ranges = rangesOf(st)
  const warnings: string[] = []
  const warn = (w: string) => {
    if (!warnings.includes(w)) warnings.push(w)
  }
  const vin = vinLow(st.conv)
  const iDc = iBus(st, vin, 'full')
  const pFull = pBus(st, 'full')
  const [fLo, fChk] = checkRange(st)
  const fHi = Math.max(fChk, fa)
  const emi = a.target === 'emi'
  const prep: EmiPrep | null = emi ? emiPrep(st) : null
  if (emi) {
    if (!st.emi.on) warn('EMI is off; the target uses its current settings.')
    const bare = emiResult({ ...st, blocks: [] })
    if (!bare.rows.some((r) => r.margin !== null))
      warn('No EMI line is judged, so the EMI target sets nothing.')
  }

  // ---- Values, goal and checks ----
  const lossOf = (s: StageVals[]) =>
    (100 *
      iDc *
      iDc *
      s.reduce(
        (t, v, i) =>
          t + rho[i] * (v.L + (v.form === 'RLser' ? (v.ld ?? 0) : 0)),
        0
      )) /
    pFull
  const goalOf = (s: StageVals[]) =>
    goal === 'cd'
      ? s.reduce((t, v) => t + (v.cd ?? 0), 0)
      : goal === 'ctot'
        ? s.reduce((t, v) => t + v.C + (v.cd ?? 0), 0)
        : lossOf(s)
  const design = (s: StageVals[]) => withVals(st, s, rho)
  const attShort = (d: Design) =>
    prep
      ? Math.max(0, -emiMarginOf(prep, d.blocks))
      : Math.max(0, a.aDb + db(abs(point(d, fa).Hopen)))
  const fullCheck = (s: StageVals[]): OptCheck => {
    const d = design(s)
    const att = -db(abs(point(d, fa).Hopen))
    const em = prep ? emiMarginOf(prep, d.blocks) : null
    const mb = marginBands(d, vin)
    const unstableAt = nyquistAt(d, mb.bands)
    const hPeak = peakH(d, fLo, fHi).v
    const loss = lossOf(s)
    const aS = em !== null ? Math.max(0, -em) : Math.max(0, a.aDb - att)
    const short =
      aS +
      Math.max(0, st.conv.k - mb.margin) +
      (unstableAt !== null ? 10 : 0) +
      (a.qPeak > 0 ? Math.max(0, db(hPeak / a.qPeak)) : 0) +
      (a.eps > 0 ? Math.max(0, db(loss / a.eps)) : 0)
    return {
      att,
      emi: em === null || em === Infinity ? null : em,
      margin: mb.margin,
      unstableAt,
      hPeak,
      loss,
      pass: short === 0,
      short,
    }
  }
  /** Damping limits only (margin with 0.1 dB to spare, Nyquist, H peak). */
  // Nyquist can fail only where Re(Zout) > |Rn|, so only where the margin
  // is below 0 dB on the same bands: with k + 0.1 > 0 the margin check
  // covers it. fullCheck still runs it on the result.
  const kNeed = st.conv.k + 0.1
  // One converter band over the same range as the H peak: one shared scan.
  const shared = a.qPeak > 0 && fHi === fChk && bands(st, vin, fLo).length === 1
  const dampOk = (s: StageVals[]) => {
    const d = design(s)
    let hPk: number | null = null
    let mb: ReturnType<typeof marginBands>
    if (shared) {
      const [pz, ph] = peaksZH(d, fLo, fHi)
      mb = marginBands(d, vin, pz)
      hPk = ph.v
    } else mb = marginBands(d, vin)
    if (mb.margin < kNeed) return false
    if (!(kNeed > 0) && nyquistAt(d, mb.bands) !== null) return false
    if (!(a.qPeak > 0)) return true
    return (hPk ?? peakH(d, fLo, fHi).v) <= a.qPeak
  }
  const lossOk = (s: StageVals[]) => !(a.eps > 0) || lossOf(s) <= a.eps

  /** Stage values of a candidate; null when a form cannot reach its peak. */
  const valsOf = (c: Cand): StageVals[] | null => {
    const out: StageOut[] = []
    for (let i = 0; i < S; i++) {
      const Z0 = Math.sqrt(c.L[i] / c.C[i])
      const qStab = zMax / Z0
      const r0 = a.qPeak > 0 ? Math.min(qStab, a.qPeak) : qStab
      const v = sizeLC(
        c.L[i],
        c.C[i],
        c.forms[i],
        c.g[i] * r0,
        rho[i] * c.L[i],
        qStab
      )
      if (!v || outOfRange(v)) return null
      out.push(v)
    }
    return out
  }
  const inRng = (c: Cand) =>
    c.L.every(
      (L, i) => L >= ranges[i].lMin * 0.9999 && L <= ranges[i].lMax * 1.0001
    ) &&
    c.C.every(
      (C, i) => C >= ranges[i].cMin * 0.9999 && C <= ranges[i].cMax * 1.0001
    )

  /**
   * The largest peak factor g (least damping) that meets the damping
   * limits, then the attenuation check; null when none does.
   */
  const cache = new Map<string, { c: Cand; s: StageVals[] } | null>()
  const solveG = (c: Cand): { c: Cand; s: StageVals[] } | null => {
    const key = [...c.L, ...c.C, ...c.g]
      .map((x) => x.toPrecision(9))
      .concat(c.forms)
      .join()
    if (cache.has(key)) return cache.get(key)!
    const r = solveG0(c)
    cache.set(key, r)
    return r
  }
  const solveG0 = (c: Cand): { c: Cand; s: StageVals[] } | null => {
    const at = (t: number): Cand => ({ ...c, g: c.g.map((x) => x * t) })
    const ok = (t: number) => {
      const s = valsOf(at(t))
      return s !== null && dampOk(s)
    }
    let lo: number, hi: number
    const g0 = 1
    if (ok(g0)) {
      lo = g0
      hi = g0 * 1.5
      while (hi <= 4 && ok(hi)) {
        lo = hi
        hi *= 1.5
      }
      if (hi > 4) hi = Math.max(lo * 1.0001, 4)
    } else {
      hi = g0
      lo = g0 / 1.5
      while (!ok(lo)) {
        hi = lo
        lo /= 1.5
        if (lo < 0.02) return null
      }
    }
    while (hi / lo > 1.02) {
      const mid = Math.sqrt(lo * hi)
      if (ok(mid)) lo = mid
      else hi = mid
    }
    const s = valsOf(at(lo))!
    if (!lossOk(s) || attShort(design(s)) > 0) return null
    return { c: at(lo), s }
  }
  /**
   * 2 stages: each stage's own peak factor as high as the limits allow
   * (less damping in one stage), the other one fixed.
   */
  const perStage = (r: { c: Cand; s: StageVals[] }) => {
    let cur = r
    for (let i = 0; i < S && S > 1; i++) {
      const at = (x: number): Cand => ({
        ...cur.c,
        g: cur.c.g.map((v, j) => (j === i ? x : v)),
      })
      const ok = (x: number) => {
        const s = valsOf(at(x))
        return s !== null && dampOk(s) && lossOk(s) && attShort(design(s)) === 0
      }
      let lo = cur.c.g[i],
        hi = lo * 1.5
      while (hi <= 8 && ok(hi)) {
        lo = hi
        hi *= 1.5
      }
      while (hi / lo > 1.02) {
        const mid = Math.sqrt(lo * hi)
        if (ok(mid)) lo = mid
        else hi = mid
      }
      if (lo > cur.c.g[i]) cur = { c: at(lo), s: valsOf(at(lo))! }
    }
    return cur
  }

  return {
    a,
    S,
    goal,
    fa,
    zMax,
    rho,
    ranges,
    warnings,
    warn,
    vin,
    iDc,
    pFull,
    fLo,
    fHi,
    emi,
    prep,
    lossOf,
    goalOf,
    design,
    attShort,
    fullCheck,
    dampOk,
    lossOk,
    valsOf,
    inRng,
    solveG,
    perStage,
  }
}

/**
 * Minimize st.asst.goal (not 'meet'). progress(x) gets the done share,
 * 0 to 1.
 */
export function optimize(
  st: Design,
  progress: (x: number) => void = () => {}
): OptResult {
  const {
    a,
    S,
    goal,
    fa,
    zMax,
    ranges,
    warnings,
    warn,
    vin,
    iDc,
    emi,
    goalOf,
    design,
    attShort,
    fullCheck,
    dampOk,
    lossOk,
    valsOf,
    inRng,
    solveG,
    perStage,
  } = optContext(st)
  // ---- 1. Coarse grid on closed forms ----
  const nG = S === 1 ? 24 : 8
  const gridL = ranges.map((r) => logGrid(r.lMin, r.lMax, nG))
  const gridC = ranges.map((r) => logGrid(r.cMin, r.cMax, nG))
  const sets = formSets(st)
  type Pt = { c: Cand; goal: number; idx: number[] }
  const pts: Pt[] = []
  const dims = 2 * S
  const total = nG ** dims
  for (const forms of sets)
    for (let k = 0; k < total; k++) {
      const idx: number[] = []
      for (let j = 0, q = k; j < dims; j++, q = Math.floor(q / nG))
        idx.push(q % nG)
      const c: Cand = {
        L: ranges.map((_, i) => gridL[i][idx[2 * i]]),
        C: ranges.map((_, i) => gridC[i][idx[2 * i + 1]]),
        forms,
        g: ranges.map(() => 1),
      }
      const s = valsOf(c)
      if (!s || !lossOk(s) || attShort(design(s)) > 0) continue
      pts.push({ c, goal: goalOf(s), idx: [...idx, sets.indexOf(forms)] })
    }
  progress(0.2)
  pts.sort((x, y) => x.goal - y.goal)
  // Up to K start points, best goal first, not next to one already taken;
  // a point that fails the exact damping limits is skipped.
  const K = S === 1 ? 4 : 3
  const starts: { p: Pt; r: { c: Cand; s: StageVals[] } }[] = []
  for (let j = 0, tries = 0; j < pts.length && starts.length < K; j++) {
    const p = pts[j]
    const near = starts.some(
      ({ p: q }) =>
        q.idx[dims] === p.idx[dims] &&
        p.idx.slice(0, dims).every((v, m) => Math.abs(v - q.idx[m]) <= 1)
    )
    if (near) continue
    if (++tries > 8 * K) break
    const r = solveG(p.c)
    if (r) starts.push({ p, r })
  }

  // ---- 2. Exact polish: g, then a compass search in log L, log C ----
  type Done = { c: Cand; s: StageVals[]; goal: number }
  const polished: Done[] = []
  starts.forEach(({ r: cur }, ki) => {
    const c0 = perStage(cur)
    let best: Done = { ...c0, goal: goalOf(c0.s) }
    // Moves per stage in (log L, log C): each axis, and the two diagonals
    // along L·C = const, which a binding attenuation target needs (less L
    // only with more C). First improving move wins; the last good one is
    // tried first.
    const DIRS = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, -1],
      [-1, 1],
    ]
    const moves = Array.from({ length: S * DIRS.length }, (_, m) => m)
    for (let step = Math.log(1.26); step > Math.log(1.01); step /= 2) {
      for (let it = 0; it < 16; it++) {
        let next: Done | null = null
        for (let k = 0; k < moves.length && !next; k++) {
          const m = moves[k]
          const i = Math.floor(m / DIRS.length),
            [dl, dc] = DIRS[m % DIRS.length]
          const L = [...best.c.L],
            C = [...best.c.C]
          // A move past a range bound stops at the bound.
          const rg = ranges[i]
          L[i] = Math.min(
            rg.lMax,
            Math.max(rg.lMin, L[i] * Math.exp(dl * step))
          )
          C[i] = Math.min(
            rg.cMax,
            Math.max(rg.cMin, C[i] * Math.exp(dc * step))
          )
          if (L[i] === best.c.L[i] && C[i] === best.c.C[i]) continue
          const c: Cand = { ...best.c, L, C }
          if (!inRng(c)) continue
          const r = solveG(c)
          if (!r) continue
          const gv = goalOf(r.s)
          if (gv < best.goal * (1 - 1e-9)) {
            next = { ...r, goal: gv }
            moves.splice(k, 1)
            moves.unshift(m)
          }
        }
        if (!next) break
        best = next
      }
      // Per-stage damping once per step size (2 stages).
      if (S > 1) {
        const r = perStage(best)
        const gv = goalOf(r.s)
        if (gv < best.goal) best = { ...r, goal: gv }
      }
    }
    // A stage whose damping part is not needed loses it.
    for (let i = 0; i < S; i++) {
      if (best.s[i].rd === null) continue
      const s = best.s.map((x, j) =>
        j === i ? { ...x, rd: null, cd: null, ld: null } : x
      )
      if (
        dampOk(s) &&
        lossOk(s) &&
        attShort(design(s)) === 0 &&
        goalOf(s) <= best.goal
      )
        best = { ...best, s, goal: goalOf(s) }
    }
    polished.push(best)
    progress(0.2 + (0.6 * (ki + 1)) / starts.length)
  })

  // ---- 3. E-series per polished point; the best rounded one wins ----
  const opt = {
    check: fullCheck,
    goal: goalOf,
    allowed: (s: StageVals[], i: number) =>
      s[i].L >= ranges[i].lMin * 0.9999 &&
      s[i].L <= ranges[i].lMax * 1.0001 &&
      s[i].C >= ranges[i].cMin * 0.9999 &&
      s[i].C <= ranges[i].cMax * 1.0001,
  }
  type Fin = {
    p: Done
    r: ReturnType<typeof roundE>
    x: OptCheck
    goal: number
  }
  let fin: Fin | null = null
  for (const p of polished) {
    const r = roundE(st, p.s, fa, opt)
    const x = fullCheck(r.stages)
    const gv = goalOf(r.stages)
    const better =
      !fin ||
      (x.pass && !fin.x.pass) ||
      (x.pass === fin.x.pass &&
        (x.pass ? gv < fin.goal : x.short < fin.x.short))
    if (better) fin = { p, r, x, goal: gv }
  }
  progress(0.95)

  const reachable = fin !== null
  if (!fin) {
    warn(
      'No design in the L and C ranges meets the targets: widen the ranges, ' +
        'or relax Qpeak, the loss limit or the target.'
    )
    // Fall back to the best grid point by closed form, unpolished.
    const s0 =
      (pts[0] && valsOf(pts[0].c)) ??
      valsOf({
        L: ranges.map((r) => r.lMax),
        C: ranges.map((r) => r.cMax),
        forms: sets[0],
        g: ranges.map(() => 1),
      })
    if (!s0) throw new Error('no candidate in the ranges')
    const r = roundE(st, s0, fa, opt)
    fin = {
      p: {
        c: { L: [], C: [], forms: sets[0], g: [] },
        s: s0,
        goal: goalOf(s0),
      },
      r,
      x: fullCheck(r.stages),
      goal: goalOf(r.stages),
    }
  }
  const exactS = fin.p.s as StageOut[]
  const exactX = fullCheck(exactS)
  if (exactS.some((v) => v.form === 'RLser') && goal === 'loss')
    warn("Ld's DCR is not in the circuit model; the loss goal counts ρ·Ld.")
  if (exactS.some((v) => v.L < 1e-6))
    warn('L below 1 µH: DCR ∝ L underestimates DCR there (docs/equations.md).')

  // Binding constraints on the exact design.
  const binding: string[] = []
  if (exactX.margin - st.conv.k < 0.5) binding.push('margin k')
  if (emi ? (exactX.emi ?? Infinity) < 0.5 : exactX.att - a.aDb < 0.5)
    binding.push(emi ? 'EMI limit' : 'attenuation')
  if (a.qPeak > 0 && db(a.qPeak / exactX.hPeak) < 0.5) binding.push('Qpeak')
  if (a.eps > 0 && exactX.loss > 0.95 * a.eps) binding.push('DC loss')
  exactS.forEach((v, i) => {
    const t = S > 1 ? String(i + 1) : ''
    const r = ranges[i]
    if (v.L >= r.lMax * 0.99) binding.push(`L${t} at its max`)
    if (v.L <= r.lMin * 1.01) binding.push(`L${t} at its min`)
    if (v.C >= r.cMax * 0.99) binding.push(`C${t} at its max`)
    if (v.C <= r.cMin * 1.01) binding.push(`C${t} at its min`)
  })

  const pin = iDc * vin
  const window: QWindow[] = exactS.map((v) => ({
    qStab: v.qStab,
    qPeak: a.qPeak > 0 ? a.qPeak : null,
    qLoss: a.eps > 0 ? v.Z0 / (((a.eps / 100) * vin * vin) / pin) : null,
  }))

  const cm = cornerMetrics(design(fin.r.stages))
  const w = cm.rows[cm.worst]
  progress(1)
  return {
    fa,
    zMax,
    exact: { stages: exactS, check: exactX },
    rounded: fin.r,
    corner: w ? { label: w.label, margin: w.margin, pass: w.pass } : null,
    reachable,
    warnings,
    goal,
    value: { exact: goalOf(exactS), rounded: fin.goal },
    exactX,
    roundedX: fin.x,
    window,
    binding,
    ranges,
  }
}

/** The design with the optimizer's E-series values (DCR = ρ·L) as blocks. */
export function applyOpt(st: Design, r: OptResult, mkId: () => string): Design {
  return { ...st, blocks: blocksOf(st, r.rounded.stages, mkId, rhoOf(st)) }
}
