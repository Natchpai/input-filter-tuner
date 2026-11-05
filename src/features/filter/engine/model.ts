// Data model of a filter design. The engine reads it; the UI state is the same
// object.
import type { EmiStd } from './emi-limits'
import type { ESeries } from './eseries'

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

/** Fields a converter on the bus has of its own (M5). Bus fields: Vin, k. */
export const LOAD_KEYS = [
  'pout',
  'pLight',
  'eta',
  'vout',
  'fsw',
  'phases',
  'fcheck',
] as const
export type LoadKey = (typeof LOAD_KEYS)[number]

/**
 * Converter 2 to 6 on the same bus as `conv` (M5). Its Vin and k are the
 * bus fields in `conv`.
 */
export type BusConv = Pick<Conv, LoadKey> & {
  id: string
  name: string
  /** Off: the converter is left out of every check. */
  on: boolean
}

/** Most extra converters (6 converters in all, with `conv`). */
export const MAX_LOADS = 5

export type Source = { R: number; L: number }

export type TabKey =
  'zout' | 'xfer' | 'zin' | 'tm' | 'elem' | 'sweep' | 'emi' | 'time'

/** Which waveform the Time domain tab shows (M4). */
export type TranView = 'hot' | 'step' | 'ripple'

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
  /** View setting of the Time domain tab; not recorded in undo. */
  tview: TranView
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

/** Time-domain settings (M4). */
export type TranSettings = {
  /** The time-domain check is shown (card body, tab, report). Off by default. */
  on: boolean
  /** Cable after Rsrc + Lsrc, hot-plug only: L in H, R in Ω. */
  lCable: number
  rCable: number
}

/** Damping form the design assistant can propose (M3). */
export type DampForm = 'rc' | 'RLpar' | 'RLser' | 'R'

/** One stage of the design assistant: the fixed part and its damping. */
export type StageIn = {
  /** The part whose value is typed; the other one follows from f0. */
  fix: 'L' | 'C'
  /** Value of the fixed part, H or F. */
  val: number
  damp: DampForm
}

/**
 * What the optimizer minimizes (M3b). 'meet' is the M3a proposal: meet the
 * targets, minimize nothing.
 */
export type OptGoal = 'meet' | 'cd' | 'ctot' | 'loss'

/** L and C range of one stage for the optimizer (M3b), H and F; 0 = auto. */
export type StageRng = {
  lMin: number
  lMax: number
  cMin: number
  cMax: number
}

/** Design assistant inputs (M3). The proposal itself is not state. */
export type AsstSettings = {
  /** The assistant card is open. Off by default. */
  on: boolean
  stages: 1 | 2
  /** 'db': aDb at fa. 'emi': EMI margin >= 0 in every band (needs emi.on). */
  target: 'db' | 'emi'
  /** Attenuation target, dB (positive). */
  aDb: number
  /** Frequency of the target, Hz. 0: the lowest N*fsw on the bus. */
  fa: number
  /** Share of the dB in stage 1 (source side), %. 2 stages only. */
  split: number
  /** 'q': damping for target Q. 'leastCd': Erickson, least n for margin k. */
  rule: 'q' | 'leastCd'
  /** Target Q (rule 'q'). */
  q: number
  /** Stage 1 (source side), stage 2 (converter side). */
  st: [StageIn, StageIn]
  /** E-series for inductors (L, Ld), capacitors (C, Cd) and resistors. */
  ser: { L: ESeries; C: ESeries; R: ESeries }
  /** M3b: the goal; 'meet' keeps the M3a proposal. */
  goal: OptGoal
  /** M3b: highest gain peak max|Hopen| as a ratio; 0 = no limit. */
  qPeak: number
  /** M3b: highest filter DC loss, % of bus Pout; 0 = no limit. */
  eps: number
  /** M3b: L and C ranges of stage 1 and 2. */
  rng: [StageRng, StageRng]
  /** M3b: try every damping form per stage. */
  allForms: boolean
}

export type Design = {
  v: number
  name: string
  conv: Conv
  /** Converters 2 to 6 on the same bus (M5). Empty: one converter. */
  loads: BusConv[]
  source: Source
  blocks: Block[]
  plot: PlotSettings
  emi: EmiSettings
  tran: TranSettings
  /** Design assistant inputs (M3). */
  asst: AsstSettings
  /** Free-text design notes, at most MAX_NOTES characters. */
  notes?: string
}

/**
 * The tab to show. The EMI and Time domain tabs exist only while their check
 * is on; otherwise Zout. Every path that sets or restores a tab uses this.
 */
export function tabOf(st: Design, tab: TabKey = st.plot.tab): TabKey {
  if (tab === 'emi' && !st.emi.on) return 'zout'
  if (tab === 'time' && !st.tran.on) return 'zout'
  return tab
}

export const MAX_NOTES = 2000

/** Longest block name, characters. */
export const MAX_BLOCK_NAME = 40

/** Scale factors for L and C (tolerance curves). */
export type Scale = { L: number; C: number }
