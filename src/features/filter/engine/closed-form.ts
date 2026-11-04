// Closed-form damping design and the bead datasheet fit.
import { TAU } from './complex'

/**
 * Closed-form optimum damping for a lossless LC section (Middlebrook /
 * Erickson). rc: n = Cd/C. RLpar and RLser: n = Ld/L. Returns Rd and the
 * peak |Zout|, both scaled by Z0. Each form is checked against the numeric
 * optimizer in engine.test.ts.
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
