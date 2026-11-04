// Data model of a filter design. The engine reads it; the UI state is the same
// object.
import type { EmiStd } from './emi-limits'

export type DampMode = 'none' | 'R' | 'RLpar' | 'RLser'

/** Points [x, y], sorted by x. Linear between points, flat beyond the ends. */
export type Curve = [number, number][]

/** ± % tolerance per value key (M1b). Symmetric, uniform in Monte Carlo. */
export type Tol<K extends string> = Partial<Record<K, number>>

type BlockBase = {
  id: string
  name: string
  on: boolean
  /** Last target Q typed into the "Rd for Q" helper (Rd-Cd legs). */
  _q?: number
}

export type IndBlock = BlockBase & {
  type: 'ind'
  L: number
  dcr: number
  cp: number
  dmode: DampMode
  dR: number
  dL: number
  /** L against DC current, [A, H] points (operating-point corners). */
  li?: Curve
  tol?: Tol<'L' | 'dR' | 'dL'>
}
export type Bead2Block = BlockBase & {
  type: 'bead2'
  rdc: number
  lb: number
  rb: number
  /** Lb against DC current, [A, H] points (operating-point corners). */
  li?: Curve
  tol?: Tol<'lb'>
}
export type Bead4Block = BlockBase & {
  type: 'bead4'
  rs: number
  lb: number
  rp: number
  cb: number
  /** Lb against DC current, [A, H] points (operating-point corners). */
  li?: Curve
  tol?: Tol<'lb'>
}
export type ResBlock = BlockBase & {
  type: 'res'
  r: number
  l: number
  tol?: Tol<'r'>
}
export type CapBlock = BlockBase & {
  type: 'cap'
  c: number
  esr: number
  esl: number
  n: number
  derate: number
  /** C per part against DC bias, [V, F] points. Replaces derate at corners. */
  cv?: Curve
  tol?: Tol<'c'>
}
export type RcBlock = BlockBase & {
  type: 'rc'
  rd: number
  cd: number
  esr: number
  esl: number
  tol?: Tol<'rd' | 'cd'>
}

export type Block =
  IndBlock | Bead2Block | Bead4Block | ResBlock | CapBlock | RcBlock
export type BlockType = Block['type']
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>
export type InductiveBlock = IndBlock | Bead2Block | Bead4Block

export type Conv = {
  vinMin: number
  vinNom: number
  vinMax: number
  pout: number
  eta: number
  vout: number
  fsw: number
  phases: number
  k: number
  fcheck: number
  /** Light-load power in W for the operating-point corners. Default 0. */
  pLight: number
}

export type Source = { R: number; L: number }

export type TabKey = 'zout' | 'xfer' | 'zin' | 'tm' | 'elem' | 'sweep' | 'emi'

export type PlotSettings = {
  fmin: number
  fmax: number
  n: number
  xfer: 'H' | 'S21'
  load: 'open' | 'conv' | 'res'
  rload: number
  z0: number
  undamped: boolean
  tol: boolean
  dL: number
  dC: number
  tab: TabKey
  sweepId: string | null
}

/** Conducted EMI settings (M2). `cls` is one of EMI_STDS[std].classes. */
export type EmiSettings = {
  /** The EMI check is shown (card body, tab, report section). Off by default. */
  on: boolean
  std: EmiStd
  cls: string
  /** Lines through an AN: 1 (return grounded locally) or 2. */
  lines: 1 | 2
  /** Switch edge time (rise = fall), s. 0 is an ideal pulse. */
  tr: number
  /** Design margin below the limit, dB. */
  margin: number
}

export type Design = {
  v: number
  name: string
  conv: Conv
  source: Source
  blocks: Block[]
  plot: PlotSettings
  emi: EmiSettings
  /** Free-text design notes, at most MAX_NOTES characters. */
  notes?: string
}

export const MAX_NOTES = 2000

/** Longest block name, characters. */
export const MAX_BLOCK_NAME = 40

/** Scale factors for L and C (tolerance curves). */
export type Scale = { L: number; C: number }
