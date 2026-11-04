// Sensitivity table (M3): how much the margin and the attenuation move for
// a +10 % change in one part.
import { converters, vinLow } from './bus'
import { abs, db } from './complex'
import { point } from './ladder'
import { marginBands } from './metrics'
import type { Design } from './model'
import { applyTol, keyInUse, type TolItem } from './tolerance'
import { getParam, type TolKey, TOL_KEYS, tolLabel } from './types'

export type SensRow = {
  id: string
  key: TolKey
  /** Block name and value label, e.g. "L1 L". */
  label: string
  value: number
  /** Margin change, dB (positive: more margin). */
  dMargin: number
  /** Attenuation change at fr, dB (positive: more attenuation). */
  dAtt: number
}

export type Sens = {
  /** Relative change applied to each part (0.1 for +10 %). */
  step: number
  /** Nominal margin (Vin min, full power) and attenuation at fr, dB. */
  margin: number
  att: number
  /** N·fsw of the converter with the least attenuation, Hz. */
  fr: number
  /** Largest |dMargin| first. */
  rows: SensRow[]
}

const attAt = (st: Design, f: number) => -db(abs(point(st, f).Hopen))
const marginOf = (st: Design) => marginBands(st, vinLow(st.conv)).margin

/**
 * Every main value in use (TOL_KEYS) of every block that is on, one at a
 * time times (1 + step). Same check range as the margin; the attenuation
 * is at one fixed frequency, the ripple fr of the worst converter.
 */
export function sensitivity(st: Design, step = 0.1): Sens {
  let fr = 0,
    att = Infinity
  for (const c of converters(st)) {
    const f = Math.max(1, Math.round(c.phases || 1)) * c.fsw
    const a = attAt(st, f)
    if (a < att) {
      att = a
      fr = f
    }
  }
  const margin = marginOf(st)
  const rows: SensRow[] = []
  for (const b of st.blocks) {
    if (!b.on) continue
    for (const key of TOL_KEYS[b.type] as readonly TolKey[]) {
      if (!keyInUse(b, key)) continue
      const item: TolItem = { id: b.id, key, tol: step * 100 }
      const d = applyTol(st, [item], [step])
      rows.push({
        id: b.id,
        key,
        label: `${b.name} ${tolLabel(b.type, key)}`,
        value: getParam(b, key),
        dMargin: marginOf(d) - margin,
        dAtt: attAt(d, fr) - att,
      })
    }
  }
  rows.sort(
    (x, y) =>
      Math.abs(y.dMargin) - Math.abs(x.dMargin) ||
      Math.abs(y.dAtt) - Math.abs(x.dAtt)
  )
  return { step, margin, att, fr, rows }
}
