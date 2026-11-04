// Frequency sweeps behind the plots.
import {
  abs,
  atCorner,
  type Corner,
  type Design,
  grid,
  point,
  type Sweep,
  sweep,
  undamped,
} from '../engine'
import type { SavedDesign } from '../state/library'
import { type Snapshot, snapshotOf } from './traces'

/**
 * Base log grid plus dense points around every local peak of |Zout| and |H|,
 * so high-Q resonances are drawn at their true height.
 */
function plotGrid(base: Design, states: Design[]): Float64Array {
  const f0 = Array.from(grid(base.plot.fmin, base.plot.fmax, base.plot.n))
  const extra: number[] = []
  for (const st of states) {
    const zm = f0.map((f) => {
      const p = point(st, f)
      return [abs(p.Zout), abs(p.Hopen)]
    })
    for (const k of [0, 1])
      for (let i = 1; i < f0.length - 1; i++) {
        if (zm[i][k] >= zm[i - 1][k] && zm[i][k] > zm[i + 1][k]) {
          const a = Math.log10(f0[i - 1]),
            b = Math.log10(f0[i + 1])
          for (let j = 1; j < 40; j++)
            extra.push(10 ** (a + ((b - a) * j) / 40))
        }
      }
  }
  return Float64Array.from(
    [...f0, ...extra]
      .sort((x, y) => x - y)
      .filter((x, i, a) => i === 0 || x !== a[i - 1])
  )
}

export type CurveSets = {
  nom: Sweep
  und?: Sweep
  tL?: Sweep
  tC?: Sweep
  tLC?: Sweep
  /** |Zout| at the worst corner, only when a block has cv or li curves. */
  worst?: Sweep
  worstLabel?: string
}

const hasCurve = (S: Design) =>
  S.blocks.some((b) => {
    const c = b as { cv?: unknown[]; li?: unknown[] }
    return !!(c.cv?.length || c.li?.length)
  })

export function curveSets(S: Design, worst?: Corner): CurveSets {
  const hasDamp =
    S.plot.undamped &&
    S.blocks.some(
      (b) =>
        b.on && (b.type === 'rc' || (b.type === 'ind' && b.dmode !== 'none'))
    )
  const und = hasDamp ? undamped(S) : null
  const f = plotGrid(S, und ? [S, und] : [S])
  const nom = sweep(S, undefined, f)
  const sets: CurveSets = { nom }
  if (und) sets.und = sweep(und, undefined, nom.f)
  if (worst && hasCurve(S)) {
    sets.worst = sweep(atCorner(S, worst), undefined, nom.f)
    sets.worstLabel = `Worst corner (${worst.label})`
  }
  if (S.plot.tol) {
    sets.tL = sweep(S, { L: 1 + S.plot.dL / 100, C: 1 }, nom.f)
    sets.tC = sweep(S, { L: 1, C: 1 + S.plot.dC / 100 }, nom.f)
    sets.tLC = sweep(
      S,
      { L: 1 + S.plot.dL / 100, C: 1 + S.plot.dC / 100 },
      nom.f
    )
  }
  return sets
}

/** Overlay curves per saved design object; designs are never mutated. */
const overlayCache = new WeakMap<Design, Snapshot | null>()

function overlayCurves(d: Design): Snapshot | null {
  let c = overlayCache.get(d)
  if (c === undefined) {
    try {
      c = snapshotOf('', sweep(d, undefined, plotGrid(d, [d])))
    } catch {
      c = null
    }
    overlayCache.set(d, c)
  }
  return c
}

/** Grey curves of the saved designs with the overlay on. */
export function overlaysOf(library: SavedDesign[]): Snapshot[] {
  const out: Snapshot[] = []
  for (const x of library) {
    if (!x.overlay) continue
    const c = overlayCurves(x.design)
    if (c) out.push({ ...c, label: x.name })
  }
  return out
}
