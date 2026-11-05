// Peak search on |Zout| and |Hopen|.
import { abs } from './complex'
import { type Point, point } from './ladder'
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
  return peaksOf(st, fLo, fHi, s, n, [(p) => abs(p.Zout)])[0]
}

/**
 * Peak of |Hopen| (gain from the source to the converter node, converter
 * side open) between fLo and fHi, searched as peakZout: the H peak sits at
 * a resonance of the filter, which the Im(Zout) crossings also mark.
 */
export function peakH(
  st: Design,
  fLo: number,
  fHi: number,
  s: Scale = SC1,
  n = 400
): Peak {
  return peaksOf(st, fLo, fHi, s, n, [(p) => abs(p.Hopen)])[0]
}

/** peakZout and peakH over the same range from one grid scan (M3b). */
export function peaksZH(st: Design, fLo: number, fHi: number): [Peak, Peak] {
  const [z, h] = peaksOf(st, fLo, fHi, SC1, 400, [
    (p) => abs(p.Zout),
    (p) => abs(p.Hopen),
  ])
  return [z, h]
}

/**
 * The peak of each value over one shared grid. Each value refines its own
 * maxima; the Im(Zout) crossings are found once. With one value this is
 * the same arithmetic, in the same order, as before (parity).
 */
function peaksOf(
  st: Design,
  fLo: number,
  fHi: number,
  s: Scale,
  n: number,
  vals: ((p: Point) => number)[]
): Peak[] {
  const la = Math.log10(fLo),
    lb = Math.log10(fHi)
  const lf = (i: number) => la + ((lb - la) * i) / (n - 1)
  const z = new Array<{ re: number; im: number }>(n)
  const vs = vals.map(() => new Float64Array(n))
  for (let i = 0; i < n; i++) {
    const p = point(st, 10 ** lf(i), s)
    z[i] = p.Zout
    for (let k = 0; k < vals.length; k++) vs[k][i] = vals[k](p)
  }
  const out = vals.map((val, k) => {
    const v = vs[k]
    let bi = 0
    for (let i = 1; i < n; i++) if (v[i] > v[bi]) bi = i
    let best: Peak = {
      f: 10 ** lf(bi),
      v: v[bi],
      edge: bi === 0 || bi === n - 1,
    }
    const take = (f: number) => {
      const x = val(point(st, f, s))
      if (x > best.v) best = { f, v: x, edge: false }
    }
    const refine = (a: number, b: number) =>
      take(10 ** golden((t) => -val(point(st, 10 ** t, s)), a, b, 40))
    const maxima: number[] = []
    for (let i = 0; i < n; i++) {
      const l = i > 0 ? v[i - 1] : -Infinity,
        r = i < n - 1 ? v[i + 1] : -Infinity
      if (v[i] >= l && v[i] >= r) maxima.push(i)
    }
    maxima.sort((a, b) => v[b] - v[a])
    for (const i of maxima.slice(0, 8))
      refine(lf(Math.max(0, i - 1)), lf(Math.min(n - 1, i + 1)))
    return { best: () => best, take, refine }
  })
  const w = (lb - la) / (n - 1)
  for (let i = 0; i < n - 1; i++) {
    if (z[i].im > 0 && z[i + 1].im <= 0) {
      const fr = imZero(st, lf(i), lf(i + 1), s)
      // Clamped like the maxima above, so the peak stays inside [fLo, fHi].
      const c = Math.log10(fr)
      for (const o of out) {
        o.take(fr)
        o.refine(Math.max(la, c - w), Math.min(lb, c + w))
      }
    }
  }
  return out.map((o) => o.best())
}
