// Design metrics, the damping optimizer and parameter sweeps.
import { abs, add, cx, db, div, mul, TAU, type Complex } from './complex'
import { dcR, point, rnOf, zBlock } from './ladder'
import type { Block, Design } from './model'
import { golden, imZero, peakZout, type Peak } from './peak'
import { primary, type Section } from './sections'
import { kindOf, SC1, setParam } from './types'

/**
 * Frequency range for the margin and the Nyquist scan: f min up to f check.
 * Rn holds only up to f check. Never inverted.
 */
export function checkRange(st: Design): [number, number] {
  const lo = st.plot.fmin
  return [
    lo,
    Math.max(Math.min(st.conv.fcheck || st.conv.fsw, st.plot.fmax), lo * 1.01),
  ]
}

/** Which parameter is the damping resistor of a block, if any. */
export function dampKey(b: Block): 'rd' | 'dR' | null {
  if (b.type === 'rc') return 'rd'
  if (b.type === 'ind' && b.dmode && b.dmode !== 'none') return 'dR'
  return null
}

export function withParam(
  st: Design,
  id: string,
  key: string,
  val: number
): Design {
  return {
    ...st,
    blocks: st.blocks.map((b) => (b.id === id ? setParam(b, key, val) : b)),
  }
}

/** Value of one parameter, between lo and hi, for the lowest peak |Zout|. */
export function optimizeParam(
  st: Design,
  id: string,
  key: string,
  lo: number,
  hi: number
) {
  const [fLo, fHi] = checkRange(st)
  const obj = (t: number) =>
    peakZout(withParam(st, id, key, Math.exp(t)), fLo, fHi, SC1, 300).v
  const x = golden(obj, Math.log(lo), Math.log(hi), 50)
  const val = Math.exp(x)
  return { val, peak: peakZout(withParam(st, id, key, val), fLo, fHi).v }
}

export function sweepParam(
  st: Design,
  id: string,
  key: string,
  values: number[]
) {
  const [fLo, fHi] = checkRange(st)
  return values.map((v) => {
    const s2 = withParam(st, id, key, v)
    return {
      v,
      peak: peakZout(s2, fLo, fHi, SC1, 160).v,
      hfsw: db(abs(point(s2, st.conv.fsw).Hopen)),
    }
  })
}

/** The same design with every damping element removed. */
export function undamped(st: Design): Design {
  return {
    ...st,
    blocks: st.blocks.map((b) =>
      b.type === 'rc'
        ? { ...b, on: false }
        : b.type === 'ind'
          ? { ...b, dmode: 'none' as const }
          : b
    ),
  }
}

/**
 * Series-form Q as in the NP-DR reports: Q = Z0 / r_total, where r_total is
 * the series-equivalent loss at f0. At resonance Zout ≈ Z0²/r_total, so
 * Q = Re(Zout(f0))/Z0. null when there is no primary section.
 */
export function qSeriesOf(st: Design): number | null {
  const prim = primary(st)
  return prim ? point(st, prim.f0).Zout.re / prim.Z0 : null
}

export type Metrics = {
  rn: { min: number; nom: number; max: number }
  peak: Peak
  peakIsEdge: boolean
  margin: number
  pass: boolean
  unstableAt: number | null
  prim: Section | null
  qeff: number | null
  qSeries: number | null
  fLo: number
  fHi: number
  dc: {
    r: number
    iin: number
    drop: number
    loss: number
    pct: number
    perBlock: Record<string, number>
  }
  ripple: {
    N: number
    D: number
    io: number
    iacRms: number
    fr: number
    ih: number
    hfr: number
    hfsw: number
    s21fr: number
    isrc: number
    vout: number
    perBlock: Record<string, number>
  }
}

export function metrics(st: Design): Metrics {
  const cv = st.conv
  const [fLo, fHi] = checkRange(st)
  const rn = {
    min: rnOf(cv, cv.vinMin),
    nom: rnOf(cv, cv.vinNom),
    max: rnOf(cv, cv.vinMax),
  }
  const pk = peakZout(st, fLo, fHi)
  const prim = primary(st)
  const margin = db(Math.abs(rn.min) / pk.v)
  // Nyquist: Tm = Zout/Rn with Rn < 0, so Tm crosses the real axis left of -1
  // where Im(Zout) = 0 and Re(Zout) > |Rn|. Each crossing is located by
  // bisection, because Re(Zout) at a high-Q crossing is far above the grid
  // samples next to it. Same range as the margin: Rn is only valid up to
  // f check.
  const nq = Math.max(400, st.plot.n)
  const la = Math.log10(fLo),
    lb = Math.log10(fHi),
    lf = (i: number) => la + ((lb - la) * i) / (nq - 1)
  let unstableAt: number | null = null,
    prevIm = point(st, 10 ** la).Zout.im
  for (let i = 1; i < nq && unstableAt === null; i++) {
    const im = point(st, 10 ** lf(i)).Zout.im
    if (Math.sign(im) !== Math.sign(prevIm)) {
      const fr = imZero(st, lf(i - 1), lf(i), SC1)
      if (point(st, fr).Zout.re > Math.abs(rn.min)) unstableAt = fr
    }
    prevIm = im
  }
  // DC
  let rdc = st.source.R
  for (const b of st.blocks) if (b.on && kindOf(b) === 'series') rdc += dcR(b)
  const iin = cv.pout / (cv.eta * cv.vinMin)
  // Ripple
  const N = Math.max(1, Math.round(cv.phases || 1))
  const D = Math.min(1, Math.max(0, cv.vout / (cv.vinNom * cv.eta)))
  const io = cv.pout / cv.vout
  const k = Math.floor(N * D)
  const iacRms =
    (io / N) * Math.sqrt(Math.max(0, (N * D - k) * (k + 1 - N * D)))
  const fr = N * cv.fsw
  const ih = (2 * io * Math.abs(Math.sin(N * Math.PI * D))) / (N * Math.PI)
  const pr = point(st, fr),
    ps = point(st, cv.fsw)
  // Per-block loss at the ripple fundamental (backward walk from the converter).
  const w = TAU * fr
  // Converter draws I = ih out of the output node, so V = -Zout·I there.
  let I: Complex = cx(ih),
    V: Complex = cx(-pr.Zout.re * ih, -pr.Zout.im * ih)
  const acLoss: Record<string, number> = {}
  const on = st.blocks.filter((b) => b.on)
  for (let i = on.length - 1; i >= 0; i--) {
    const b = on[i],
      z = zBlock(b, w)
    if (kindOf(b) === 'series') {
      acLoss[b.id] = (abs(I) ** 2 * z.re) / 2
      V = add(V, mul(z, I))
    } else {
      const il = div(V, z)
      acLoss[b.id] = (abs(il) ** 2 * z.re) / 2
      I = add(I, il)
    }
  }
  const dcLoss: Record<string, number> = {}
  for (const b of on)
    if (kindOf(b) === 'series') dcLoss[b.id] = iin * iin * dcR(b)
  const qSeries = qSeriesOf(st)
  return {
    rn,
    peak: pk,
    peakIsEdge: pk.edge,
    margin,
    pass: margin >= cv.k && !unstableAt,
    unstableAt,
    prim,
    qeff: prim ? pk.v / prim.Z0 : null,
    qSeries,
    fLo,
    fHi,
    dc: {
      r: rdc,
      iin,
      drop: iin * rdc,
      loss: iin * iin * rdc,
      pct: (100 * iin * iin * rdc) / cv.pout,
      perBlock: dcLoss,
    },
    ripple: {
      N,
      D,
      io,
      iacRms,
      fr,
      ih,
      hfr: abs(pr.Hopen),
      hfsw: abs(ps.Hopen),
      s21fr: abs(pr.S21),
      isrc: ih * abs(pr.Hopen),
      vout: ih * abs(pr.Zout),
      perBlock: acLoss,
    },
  }
}
