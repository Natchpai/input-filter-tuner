// Text <-> curve for the C-vs-bias and L-vs-current editors.
import type { Curve } from '../engine'
import { fmtSI, parseSI } from './si'

/** Same cap as adopt(). */
export const MAX_CURVE_POINTS = 64

export type CurveError = { line: number; text: string; msg: string }

/**
 * Split one line into its first two fields.
 * - A semicolon or tab splits (so a decimal comma still works).
 * - Else a comma splits.
 * - Else runs of spaces split, but a word that does not start like a number
 *   (a unit such as "V" or "µF") stays with the number before it.
 */
function fields(line: string): string[] {
  if (/[;\t]/.test(line)) return line.split(/[;\t]/).map((s) => s.trim())
  if (line.includes(',')) return line.split(',').map((s) => s.trim())
  const out: string[] = []
  for (const tok of line.trim().split(/\s+/)) {
    if (tok === '') continue
    if (/^[-+.\d]/.test(tok) || out.length === 0) out.push(tok)
    else out[out.length - 1] += ' ' + tok
  }
  return out
}

/** Parse one point per line. Bad lines are reported, good ones are kept. */
export function parseCurve(text: string): {
  points: Curve
  errors: CurveError[]
} {
  const errors: CurveError[] = []
  const seen = new Set<number>()
  const points: Curve = []
  let data = false // a data line (even a bad one) has been seen
  const lines = text.split(/\r\n|\r|\n/)
  lines.forEach((raw, i) => {
    const line = i + 1
    if (raw.trim() === '') return
    const err = (msg: string) => errors.push({ line, text: raw.trim(), msg })
    const f = fields(raw)
    const x = f.length > 0 ? parseSI(f[0]) : NaN
    const y = f.length > 1 ? parseSI(f[1]) : NaN
    const xOk = !Number.isNaN(x),
      yOk = !Number.isNaN(y)
    if (!xOk && !yOk) {
      if (data) err('Not a number')
      return // a header before the first data line
    }
    data = true
    if (!xOk) return err('First value is not a number')
    if (f.length < 2) return err('Needs two values')
    if (!yOk) return err('Second value is not a number')
    if (!Number.isFinite(x) || !Number.isFinite(y))
      return err('Values must be finite')
    if (x < 0) return err('x must be 0 or more')
    if (y <= 0) return err('y must be above 0')
    if (seen.has(x)) return err('Duplicate x, first one kept')
    if (points.length >= MAX_CURVE_POINTS)
      return err(`More than ${MAX_CURVE_POINTS} points`)
    seen.add(x)
    points.push([x, y])
  })
  points.sort((a, b) => a[0] - b[0])
  return { points, errors }
}

/** One point per line, e.g. "12 V, 3.96 µF". Parses back via parseCurve. */
export function formatCurve(c: Curve, xUnit: string, yUnit: string): string {
  return c.map(([x, y]) => `${fmtSI(x, xUnit)}, ${fmtSI(y, yUnit)}`).join('\n')
}
