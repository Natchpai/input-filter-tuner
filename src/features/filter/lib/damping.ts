import { type Block, closedForm, type Design, sectionOf } from '../engine'
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
  const rTot = b.type === 'rc' ? b.rd + b.esr : 0
  const cdText =
    rTot > 0
      ? 'Cd = 10/(2π·f0·Rd), so Xcd = Rd/10 at f0 and the leg acts as a ' +
        `plain R. f0 = ${fmtSI(sec.f0, 'Hz')}, Rd + ESR = ` +
        `${fmtSI(rTot, 'Ω')}. NP-DR-26001 §7.`
      : null
  return { cf: cfText, cd: cdText }
}
