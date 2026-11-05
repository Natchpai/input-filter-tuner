// Closed-form damping design and the bead datasheet fit.
import { TAU } from './complex'

/**
 * Closed-form optimum damping for a lossless LC section (Middlebrook /
 * Erickson). rc: n = Cd/C. RLpar and RLser: n = Ld/L. Returns Rd and the
 * peak |Zout|, both scaled by Z0. Source: Erickson, "Optimal Single
 * Resistor Damping of Input Filters", APEC 1999: RLpar eqs. 6 and 12, RLser
 * eqs. 15 and 16 (there Qopt = R0/R), rc eqs. 19 and 20. Each form is
 * checked against the numeric optimizer and the paper's own numbers in
 * engine.test.ts. The app-note rule "Rd = Z0, Cd = 4C" is not this optimum
 * (docs/equations.md).
 */
export function closedForm(
  mode: string,
  n: number,
  Z0: number
): { rd: number; peak: number } | null {
  if (!(n > 0) || !(Z0 > 0)) return null
  if (mode === 'rc')
    return {
      rd: Z0 * Math.sqrt(((2 + n) * (4 + 3 * n)) / (2 * n * n * (4 + n))),
      peak: (Z0 * Math.sqrt(2 * (2 + n))) / n,
    }
  if (mode === 'RLpar')
    return {
      rd: Z0 * Math.sqrt((n * (3 + 4 * n) * (1 + 2 * n)) / (2 * (1 + 4 * n))),
      peak: Z0 * Math.sqrt(2 * n * (1 + 2 * n)),
    }
  if (mode === 'RLser')
    return {
      rd:
        Z0 *
        (n / (1 + n)) *
        Math.sqrt(((2 + n) * (4 + 3 * n)) / (2 * (1 + n) * (4 + n))),
      peak: (Z0 * Math.sqrt(2 * (1 + n) * (2 + n))) / n,
    }
  return null
}

/**
 * Inverse of closedForm's peak: the n whose optimum peak |Zout| is r·Z0.
 * rc: peak/Z0 = √(2(2+n))/n, so n = (1 + √(1+4r²))/r².
 * RLpar: peak/Z0 = √(2n(1+2n)), so n = (√(1+4r²) − 1)/4.
 * RLser: peak/Z0 = √(2(1+n)(2+n))/n, so n = (3 + √(1+4r²))/(r² − 2); it
 * never gets below √2, so r ≤ √2 gives null.
 */
export function nForPeak(mode: string, r: number): number | null {
  if (!(r > 0) || !Number.isFinite(r)) return null
  const s = Math.sqrt(1 + 4 * r * r)
  if (mode === 'rc') return (1 + s) / (r * r)
  if (mode === 'RLpar') return (s - 1) / 4
  if (mode === 'RLser') return r * r > 2 ? (3 + s) / (r * r - 2) : null
  return null
}

/** Blocking capacitor of an Rd-Cd leg, as a multiple of the section's C. */
export const CD_PER_C = 5

/**
 * NP-DR-26001 §7 (rev 0.4): Cd = 5·C, a practical rule (user, 2026-11-05).
 * It replaced Xcd = Rd/10 at f0, which gave about 10/Q·C (14·C at
 * Q = 0.707). With Rd from rdForQ the series Q = Re Zo(f0)/Z0 stays Q; the
 * peak |Zo| is about 0.81·Z0 at Q = 0.707 (47 µF) and within 5 % of Q·Z0
 * at Q ≥ 1.
 * Erickson's optimum needs n = 5.5 for a 0.707·Z0 peak (docs/equations.md).
 */
export const cdForC = (C: number) => CD_PER_C * C

/**
 * NP-DR-26001 §6.1: the series loss to add for Q, Δr = Z0/Q − rL. Methods A
 * (R with C) and D (R with L) add it directly. 0 or less when rL alone
 * already gives Q. An approximation, like rdForQ.
 */
export const drForQ = (Z0: number, Q: number, rL: number) => Z0 / Q - rL

/** NP-DR-26001: Rd = Z0² / (Z0/Q − rL). Infinity when rL alone already gives Q. */
export function rdForQ(Z0: number, Q: number, rL: number): number {
  const d = Z0 / Q - rL
  return d > 0 ? (Z0 * Z0) / d : Infinity
}

export type BeadPoints = {
  rdc: number
  fx: number
  x: number
  fsrf: number
  zmax: number
}

/** NP-DR-26004 datasheet extraction for the 4-element bead. */
export function beadFromDatasheet({ rdc, fx, x, fsrf, zmax }: BeadPoints) {
  const lb = x / (TAU * fx)
  return {
    rs: rdc,
    lb,
    rp: Math.max(zmax - rdc, 1e-3),
    cb: fsrf > 0 ? 1 / ((TAU * fsrf) ** 2 * lb) : 0,
  }
}
