// Several converters on one bus (M5). Pure. Converter 1 is `conv`; the
// extra ones are `loads` with on = true. The bus fields (Vin, k) stay in
// conv. With one converter every function gives today's numbers bit for bit
// (it uses the same expression), so parity holds. docs/M5-plan.md.
import type { Conv, Design, LoadKey } from './model'

/** One converter on the bus. */
export type BusUnit = Pick<Conv, LoadKey> & { name: string }

/** Converter input as a negative resistance: Rn = −Vin²·η/P. */
export const rnOf = (c: Pick<Conv, 'eta' | 'pout'>, vin: number) =>
  -(vin * vin * c.eta) / c.pout

/** Lowest of the three Vin fields: they need not be typed in order. */
export const vinLow = (c: Pick<Conv, 'vinMin' | 'vinNom' | 'vinMax'>) =>
  Math.min(c.vinMin, c.vinNom, c.vinMax)

/** Converter 1 and every extra converter that is on, in that order. */
export function converters(st: Design): BusUnit[] {
  const c = st.conv
  const out: BusUnit[] = [
    {
      name: 'Conv 1',
      pout: c.pout,
      pLight: c.pLight,
      eta: c.eta,
      vout: c.vout,
      fsw: c.fsw,
      phases: c.phases,
      fcheck: c.fcheck,
    },
  ]
  for (const l of st.loads) if (l.on) out.push(l)
  return out
}

/** Upper end of a converter's negative-resistance range (its crossover). */
export const fcOf = (c: Pick<Conv, 'fcheck' | 'fsw'>) => c.fcheck || c.fsw

/** Rn of converters in parallel: −Vin²/Σ(P_i/η_i). */
function rnOfSet(cs: BusUnit[], vin: number): number {
  if (cs.length === 1) return rnOf(cs[0], vin)
  let g = 0
  for (const c of cs) g += c.pout / c.eta
  return -(vin * vin) / g
}

/**
 * Bus Rn at one Vin, full power. With f: only the converters whose
 * crossover is at or above f; above every crossover, the converters with
 * the highest one (display only, the checks stop there).
 */
export function rnBus(st: Design, vin: number, f?: number): number {
  // One converter (the hot path: point() calls this at every frequency).
  if (!st.loads.some((l) => l.on)) return rnOf(st.conv, vin)
  const cs = converters(st)
  if (f === undefined) return rnOfSet(cs, vin)
  let act = cs.filter((c) => fcOf(c) >= f)
  if (act.length === 0) {
    const top = Math.max(...cs.map(fcOf))
    act = cs.filter((c) => fcOf(c) === top)
  }
  return rnOfSet(act, vin)
}

/** One band of the check range, where the bus Rn is flat. */
export type Band = {
  fLo: number
  fHi: number
  /** Bus Rn in this band, Ω (negative). */
  rn: number
  /** Converters that count in this band. */
  names: string[]
}

/**
 * The check range [fLo, highest crossover] split at each converter's
 * crossover. In band j only the converters with a crossover at or above its
 * top count. One converter: one band [fLo, fcheck], as today's checkRange.
 */
export function bands(st: Design, vin: number, fLo: number): Band[] {
  const cs = converters(st)
  const top = (c: BusUnit) => Math.max(fcOf(c), fLo * 1.01)
  const tops = [...new Set(cs.map(top))].sort((a, b) => a - b)
  let lo = fLo
  return tops.map((hi) => {
    const act = cs.filter((c) => top(c) >= hi)
    const b = {
      fLo: lo,
      fHi: hi,
      rn: rnOfSet(act, vin),
      names: act.map((c) => c.name),
    }
    lo = hi
    return b
  })
}

/** Total load power on the bus, W: every converter light or every one full. */
export function pBus(st: Design, load: 'light' | 'full'): number {
  let p = 0
  for (const c of converters(st))
    p += load === 'full' ? c.pout : Math.min(c.pLight, c.pout)
  return p
}

/**
 * DC input current of the bus at one Vin, A: Σ P_i/(η_i·Vin), each
 * converter light or each full.
 */
export function iBus(st: Design, vin: number, load: 'light' | 'full'): number {
  const cs = converters(st)
  const p = (c: BusUnit) =>
    load === 'full' ? c.pout : Math.min(c.pLight, c.pout)
  if (cs.length === 1) return p(cs[0]) / (cs[0].eta * vin)
  let i = 0
  for (const c of cs) i += p(c) / (c.eta * vin)
  return i
}
