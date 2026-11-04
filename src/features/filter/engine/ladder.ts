// Block impedances, the ABCD ladder and everything at one frequency.
import {
  type Complex,
  add,
  cx,
  div,
  inv,
  mul,
  ONE,
  par,
  TAU,
  TINY,
  abs,
  ZERO,
} from './complex'
import type { Block, Conv, Design, Scale } from './model'
import { effC, kindOf, SC1 } from './types'

export function zBlock(b: Block, w: number, s: Scale = SC1): Complex {
  switch (b.type) {
    case 'ind': {
      let z = cx(b.dcr, w * b.L * s.L)
      if (b.cp > 0) z = par(z, cx(0, -1 / (w * b.cp)))
      if (b.dmode === 'R') z = par(z, cx(b.dR))
      else if (b.dmode === 'RLpar') z = par(z, cx(b.dR, w * b.dL))
      else if (b.dmode === 'RLser') z = add(z, par(cx(b.dR), cx(0, w * b.dL)))
      return z
    }
    case 'bead2':
      return add(cx(b.rdc), par(cx(0, w * b.lb * s.L), cx(b.rb)))
    case 'bead4':
      return add(
        cx(b.rs),
        par(
          cx(0, w * b.lb * s.L),
          cx(b.rp),
          b.cb > 0 ? cx(0, -1 / (w * b.cb)) : null
        )
      )
    case 'res':
      return cx(b.r, w * b.l)
    case 'cap': {
      const n = Math.max(1, b.n)
      return cx(b.esr / n, (w * b.esl - 1 / (w * effC(b, s))) / n)
    }
    case 'rc':
      return cx(b.rd + b.esr, w * b.esl - 1 / (w * b.cd))
  }
  throw new Error('unknown block ' + (b as { type: string }).type)
}

/** DC resistance of a series block (inductors are shorts at DC). */
export function dcR(b: Block): number {
  switch (b.type) {
    case 'ind':
      return b.dmode === 'R' || b.dmode === 'RLpar'
        ? b.dcr + b.dR > 0
          ? (b.dcr * b.dR) / (b.dcr + b.dR)
          : 0
        : b.dcr
    case 'bead2':
      return b.rdc
    case 'bead4':
      return b.rs
    case 'res':
      return b.r
  }
  return 0
}

export type ABCD = { A: Complex; B: Complex; C: Complex; D: Complex }

export function abcd(blocks: Block[], w: number, s: Scale): ABCD {
  let A = ONE,
    B = ZERO,
    C = ZERO,
    D = ONE
  for (const b of blocks) {
    if (!b.on) continue
    const z = zBlock(b, w, s)
    if (kindOf(b) === 'series') {
      B = add(mul(A, z), B)
      D = add(mul(C, z), D)
    } else {
      const y = inv(abs(z) < TINY ? cx(TINY) : z)
      A = add(A, mul(B, y))
      C = add(C, mul(D, y))
    }
  }
  return { A, B, C, D }
}

/** Lowest input voltage. The fields need not be typed in order. */
export const vinLow = (conv: Conv) =>
  Math.min(conv.vinMin, conv.vinNom, conv.vinMax)

/** Converter input as a negative resistance: Rn = −Vin²·η/P. */
export const rnOf = (conv: Conv, vin: number) =>
  -(vin * vin * conv.eta) / conv.pout

function loadZ(st: Design): Complex | null {
  const pl = st.plot
  if (pl.load === 'conv') return cx(rnOf(st.conv, st.conv.vinNom))
  if (pl.load === 'res') return cx(pl.rload)
  return null // open
}

export type Point = {
  Zout: Complex
  Hopen: Complex
  H: Complex
  S21: Complex
  Zin: Complex
  ZinOpen: Complex
  Tm: Complex
}

/** Everything at one frequency. */
export function point(st: Design, f: number, s: Scale = SC1): Point {
  const w = TAU * f
  const { A, B, C, D } = abcd(st.blocks, w, s)
  const Zs = cx(st.source.R, w * st.source.L)
  const den = add(A, mul(Zs, C))
  const num = add(B, mul(Zs, D))
  const Zout = div(num, den)
  const Hopen = inv(den)
  const ZL = loadZ(st)
  const H = ZL ? inv(add(den, div(num, ZL))) : Hopen
  const z0 = st.plot.z0 || 50
  const S21 = div(
    cx(2),
    add(add(A, D), add(cx(B.re / z0, B.im / z0), cx(C.re * z0, C.im * z0)))
  )
  const Rn = cx(rnOf(st.conv, st.conv.vinNom))
  const Zin = div(add(mul(A, Rn), B), add(mul(C, Rn), D))
  const ZinOpen = div(A, C)
  const RnMin = rnOf(st.conv, vinLow(st.conv))
  const Tm = cx(Zout.re / RnMin, Zout.im / RnMin)
  return { Zout, Hopen, H, S21, Zin, ZinOpen, Tm }
}

/** Log-spaced frequency grid. */
export function grid(fmin: number, fmax: number, n: number): Float64Array {
  const a = Math.log10(fmin),
    b = Math.log10(fmax),
    out = new Float64Array(n)
  for (let i = 0; i < n; i++) out[i] = 10 ** (a + ((b - a) * i) / (n - 1))
  return out
}

export const SWEEP_KEYS = [
  'Zout',
  'Hopen',
  'H',
  'S21',
  'Zin',
  'ZinOpen',
  'Tm',
] as const satisfies readonly (keyof Point)[]

export type Sweep = { f: ArrayLike<number> } & Record<keyof Point, Complex[]>

export function sweep(
  st: Design,
  s: Scale = SC1,
  f: ArrayLike<number> | null = null
): Sweep {
  const fr = f || grid(st.plot.fmin, st.plot.fmax, st.plot.n)
  const r = { f: fr } as Sweep
  for (const k of SWEEP_KEYS) r[k] = new Array<Complex>(fr.length)
  for (let i = 0; i < fr.length; i++) {
    const p = point(st, fr[i], s)
    for (const k of SWEEP_KEYS) r[k][i] = p[k]
  }
  return r
}
