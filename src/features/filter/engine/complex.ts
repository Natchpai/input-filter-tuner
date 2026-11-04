// Complex numbers as plain { re, im } objects.

export type Complex = { re: number; im: number }

export const TAU = 2 * Math.PI
export const TINY = 1e-15

export const cx = (re: number, im = 0): Complex => ({ re, im })
export const ZERO = cx(0)
export const ONE = cx(1)
export const add = (a: Complex, b: Complex) => cx(a.re + b.re, a.im + b.im)
export const mul = (a: Complex, b: Complex) =>
  cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re)
export const div = (a: Complex, b: Complex) => {
  const d = b.re * b.re + b.im * b.im
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d)
}
export const inv = (a: Complex) => div(ONE, a)
export const abs = (a: Complex) => Math.hypot(a.re, a.im)
/** Argument in degrees. */
export const argd = (a: Complex) => (Math.atan2(a.im, a.re) * 180) / Math.PI

/** Parallel of impedances; null is an open branch. */
export function par(...zs: (Complex | null)[]): Complex {
  let y = ZERO
  for (const z of zs) {
    if (z === null) continue
    y = add(y, inv(abs(z) < TINY ? cx(TINY) : z))
  }
  return abs(y) < TINY ? cx(1 / TINY) : inv(y)
}

export const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-300))
