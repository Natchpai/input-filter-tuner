// Conducted EMI prediction (M2, docs/M2-plan.md): the converter's input
// current spectrum, the LISN as the source, and the reading at the receiver.
import { abs, add, type Complex, cx, inv, mul, par, TAU } from './complex'
import {
  bandLimit,
  bandsOf,
  type EmiBand,
  type EmiStd,
  EMI_STDS,
} from './emi-limits'
import { abcd } from './ladder'
import type { Block, Conv, Design } from './model'
import { atCorner, corners } from './oppoint'
import { SC1 } from './types'

export type Harmonic = {
  /** Harmonic number of fsw. */
  n: number
  /** Frequency, Hz. */
  f: number
  /** Peak amplitude of the converter input current at f, A. */
  c: number
}

/** Duty cycle and DC output current, as metrics() uses them. */
export function dutyOf(conv: Conv): { D: number; io: number; N: number } {
  return {
    N: Math.max(1, Math.round(conv.phases || 1)),
    D: Math.min(1, Math.max(0, conv.vout / (conv.vinNom * conv.eta))),
    io: conv.pout / conv.vout,
  }
}

const sinc = (x: number) => (x === 0 ? 1 : Math.sin(x) / x)

/**
 * Peak amplitude of harmonic n of fsw of the converter input current.
 *
 * Each of the N phases draws a trapezoid of height io/N, width D·T at the
 * 50 % points and equal rise and fall time tr, shifted by T/N. The phases
 * add only at multiples of N, so
 *   c_n = 2·io·|sin(nπD)|/(nπ) · |sinc(nπ·tr·fsw)|  when N divides n,
 *   c_n = 0                                         otherwise.
 * With tr = 0 and n = N this is metrics().ripple.ih. A null of sin(nπD)
 * returns exactly 0. tr is held at most
 * min(D, 1 − D)·T, where the trapezoid becomes a triangle.
 */
export function harmonicAmp(conv: Conv, tr: number, n: number): number {
  return Math.abs(harmonicSigned(conv, tr, n))
}

/**
 * Signed cosine coefficient of harmonic n, with phase 1 centred at t = 0:
 * i(t) = io·D + Σ c_n·cos(n·ω·t). |c_n| is harmonicAmp(). Used for the
 * time-domain ripple waveform (M4).
 */
export function harmonicSigned(conv: Conv, tr: number, n: number): number {
  const { D, io, N } = dutyOf(conv)
  if (n % N !== 0) return 0
  const t = Math.min(tr, Math.min(D, 1 - D) / conv.fsw)
  const x = n * Math.PI
  // An exact null (n·D an integer) is zero, not rounding noise.
  const s = Math.sin(x * D)
  if (Math.abs(s) < 1e-9) return 0
  return ((2 * io * s) / x) * sinc(x * t * conv.fsw)
}

/**
 * Harmonics of the input current from fLo to fHi, Hz. Only the multiples of
 * N, since the others are zero.
 */
export function harmonics(
  conv: Conv,
  tr: number,
  fLo: number,
  fHi: number
): Harmonic[] {
  const { N } = dutyOf(conv)
  const step = N * conv.fsw
  const out: Harmonic[] = []
  for (let m = Math.max(1, Math.ceil(fLo / step)); m * step <= fHi; m++) {
    const n = m * N
    out.push({ n, f: n * conv.fsw, c: harmonicAmp(conv, tr, n) })
  }
  return out
}

/**
 * Source-port current per ampere drawn by the converter, with the source
 * impedance Zs at the filter input: 1/(A + Zs·C). With Zs = Rsrc + jωLsrc
 * this is point().Hopen.
 */
export function hPort(blocks: Block[], f: number, Zs: Complex): Complex {
  const { A, C } = abcd(blocks, TAU * f, SC1)
  return inv(add(A, mul(Zs, C)))
}

/** Lowest frequency with a limit, Hz. */
export const EMI_F_LO = 150e3

/** Nominal artificial network impedance at f: (jωL + R) ∥ Rm. */
export function zLisn(std: EmiStd, f: number): Complex {
  const { L, R, Rm } = EMI_STDS[std].lisn
  return par(cx(R, TAU * f * L), cx(Rm))
}

/** Receiver reading of a sine with peak amplitude v (V), dBµV rms. */
export const dbuv = (v: number) => 20 * Math.log10(v / Math.SQRT2 / 1e-6)

export type EmiPoint = Harmonic & {
  /** Receiver voltage, peak, V: with the filter, and with no filter. */
  vPred: number
  vBare: number
}

/**
 * Receiver voltage per harmonic. The AN replaces Rsrc and Lsrc. With 2 lines
 * the loop sees 2·Zl and each receiver reads its own line:
 *   V = c_n · |hPort(blocks, f, lines·Zl)| · |Zl|.
 * No filter (vBare): all of c_n flows into the AN.
 */
export function emiSpectrum(st: Design): EmiPoint[] {
  const { std, lines, tr } = st.emi
  return harmonics(st.conv, tr, EMI_F_LO, EMI_STDS[std].fMax).map((h) => {
    const zl = zLisn(std, h.f)
    const zLoop = cx(lines * zl.re, lines * zl.im)
    const z = abs(zl)
    return {
      ...h,
      vPred: h.c * abs(hPort(st.blocks, h.f, zLoop)) * z,
      vBare: h.c * z,
    }
  })
}

/**
 * Reading at point i in a receiver of bandwidth rbw: the harmonics within
 * ±rbw/2 add in amplitude (conservative). With spacing above rbw/2 it is
 * the point itself.
 */
function inRbw(sp: EmiPoint[], i: number, rbw: number, key: 'vPred' | 'vBare') {
  let v = sp[i][key]
  for (let j = i - 1; j >= 0 && sp[i].f - sp[j].f <= rbw / 2; j--)
    v += sp[j][key]
  for (let j = i + 1; j < sp.length && sp[j].f - sp[i].f <= rbw / 2; j++)
    v += sp[j][key]
  return v
}

export type EmiBandRow = {
  band: EmiBand
  /** Worst harmonic over the corners; null fields when none is in the band. */
  corner: string | null
  /** Index of that corner in EmiResult.spectra. */
  ci: number | null
  f: number | null
  /** Strictest limit at f, dBµV. */
  limit: number | null
  /** Predicted reading at f, dBµV. */
  pred: number | null
  /** limit − pred − user margin, dB. */
  margin: number | null
  /** Highest required filter attenuation in the band, dB: bare − (limit − margin). */
  aReq: number | null
}

export type EmiResult = {
  rows: EmiBandRow[]
  /** Every band with a harmonic has margin ≥ 0. */
  pass: boolean
  /** Index into rows of the lowest margin, or −1. */
  worst: number
  /** Highest LC corner frequency that meets every limit (40 dB/dec), Hz. */
  f0Max: number | null
  /** Some band adds several harmonics in one RBW. */
  rbwSum: boolean
  /**
   * Corners where Vout/(Vin·η) ≥ 1: the converter cannot regulate, the duty
   * cycle is clamped to 1 and no ripple is predicted there.
   */
  dropout: string[]
  /** Spectrum per full-load Vin corner, and the index of the worst one. */
  spectra: { label: string; pts: EmiPoint[] }[]
  worstCorner: number
}

/**
 * EMI at every full-load Vin corner, judged per band of st.emi's standard
 * and class. A harmonic with zero amplitude is not judged.
 */
export function emiResult(st: Design): EmiResult {
  const { std, cls, margin: um } = st.emi
  const bands = bandsOf(std, cls)
  const full = corners(st).filter((c) => c.pLoad === st.conv.pout)
  const spectra = full.map((c) => ({
    label: c.label,
    pts: emiSpectrum(atCorner(st, c)),
  }))
  const step = Math.max(1, Math.round(st.conv.phases || 1)) * st.conv.fsw
  let f0Max: number | null = null,
    rbwSum = false,
    worstCorner = 0
  const rows = bands.map((band): EmiBandRow => {
    const row: EmiBandRow = {
      band,
      corner: null,
      ci: null,
      f: null,
      limit: null,
      pred: null,
      margin: null,
      aReq: null,
    }
    spectra.forEach((s, ci) => {
      s.pts.forEach((p, i) => {
        if (p.f < band.fLo || p.f > band.fHi || p.c === 0) return
        if (step <= band.rbw / 2) rbwSum = true
        const lim = bandLimit(band, p.f)
        const pred = dbuv(inRbw(s.pts, i, band.rbw, 'vPred'))
        const aReq = dbuv(inRbw(s.pts, i, band.rbw, 'vBare')) - (lim - um)
        const m = lim - pred - um
        if (row.margin === null || m < row.margin)
          Object.assign(row, {
            corner: s.label,
            f: p.f,
            limit: lim,
            pred,
            margin: m,
            ci,
          })
        if (row.aReq === null || aReq > row.aReq) row.aReq = aReq
        if (aReq > 0) {
          const f0 = p.f * 10 ** (-aReq / 40)
          if (f0Max === null || f0 < f0Max) f0Max = f0
        }
      })
    })
    return row
  })
  let worst = -1
  rows.forEach((r, i) => {
    if (r.margin !== null && (worst < 0 || r.margin < rows[worst].margin!))
      worst = i
  })
  if (worst >= 0) worstCorner = rows[worst].ci ?? 0
  const dropout = full
    .filter((c) => st.conv.vout >= c.vin * st.conv.eta)
    .map((c) => c.label)
  return {
    rows,
    pass: rows.every((r) => r.margin === null || r.margin >= 0),
    worst,
    f0Max,
    rbwSum,
    dropout,
    spectra,
    worstCorner,
  }
}
