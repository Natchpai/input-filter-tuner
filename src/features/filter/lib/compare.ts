// Compare two designs: key results, then every value that differs.
import {
  type Block,
  DAMP,
  db,
  type Design,
  converters,
  type Metrics,
  metrics,
  pBus,
  TYPES,
} from '../engine'
import { fmtSI } from './si'

/** Metrics per saved design object; saved designs are never mutated. */
const mCache = new WeakMap<Design, Metrics | null>()
export function metricsOf(d: Design): Metrics | null {
  let m = mCache.get(d)
  if (m === undefined) {
    try {
      m = metrics(d)
    } catch {
      m = null
    }
    mCache.set(d, m)
  }
  return m
}

export type Row = [string, string, string]

const fmtParam = (v: number, unit: string) =>
  unit === '' ? String(v) : unit === '%' ? `${v} %` : fmtSI(v, unit)

/** Key results of both designs, then every value that differs. */
export function compareRows(
  a: Design,
  ma: Metrics | null,
  b: Design,
  mb: Metrics | null
): Row[] {
  const rows: Row[] = []
  const res = (label: string, fn: (m: Metrics) => string) =>
    rows.push([label, ma ? fn(ma) : '–', mb ? fn(mb) : '–'])
  res('Peak |Zout|', (m) => fmtSI(m.peak.v, 'Ω'))
  res('Margin', (m) => `${m.margin.toFixed(1)} dB`)
  res('Q (series form)', (m) =>
    m.qSeries === null ? '–' : m.qSeries.toFixed(2)
  )
  res('Z0', (m) => (m.prim ? fmtSI(m.prim.Z0, 'Ω') : '–'))
  res('f0', (m) => (m.prim ? fmtSI(m.prim.f0, 'Hz') : '–'))
  res('Attenuation @ N·fsw', (m) => `${(-db(m.ripple.hfr)).toFixed(1)} dB`)
  res('DC loss', (m) => fmtSI(m.dc.loss, 'W'))

  const diff = (label: string, x: string, y: string) => {
    if (x !== y) rows.push([label, x, y])
  }
  const conv: [keyof Design['conv'], string, string][] = [
    ['vinMin', 'Vin min', 'V'],
    ['vinNom', 'Vin nom', 'V'],
    ['vinMax', 'Vin max', 'V'],
    ['pout', 'P out', 'W'],
    ['pLight', 'Light load', 'W'],
    ['eta', 'Efficiency', ''],
    ['vout', 'Vout', 'V'],
    ['fsw', 'fsw', 'Hz'],
    ['phases', 'Phases', ''],
    ['k', 'k', 'dB'],
    ['fcheck', 'fcheck', 'Hz'],
  ]
  for (const [k, label, u] of conv)
    diff(label, fmtParam(a.conv[k], u), fmtParam(b.conv[k], u))
  diff('Converters', String(converters(a).length), String(converters(b).length))
  diff('Bus P full', fmtSI(pBus(a, 'full'), 'W'), fmtSI(pBus(b, 'full'), 'W'))
  diff('Rsrc', fmtSI(a.source.R, 'Ω'), fmtSI(b.source.R, 'Ω'))
  diff('Lsrc', fmtSI(a.source.L, 'H'), fmtSI(b.source.L, 'H'))

  const byName = (d: Design) => new Map(d.blocks.map((x) => [x.name, x]))
  const ba = byName(a),
    bb = byName(b)
  const names = [...new Set([...ba.keys(), ...bb.keys()])]
  const desc = (x: Block | undefined) =>
    !x ? 'absent' : TYPES[x.type].label + (x.on ? '' : ' (off)')
  for (const n of names) {
    const x = ba.get(n),
      y = bb.get(n)
    if (!x || !y || x.type !== y.type || x.on !== y.on) {
      diff(n, desc(x), desc(y))
      if (!x || !y || x.type !== y.type) continue
    }
    for (const p of TYPES[x.type].p) {
      const vx = (x as unknown as Record<string, number>)[p.key],
        vy = (y as unknown as Record<string, number>)[p.key]
      diff(`${n} ${p.label}`, fmtParam(vx, p.unit), fmtParam(vy, p.unit))
    }
    if (x.type === 'ind' && y.type === 'ind') {
      diff(`${n} damping`, DAMP[x.dmode], DAMP[y.dmode])
      if (x.dmode !== 'none' || y.dmode !== 'none') {
        diff(`${n} dR`, fmtSI(x.dR, 'Ω'), fmtSI(y.dR, 'Ω'))
        diff(`${n} dL`, fmtSI(x.dL, 'H'), fmtSI(y.dL, 'H'))
      }
    }
  }
  return rows
}
