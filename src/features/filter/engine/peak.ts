// Peak search on |Zout|.
import { abs } from './complex'
import { point } from './ladder'
import type { Design, Scale } from './model'
import { SC1 } from './types'

/** Golden-section search for the minimum of fn on [a, b]. */
export function golden(
  fn: (x: number) => number,
  a: number,
  b: number,
  it = 60
): number {
  const g = (Math.sqrt(5) - 1) / 2
  let x1 = b - g * (b - a),
    x2 = a + g * (b - a),
    f1 = fn(x1),
    f2 = fn(x2)
  for (let i = 0; i < it; i++) {
    if (f1 < f2) {
      b = x2
      x2 = x1
      f2 = f1
      x1 = b - g * (b - a)
      f1 = fn(x1)
    } else {
      a = x1
      x1 = x2
      f1 = f2
      x2 = a + g * (b - a)
      f2 = fn(x2)
    }
  }
  return (a + b) / 2
}

/** Bisection in log f for the point where Im(Zout) changes sign between 10^a and 10^b. */
export function imZero(st: Design, a: number, b: number, s: Scale): number {
  const sa = Math.sign(point(st, 10 ** a, s).Zout.im)
  for (let k = 0; k < 50; k++) {
    const m = (a + b) / 2,
      sm = Math.sign(point(st, 10 ** m, s).Zout.im)
    if (sm === sa) a = m
    else b = m
  }
  return 10 ** ((a + b) / 2)
}

export type Peak = { f: number; v: number; edge: boolean }

/**
 * Peak of |Zout| between fLo and fHi. A coarse grid alone can step over a
 * narrow resonance, so every local maximum is refined, and so is every
 * inductive-to-capacitive crossing of Im(Zout) (a parallel resonance), which
 * the grid always sees.
 */
export function peakZout(
  st: Design,
  fLo: number,
  fHi: number,
  s: Scale = SC1,
  n = 400
): Peak {
  const la = Math.log10(fLo),
    lb = Math.log10(fHi)
  const lf = (i: number) => la + ((lb - la) * i) / (n - 1)
  const z = new Array<{ re: number; im: number }>(n),
    v = new Float64Array(n)
  let bi = 0
  for (let i = 0; i < n; i++) {
    z[i] = point(st, 10 ** lf(i), s).Zout
    v[i] = abs(z[i])
    if (v[i] > v[bi]) bi = i
  }
  let best: Peak = { f: 10 ** lf(bi), v: v[bi], edge: bi === 0 || bi === n - 1 }
  const take = (f: number) => {
    const val = abs(point(st, f, s).Zout)
    if (val > best.v) best = { f, v: val, edge: false }
  }
  const refine = (a: number, b: number) =>
    take(10 ** golden((t) => -abs(point(st, 10 ** t, s).Zout), a, b, 40))
  const maxima: number[] = []
  for (let i = 0; i < n; i++) {
    const l = i > 0 ? v[i - 1] : -Infinity,
      r = i < n - 1 ? v[i + 1] : -Infinity
    if (v[i] >= l && v[i] >= r) maxima.push(i)
  }
  maxima.sort((a, b) => v[b] - v[a])
  for (const i of maxima.slice(0, 8))
    refine(lf(Math.max(0, i - 1)), lf(Math.min(n - 1, i + 1)))
  for (let i = 0; i < n - 1; i++) {
    if (z[i].im > 0 && z[i + 1].im <= 0) {
      const fr = imZero(st, lf(i), lf(i + 1), s)
      take(fr)
      const w = (lb - la) / (n - 1)
      // Clamped like the maxima above, so the peak stays inside [fLo, fHi].
      const c = Math.log10(fr)
      refine(Math.max(la, c - w), Math.min(lb, c + w))
    }
  }
  return best
}
