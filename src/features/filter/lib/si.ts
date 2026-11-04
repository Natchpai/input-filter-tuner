// SI-prefix formatting and parsing.

const PFX: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
  [1e-15, 'f'],
]

const prefixFor = (a: number) =>
  PFX.find(([m]) => a >= m * 0.9995) || PFX[PFX.length - 1]

/** For display: 3 significant digits, prefix and unit, e.g. "22 µH". */
export function fmtSI(
  v: number | null | undefined,
  unit = '',
  sig = 3
): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–'
  if (!Number.isFinite(v))
    return (v > 0 ? '∞' : '−∞') + (unit ? ' ' + unit : '')
  if (v === 0) return '0' + (unit ? ' ' + unit : '')
  const p = prefixFor(Math.abs(v))
  const s = Number((v / p[0]).toPrecision(sig)).toString()
  return (
    (v < 0 ? s.replace('-', '−') : s) + (unit || p[1] ? ' ' : '') + p[1] + unit
  )
}

/** Compact, for input boxes: "4.7u". */
export function fmtIn(v: number): string {
  if (v === 0) return '0'
  const p = prefixFor(Math.abs(v))
  return (
    Number((v / p[0]).toPrecision(4)).toString() + (p[1] === 'µ' ? 'u' : p[1])
  )
}

const SFX: Record<string, number> = {
  T: 1e12,
  G: 1e9,
  M: 1e6,
  k: 1e3,
  K: 1e3,
  m: 1e-3,
  u: 1e-6,
  µ: 1e-6,
  μ: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
}

/** "4u7", "2.2uF", "1MHz", "10f", "1meg" → number; NaN when not a number. */
export function parseSI(str: string): number {
  // Strip a unit word, case-sensitive, so a femto "f" or milli "m" prefix is kept.
  let s = String(str)
    .trim()
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
    .replace(/(Ω|ohms?|Hz|H|F|V|W|A|%)$/, '')
  if (/^meg/i.test(s.replace(/^[-+0-9.e]+/i, ''))) s = s.replace(/meg$/i, 'M')
  // 4u7 style
  let m = s.match(/^([-+]?\d+)([TGMkKmuµμnpf])(\d+)$/)
  if (m) return parseFloat(m[1] + '.' + m[3]) * SFX[m[2]]
  m = s.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([TGMkKmuµμnpf]?)$/i)
  if (!m) return NaN
  return parseFloat(m[1]) * (m[2] ? SFX[m[2]] : 1)
}
