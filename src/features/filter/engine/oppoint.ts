// Operating-point corners: Vin {min, nom, max} × load {light, full}. At each
// corner, C-vs-V and L-vs-I curves give the part values, and the existing
// metrics() gives the numbers. See docs/M1-plan.md (M1a).
import { iBus, pBus } from './bus'
import { db } from './complex'
import { metrics } from './metrics'
import type { Block, Curve, Design } from './model'

/**
 * Sorted, clamped linear interpolation. One point is a constant.
 *
 * The input is not changed; a sorted copy is used. Beyond the first and last
 * point the value is held flat. When two points share the same x, the one
 * given first in the input is kept and the other is dropped, so there is no
 * division by zero. An empty curve returns NaN; callers only pass non-empty
 * curves.
 */
export function interp(points: Curve, x: number): number {
  if (points.length === 0) return NaN
  // Stable sort, so equal x keep their input order; then keep the first one,
  // as adopt() does.
  const p: Curve = []
  for (const q of [...points].sort((a, b) => a[0] - b[0])) {
    if (p.length > 0 && p[p.length - 1][0] === q[0]) continue
    p.push(q)
  }
  const n = p.length
  if (x <= p[0][0]) return p[0][1]
  if (x >= p[n - 1][0]) return p[n - 1][1]
  // Here p[0].x < x < p[n-1].x and x values are distinct, so some k has
  // p[k-1].x < x <= p[k].x.
  let k = 1
  while (p[k][0] < x) k++
  const [x0, y0] = p[k - 1]
  const [x1, y1] = p[k]
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
}

export type Corner = {
  vin: number
  /** Bus load power at this corner, W (every converter). DC current only. */
  pLoad: number
  /** DC input current, A: Σ P_i/(η_i·vin). */
  i: number
  label: string
}

const hasCurve = (c: Curve | undefined): c is Curve => !!c && c.length > 0

/** True when some ON block's value depends on the DC current. */
function loadDependent(st: Design): boolean {
  return st.blocks.some(
    (b) =>
      b.on &&
      (b.type === 'ind' || b.type === 'bead2' || b.type === 'bead4') &&
      hasCurve(b.li)
  )
}

/** Short number for labels: at most 4 significant digits, no trailing zeros. */
const num = (v: number) => String(Number(v.toPrecision(4)))

/**
 * Corners of a design. Duplicate Vin values are merged. Light-load rows are
 * left out when nothing depends on the load (no li curve, or pLight = pout).
 *
 * Order: Vin from low to high; within one Vin, light load first, then full.
 * Labels read like "12 V, light" or "24 V, full".
 */
export function corners(st: Design): Corner[] {
  const cv = st.conv
  const vins = [...new Set([cv.vinMin, cv.vinNom, cv.vinMax])].sort(
    (a, b) => a - b
  )
  // Light: every converter at its P light; full: every one at P full.
  // Light load above full load counts as full load (as adopt() clamps it).
  const loads: ('light' | 'full')[] = []
  if (loadDependent(st) && pBus(st, 'light') !== pBus(st, 'full'))
    loads.push('light')
  loads.push('full')
  const out: Corner[] = []
  for (const vin of vins)
    for (const l of loads)
      out.push({
        vin,
        pLoad: pBus(st, l),
        i: iBus(st, vin, l),
        label: `${num(vin)} V, ${l}`,
      })
  return out
}

/** One block with its curved values resolved at a corner. */
function resolve(b: Block, c: Corner): Block {
  switch (b.type) {
    case 'cap':
      // C per part from the curve replaces the static DC-bias derating.
      return hasCurve(b.cv) ? { ...b, c: interp(b.cv, c.vin), derate: 0 } : b
    case 'ind':
      return hasCurve(b.li) ? { ...b, L: interp(b.li, c.i) } : b
    case 'bead2':
    case 'bead4':
      return hasCurve(b.li) ? { ...b, lb: interp(b.li, c.i) } : b
    default:
      return b
  }
}

/**
 * Design copy at one corner: curved values resolved, vinMin = vinNom = vinMax
 * = corner Vin, pout kept at full power so |Rn| uses P_full.
 *
 * Blocks without a curve are shared with st, not copied; blocks with a curve
 * are new objects. Neither st nor its blocks are changed. Off blocks are
 * resolved too; metrics() skips them anyway.
 */
export function atCorner(st: Design, c: Corner): Design {
  return {
    ...st,
    conv: { ...st.conv, vinMin: c.vin, vinNom: c.vin, vinMax: c.vin },
    blocks: st.blocks.map((b) => resolve(b, c)),
  }
}

export type CornerRow = Corner & {
  /** Peak |Zout|, Ω, and its frequency, Hz. */
  peak: number
  peakF: number
  /** |Rn| at this Vin and full power, Ω. */
  rn: number
  margin: number
  /** Series-form Q, as metrics().qSeries. */
  q: number | null
  /** Attenuation at fsw, dB, positive: −20·log10|Hopen(fsw)|. */
  attFsw: number
  pass: boolean
}

/** One row per corner, and the index of the worst row (lowest margin). */
export function cornerMetrics(st: Design): {
  rows: CornerRow[]
  worst: number
} {
  const rows = corners(st).map((c): CornerRow => {
    const m = metrics(atCorner(st, c))
    return {
      ...c,
      peak: m.peak.v,
      peakF: m.peak.f,
      rn: Math.abs(m.rn.min),
      margin: m.margin,
      q: m.qSeries,
      attFsw: -db(m.ripple.hfsw),
      pass: m.pass,
    }
  })
  // First row with the lowest margin; ties keep the earlier row.
  let worst = 0
  for (let k = 1; k < rows.length; k++)
    if (rows[k].margin < rows[worst].margin) worst = k
  return { rows, worst }
}
