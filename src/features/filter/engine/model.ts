// Data model of a filter design. The engine reads it; the UI state is the same
// object.

export type DampMode = 'none' | 'R' | 'RLpar' | 'RLser'

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
}
export type Bead2Block = BlockBase & {
  type: 'bead2'
  rdc: number
  lb: number
  rb: number
}
export type Bead4Block = BlockBase & {
  type: 'bead4'
  rs: number
  lb: number
  rp: number
  cb: number
}
export type ResBlock = BlockBase & { type: 'res'; r: number; l: number }
export type CapBlock = BlockBase & {
  type: 'cap'
  c: number
  esr: number
  esl: number
  n: number
  derate: number
}
export type RcBlock = BlockBase & {
  type: 'rc'
  rd: number
  cd: number
  esr: number
  esl: number
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
}

export type Source = { R: number; L: number }

export type TabKey = 'zout' | 'xfer' | 'zin' | 'tm' | 'elem' | 'sweep'

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

export type Design = {
  v: number
  name: string
  conv: Conv
  source: Source
  blocks: Block[]
  plot: PlotSettings
}

/** Scale factors for L and C (tolerance curves). */
export type Scale = { L: number; C: number }
