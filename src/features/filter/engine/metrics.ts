// Design metrics, the damping optimizer and parameter sweeps.
import {
  type Band,
  bands,
  converters,
  convsAt,
  fcOf,
  iBus,
  pBus,
  rnBus,
  vinLow,
} from './bus'
import { abs, add, cx, db, div, mul, TAU, type Complex } from './complex'
import { dcR, point, zBlock } from './ladder'
import type { Block, Design } from './model'
import { golden, imZero, peakZout, type Peak } from './peak'
import { primary, type Section } from './sections'
import { kindOf, SC1, setParam } from './types'

/**
 * Frequency range for the margin and the Nyquist scan: from f min (at most
 * 10 Hz) up to the highest f check of the converters on the bus. Rn holds
 * only up to f check. It does not follow the plot zoom, so the verdict
 * cannot change with the view. Never inverted.
 */
export function checkRange(st: Design): [number, number] {
  const lo = Math.min(st.plot.fmin, 10)
  return [lo, Math.max(...converters(st).map(fcOf), lo * 1.01)]
}

/** One band of the check range with its peak |Zout| and margin. */
export type BandResult = Band & { peak: Peak; margin: number }

/**
 * Margin of the bus at one Vin (full power): per band, db(|Rn_band| / peak
 * |Zout| in the band); the margin is the lowest, `limit` its band. One
 * converter gives one band and today's margin. `whole` is the peak over the
 * whole check range when the caller has it already (used for one band).
 */
export function marginBands(
  st: Design,
  vin: number,
  whole?: Peak
): { bands: BandResult[]; limit: number; margin: number } {
  const [fLo] = checkRange(st)
  const bs = bands(st, vin, fLo)
  const out = bs.map((b): BandResult => {
    const pk = bs.length === 1 && whole ? whole : peakZout(st, b.fLo, b.fHi)
    return { ...b, peak: pk, margin: db(Math.abs(b.rn) / pk.v) }
  })
  let limit = 0
  for (let j = 1; j < out.length; j++)
    if (out[j].margin < out[limit].margin) limit = j
  return { bands: out, limit, margin: out[limit].margin }
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

/** Ripple of one converter at its fundamental fr = N·fsw. */
export type RippleOf = {
  name: string
  N: number
  D: number
  io: number
  iacRms: number
  fr: number
  ih: number
  hfr: number
  hfsw: number
  s21fr: number
}

/**
 * Loss per block for a converter current ih at fr: backward walk from the
 * converter. It draws I = ih out of the output node, so V = −Zout·I there.
 */
function acWalk(
  on: Block[],
  fr: number,
  ih: number,
  zout: Complex,
  out: Record<string, number>
) {
  const w = TAU * fr
  let I: Complex = cx(ih),
    V: Complex = cx(-zout.re * ih, -zout.im * ih)
  for (let i = on.length - 1; i >= 0; i--) {
    const b = on[i],
      z = zBlock(b, w)
    let p: number
    if (kindOf(b) === 'series') {
      p = (abs(I) ** 2 * z.re) / 2
      V = add(V, mul(z, I))
    } else {
      const il = div(V, z)
      p = (abs(il) ** 2 * z.re) / 2
      I = add(I, il)
    }
    out[b.id] = b.id in out ? out[b.id] + p : p
  }
}

export type Metrics = {
  /** Bus Rn (every converter) at Vin min, nom and max, full power. */
  rn: { min: number; nom: number; max: number }
  /** Check-range bands at Vin min (one per distinct f check). */
  bands: BandResult[]
  /** Band with the lowest margin. */
  limitBand: number
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
  /**
   * Ripple. The top-level fields are for the converter with the least
   * attenuation at its fr (converter 1 when alone); `per` has every one.
   * isrc, vout and perBlock cover all converters: same fr add in phase,
   * different fr add as losses and root-sum-square amplitudes.
   */
  ripple: {
    /** Converter with the least attenuation (index into per). */
    worst: number
    per: RippleOf[]
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
    min: rnBus(st, vinLow(cv)),
    nom: rnBus(st, cv.vinNom),
    max: rnBus(st, cv.vinMax),
  }
  const pk = peakZout(st, fLo, fHi)
  const prim = primary(st)
  const mb = marginBands(st, vinLow(cv), pk)
  const margin = mb.margin
  // |Rn| of the band that holds f (Nyquist crossings).
  const rnAt = (f: number) =>
    Math.abs(
      (mb.bands.find((b) => f <= b.fHi) ?? mb.bands[mb.bands.length - 1]).rn
    )
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
      if (point(st, fr).Zout.re > rnAt(fr)) unstableAt = fr
    }
    prevIm = im
  }
  // DC
  let rdc = st.source.R
  for (const b of st.blocks) if (b.on && kindOf(b) === 'series') rdc += dcR(b)
  const iin = iBus(st, vinLow(cv), 'full')
  // Ripple, per converter, at its fundamental fr = N·fsw.
  const per = convsAt(st).map(({ name, conv: c }): RippleOf => {
    const N = Math.max(1, Math.round(c.phases || 1))
    const D = Math.min(1, Math.max(0, c.vout / (c.vinNom * c.eta)))
    const io = c.pout / c.vout
    const k = Math.floor(N * D)
    const iacRms =
      (io / N) * Math.sqrt(Math.max(0, (N * D - k) * (k + 1 - N * D)))
    const fr = N * c.fsw
    const ih = (2 * io * Math.abs(Math.sin(N * Math.PI * D))) / (N * Math.PI)
    const pr = point(st, fr)
    return {
      name,
      N,
      D,
      io,
      iacRms,
      fr,
      ih,
      hfr: abs(pr.Hopen),
      hfsw: abs(point(st, c.fsw).Hopen),
      s21fr: abs(pr.S21),
    }
  })
  let wr = 0
  for (let j = 1; j < per.length; j++) if (per[j].hfr > per[wr].hfr) wr = j
  // Same fr: the currents add in phase. Different fr: losses add, source
  // ripple and pin ripple add as root-sum-square of the peak amplitudes.
  const byF = new Map<number, number>()
  for (const r of per) byF.set(r.fr, (byF.get(r.fr) ?? 0) + r.ih)
  const acLoss: Record<string, number> = {}
  const on = st.blocks.filter((b) => b.on)
  const isrcs: number[] = [],
    vouts: number[] = []
  for (const [f, ih] of byF) {
    const p = point(st, f)
    acWalk(on, f, ih, p.Zout, acLoss)
    isrcs.push(ih * abs(p.Hopen))
    vouts.push(ih * abs(p.Zout))
  }
  const rss = (a: number[]) =>
    a.length === 1 ? a[0] : Math.sqrt(a.reduce((s, x) => s + x * x, 0))
  const rw = per[wr]
  const dcLoss: Record<string, number> = {}
  for (const b of on)
    if (kindOf(b) === 'series') dcLoss[b.id] = iin * iin * dcR(b)
  const qSeries = qSeriesOf(st)
  return {
    rn,
    bands: mb.bands,
    limitBand: mb.limit,
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
      pct: (100 * iin * iin * rdc) / pBus(st, 'full'),
      perBlock: dcLoss,
    },
    ripple: {
      worst: wr,
      per,
      N: rw.N,
      D: rw.D,
      io: rw.io,
      iacRms: rss(per.map((r) => r.iacRms)),
      fr: rw.fr,
      ih: rw.ih,
      hfr: rw.hfr,
      hfsw: Math.max(...per.map((r) => r.hfsw)),
      s21fr: rw.s21fr,
      isrc: rss(isrcs),
      vout: rss(vouts),
      perBlock: acLoss,
    },
  }
}
