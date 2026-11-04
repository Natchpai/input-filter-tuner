// E-series preferred values (IEC 60063) and snapping to them (M3).

export type ESeries = 'E6' | 'E12' | 'E24' | 'E96'

export const E_SERIES: readonly ESeries[] = ['E6', 'E12', 'E24', 'E96']

// E24 holds the historical values (2.7, 3.0, 3.3, …), so the tables are
// typed in, not computed. E6 and E12 are every 4th and every 2nd E24 value.
const E24 = [
  100, 110, 120, 130, 150, 160, 180, 200, 220, 240, 270, 300, 330, 360, 390,
  430, 470, 510, 560, 620, 680, 750, 820, 910,
]
// Checked against LQRx/Images/Resistor_E96.png.
const E96 = [
  100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140,
  143, 147, 150, 154, 158, 162, 165, 169, 174, 178, 182, 187, 191, 196, 200,
  205, 210, 215, 221, 226, 232, 237, 243, 249, 255, 261, 267, 274, 280, 287,
  294, 301, 309, 316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412,
  422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549, 562, 576, 590,
  604, 619, 634, 649, 665, 681, 698, 715, 732, 750, 768, 787, 806, 825, 845,
  866, 887, 909, 931, 953, 976,
]

/** Mantissas of one decade, 100 … < 1000. */
export const DECADE: Record<ESeries, readonly number[]> = {
  E6: E24.filter((_, i) => i % 4 === 0),
  E12: E24.filter((_, i) => i % 2 === 0),
  E24,
  E96,
}

export const isESeries = (s: unknown): s is ESeries =>
  typeof s === 'string' && (E_SERIES as readonly string[]).includes(s)

/** Rounds away float noise, e.g. 4.7e-6 instead of 4.699999e-6. */
const tidy = (x: number) => Number(x.toPrecision(12))

/**
 * The series values next to v: lower ≤ v ≤ upper, and the log-nearest of
 * the two. A value already on the series gives lower = upper = v.
 */
export function snap(
  v: number,
  ser: ESeries
): { lower: number; upper: number; nearest: number } {
  if (!(v > 0) || !Number.isFinite(v)) return { lower: v, upper: v, nearest: v }
  const tab = DECADE[ser]
  let e = Math.floor(Math.log10(v)) - 2
  // Mantissa in [100, 1000); the float guard keeps 4.7e-6 on 470.
  let m = tidy(v / 10 ** e)
  if (m >= 1000) {
    e += 1
    m = tidy(v / 10 ** e)
  } else if (m < 100) {
    e -= 1
    m = tidy(v / 10 ** e)
  }
  let i = tab.length - 1
  while (i > 0 && tab[i] > m) i--
  const lo = tab[i]
  const hi = i + 1 < tab.length ? tab[i + 1] : 1000
  const lower = tidy(lo * 10 ** e)
  const upper = lo === m ? lower : tidy(hi * 10 ** e)
  const nearest = m / lo <= hi / m ? lower : upper
  return { lower, upper, nearest }
}

/** The series value one step below (dir −1) or above (dir +1) v. */
export function stepE(v: number, ser: ESeries, dir: -1 | 1): number {
  const s = snap(v, ser)
  if (dir > 0)
    return s.upper > v * (1 + 1e-9) ? s.upper : snap(v * 1.0001, ser).upper
  return s.lower < v * (1 - 1e-9) ? s.lower : snap(v * 0.9999, ser).lower
}
