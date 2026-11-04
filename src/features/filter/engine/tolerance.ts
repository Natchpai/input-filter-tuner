// Part tolerances (M1b): every ± extreme and a seeded Monte Carlo, at every
// operating-point corner. See docs/M1-plan.md (M1b).
import { db } from './complex'
import { rnOf } from './ladder'
import { checkRange, qSeriesOf } from './metrics'
import type { Block, Design } from './model'
import { atCorner, corners } from './oppoint'
import { peakZout } from './peak'
import { getParam, setParam, TOL_KEYS, type TolKey } from './types'

/** One tolerance that counts: an ON block's value with tol > 0, ± %. */
export type TolItem = { id: string; key: TolKey; tol: number }

/** Peak |Zout|, margin and series Q of one case (no Nyquist scan). */
export type CaseResult = { peak: number; margin: number; q: number | null }

/** Extremes at one corner. */
export type ExtremeRow = {
  label: string
  /** The corner with no tolerance applied. */
  nominal: CaseResult
  /** The extreme with the lowest margin (first one on a tie). */
  worst: CaseResult
  /** ±1 per TolItem for `worst`, in tolItems() order. */
  signs: number[]
  /** Lowest and highest series Q over the extremes. */
  qMin: number | null
  qMax: number | null
}

export type McCorner = {
  label: string
  /** Lowest, 1st percentile and median margin over the draws, dB. */
  worst: number
  p1: number
  median: number
}

export type McResult = {
  items: TolItem[]
  n: number
  seed: number
  corners: McCorner[]
  /** Board margin per draw: the lowest margin over the corners, dB. */
  board: Float64Array
  /** Draw with the lowest board margin and its relative changes δ. */
  worstBoard: { index: number; d: number[] }
}

/** Most items extremes() runs: 2^8 = 256 cases per corner. */
const MAX_EXTREME_ITEMS = 8

/** How often monteCarlo() reports progress, in draws. */
const PROGRESS_EVERY = 25

/** Seeded PRNG (mulberry32). Values in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Nearest-rank percentile of an ascending array: sorted[ceil(p·n) − 1]. */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length
  if (n === 0) return NaN
  return sorted[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))]
}

/** True when this key of the block is in use (damping keys need a mode). */
function keyInUse(b: Block, key: string): boolean {
  if (b.type !== 'ind') return true
  if (key === 'dR') return b.dmode !== 'none'
  if (key === 'dL') return b.dmode === 'RLpar' || b.dmode === 'RLser'
  return true
}

/** Tolerances that count, in block order, then TOL_KEYS order. */
export function tolItems(st: Design): TolItem[] {
  const out: TolItem[] = []
  for (const b of st.blocks) {
    if (!b.on || !b.tol) continue
    const tol = b.tol as Partial<Record<string, number>>
    for (const key of TOL_KEYS[b.type] as readonly TolKey[]) {
      const t = tol[key]
      if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) continue
      if (!keyInUse(b, key)) continue
      out.push({ id: b.id, key, tol: t })
    }
  }
  return out
}

/**
 * Design copy with each item's value times (1 + d[i]). d[i] is relative
 * (−0.3 for −30 %). Apply after atCorner(), so the change multiplies the
 * corner value (C from cv, L from li). Neither st nor its blocks change.
 */
export function applyTol(st: Design, items: TolItem[], d: number[]): Design {
  if (d.length !== items.length)
    throw new Error(`applyTol: ${items.length} items but ${d.length} changes`)
  if (items.length === 0) return st
  const byId = new Map<string, number[]>()
  items.forEach((it, i) => {
    const list = byId.get(it.id)
    if (list) list.push(i)
    else byId.set(it.id, [i])
  })
  return {
    ...st,
    blocks: st.blocks.map((b) => {
      const idx = byId.get(b.id)
      if (!idx) return b
      let nb = b
      for (const i of idx) {
        const key = items[i].key
        nb = setParam(nb, key, getParam(nb, key) * (1 + d[i]))
      }
      return nb
    }),
  }
}

/** Peak, margin and Q of a design that is already at one corner. */
export function evalCase(st: Design): CaseResult {
  const [fLo, fHi] = checkRange(st)
  const peak = peakZout(st, fLo, fHi).v
  // Same as metrics().margin: at a corner vinMin is the corner Vin and pout
  // is the full power.
  const margin = db(Math.abs(rnOf(st.conv, st.conv.vinMin)) / peak)
  return { peak, margin, q: qSeriesOf(st) }
}

/**
 * Every ± extreme at every corner. null when more than 8 items count.
 *
 * Case m (0 … 2^k − 1) sets signs[i] = −1 when bit i of m is set, else +1,
 * so case 0 is all +. The worst case is the first one with the lowest
 * margin. qMin and qMax skip cases with no Q; null when no case has one.
 * With no items the only case is the nominal one.
 */
export function extremes(st: Design): ExtremeRow[] | null {
  const items = tolItems(st)
  const k = items.length
  if (k > MAX_EXTREME_ITEMS) return null
  const cases = 2 ** k
  return corners(st).map((c): ExtremeRow => {
    const base = atCorner(st, c)
    const nominal = evalCase(base)
    let worst = nominal
    let worstSigns: number[] = []
    let qMin: number | null = null
    let qMax: number | null = null
    for (let m = 0; m < cases; m++) {
      const signs = items.map((_, i) => ((m >> i) & 1 ? -1 : 1))
      const r =
        k === 0
          ? nominal
          : evalCase(
              applyTol(
                base,
                items,
                items.map((it, i) => (signs[i] * it.tol) / 100)
              )
            )
      if (m === 0 || r.margin < worst.margin) {
        worst = r
        worstSigns = signs
      }
      if (r.q !== null) {
        qMin = qMin === null ? r.q : Math.min(qMin, r.q)
        qMax = qMax === null ? r.q : Math.max(qMax, r.q)
      }
    }
    return { label: c.label, nominal, worst, signs: worstSigns, qMin, qMax }
  })
}

/**
 * n uniform draws within ±tol, seeded. One draw is one board: the same
 * changes at every corner.
 *
 * Draw order: for each draw, for each item in tolItems() order, u = r() and
 * d = tol/100·(2u − 1). n is clamped to a whole number ≥ 1. The same st, n
 * and seed always give the same result. onProgress gets the number of draws
 * done every 25 draws and at the end.
 */
export function monteCarlo(
  st: Design,
  n: number,
  seed = 1,
  onProgress?: (done: number) => void
): McResult {
  const draws = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1
  const items = tolItems(st)
  const cs = corners(st)
  const bases = cs.map((c) => atCorner(st, c))
  const perCorner = cs.map(() => new Float64Array(draws))
  const board = new Float64Array(draws)
  const r = rng(seed)
  let worstIndex = 0
  let worstD: number[] = []
  for (let j = 0; j < draws; j++) {
    const d = items.map((it) => (it.tol / 100) * (2 * r() - 1))
    let low = Infinity
    for (let ci = 0; ci < bases.length; ci++) {
      const m = evalCase(applyTol(bases[ci], items, d)).margin
      perCorner[ci][j] = m
      if (m < low) low = m
    }
    board[j] = low
    if (j === 0 || low < board[worstIndex]) {
      worstIndex = j
      worstD = d
    }
    if (onProgress && ((j + 1) % PROGRESS_EVERY === 0 || j + 1 === draws))
      onProgress(j + 1)
  }
  const mcCorners = cs.map((c, ci): McCorner => {
    const sorted = perCorner[ci].slice().sort()
    return {
      label: c.label,
      worst: sorted[0],
      p1: percentile(sorted, 0.01),
      median: percentile(sorted, 0.5),
    }
  })
  return {
    items,
    n: draws,
    seed,
    corners: mcCorners,
    board,
    worstBoard: { index: worstIndex, d: worstD },
  }
}
