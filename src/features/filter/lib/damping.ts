import { type Block, closedForm, type Design, sectionOf } from '../engine'

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
