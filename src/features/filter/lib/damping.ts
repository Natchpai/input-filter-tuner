import {
  type Block,
  CD_PER_C,
  cdForC,
  closedForm,
  DAMP_LIM,
  dcR,
  type Design,
  drForQ,
  isInductive,
  kindOf,
  nForPeak,
  type ParamSpec,
  sectionOf,
  TYPES,
} from '../engine'
import { fmtSI } from './si'

/** Closed-form optimum for a damping element, using the LC section it belongs to. */
export function closedFormFor(S: Design, b: Block) {
  const p = sectionOf(S, b.id)
  if (!p) return null
  if (b.type === 'rc') {
    const n = b.cd / p.C
    return { ...(closedForm('rc', n, p.Z0) || {}), n, nLabel: 'Cd/C' }
  }
  if (b.type === 'ind' && (b.dmode === 'RLpar' || b.dmode === 'RLser')) {
    const n = b.dL / b.L
    return { ...(closedForm(b.dmode, n, p.Z0) || {}), n, nLabel: 'Ld/L' }
  }
  return null
}

/**
 * Rd-Ld forms: Ld and Rd for a peak target r·Z0, the design assistant's rule
 * (Erickson). n from the closed-form peak, Ld = n·L, Rd from the closed
 * form. null when the block has no Rd-Ld damping or section, or the peak
 * cannot be reached (series Rd∥Ld needs r > √2).
 */
export function forPeak(S: Design, b: Block, r: number) {
  if (b.type !== 'ind' || (b.dmode !== 'RLpar' && b.dmode !== 'RLser'))
    return null
  const sec = sectionOf(S, b.id)
  const n = sec ? nForPeak(b.dmode, r) : null
  const cf = sec && n ? closedForm(b.dmode, n, sec.Z0) : null
  return cf && n ? { n, ld: n * b.L, rd: cf.rd } : null
}

/** NP-DR-26001 §6 damping methods. */
export type Method = 'A' | 'B' | 'C' | 'D'

const damps = (b: Block) =>
  b.type === 'rc' || (b.type === 'ind' && b.dmode !== 'none')

/**
 * The NP-DR-26001 §6 method a block stands for, or null (no Q box):
 * A: the only capacitor of its section, its ESR in series with C.
 * B: an inductor with Rd across it. C: an Rd-Cd leg.
 * D: a series resistor between the section's L and its first capacitor.
 * A and D only when no other part damps the section; with a series R in
 * the loop, D wins over A.
 */
export function reportMethod(S: Design, b: Block): Method | null {
  if (b.type === 'rc') return 'C'
  if (b.type === 'ind') return b.dmode === 'R' ? 'B' : null
  if (b.type !== 'cap' && b.type !== 'res') return null
  const sec = sectionOf(S, b.id)
  if (!sec) return null
  // The section's blocks after its L, up to the next inductive series block.
  const bl = S.blocks.filter((x) => x.on || x.id === b.id)
  const rest: Block[] = []
  for (const x of bl.slice(bl.indexOf(sec.block) + 1)) {
    if (kindOf(x) === 'series' && isInductive(x)) break
    rest.push(x)
  }
  if (damps(sec.block) || rest.some(damps)) return null
  const firstCap = rest.findIndex((x) => x.type === 'cap')
  const inLoop = rest.filter((x, i) => x.type === 'res' && i < firstCap)
  if (b.type === 'res') return inLoop.includes(b) ? 'D' : null
  const caps = rest.filter((x) => x.type === 'cap')
  return caps.length === 1 && inLoop.length === 0 ? 'A' : null
}

/** What the Q button sets for each method, and the formula it uses. */
export const METHOD_INFO: Record<
  Method,
  { k: string; what: string; f: string }
> = {
  A: { k: 'esr', what: 'ESR', f: 'ESR = Z0/Q − rL (total of the bank)' },
  B: { k: 'dR', what: 'Rd', f: 'Rd = Z0²/(Z0/Q − rL)' },
  C: { k: 'rd', what: 'Rd', f: 'Rd = Z0²/(Z0/Q − rL), less the Cd ESR' },
  D: { k: 'r', what: 'R', f: 'R = Z0/Q − rL' },
}

/** [min, max] of a value the Q button sets, the same as its input field. */
function limitOf(b: Block, k: string): readonly [number, number] {
  if (k === 'dR') return DAMP_LIM.dR
  const p = (TYPES[b.type].p as readonly ParamSpec<string>[]).find(
    (x) => x.key === k
  )
  return p ? [p.allowZero ? 0 : p.min, p.max] : [0, Infinity]
}

/**
 * The value the Q button sets: NP-DR-26001 §6, an approximation (the exact
 * answer is the Optimum search or the plots). rL is the section inductor's
 * own DCR. v is null when rL alone already gives Q. v is kept inside the
 * field's limits; clipped says it was moved, so Q is not met.
 */
export function valueForQ(S: Design, b: Block, Q: number) {
  const r = rawValueForQ(S, b, Q)
  if (!r || r.v === null) return r && { ...r, clipped: false }
  const [lo, hi] = limitOf(b, r.k)
  const v = Math.min(hi, Math.max(lo, r.v))
  return { ...r, v, clipped: v !== r.v }
}

function rawValueForQ(S: Design, b: Block, Q: number) {
  const m = reportMethod(S, b)
  const sec = sectionOf(S, b.id)
  if (!m || !sec || !(Q > 0 && Number.isFinite(Q))) return null
  const L = sec.block
  const dr = drForQ(sec.Z0, Q, L.type === 'ind' ? L.dcr : dcR(L))
  const k = METHOD_INFO[m].k
  if (!(dr > 0)) return { m, k, v: null }
  const rp = (sec.Z0 * sec.Z0) / dr // the same loss as a parallel R
  const v =
    m === 'A'
      ? dr * Math.max(1, b.type === 'cap' ? b.n : 1)
      : m === 'C'
        ? Math.max(0, rp - (b.type === 'rc' ? b.esr : 0))
        : m === 'B'
          ? rp
          : dr
  return { m, k, v }
}

/** The closed-form formulas of engine/closed-form.ts, as text. */
const CF_TEXT: Record<string, string> = {
  rc: 'Rd = Z0·√((2+n)(4+3n)/(2n²(4+n))), peak = Z0·√(2(2+n))/n',
  RLpar: 'Rd = Z0·√(n(3+4n)(1+2n)/(2(1+4n))), peak = Z0·√(2n(1+2n))',
  RLser:
    'Rd = Z0·n/(1+n)·√((2+n)(4+3n)/(2(1+n)(4+n))), peak = Z0·√(2(1+n)(2+n))/n',
}

/**
 * One line of source text per number on the damping line: the formula, the
 * values that went into it, and where it comes from. null when the number
 * is not shown.
 */
export function dampSources(S: Design, b: Block) {
  const sec = sectionOf(S, b.id)
  const cf = closedFormFor(S, b)
  if (!sec || !cf?.rd) return { cf: null, cd: null }
  const form = b.type === 'rc' ? 'rc' : b.type === 'ind' ? b.dmode : ''
  const cfText =
    `${CF_TEXT[form]}, with Z0 = ${fmtSI(sec.Z0, 'Ω')}, ` +
    `n = ${cf.nLabel} = ${cf.n.toFixed(2)}. ` +
    'Lossless L and C (Middlebrook, Erickson).'
  const cdText =
    b.type === 'rc'
      ? `Cd ≈ ${CD_PER_C}·C = ${fmtSI(cdForC(sec.C), 'F')} with C = ` +
        `${fmtSI(sec.C, 'F')}. With Rd for Q it keeps Q = Re Zo(f0)/Z0; ` +
        'the peak is about 0.8·Z0 at Q = 0.707. NP-DR-26001 §7.'
      : null
  return { cf: cfText, cd: cdText }
}
