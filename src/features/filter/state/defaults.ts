// New blocks and designs with default values.
import {
  type Block,
  type BlockOf,
  type BlockType,
  type Conv,
  type Design,
  type PlotSettings,
  type Source,
  TYPES,
} from '../engine'

let uid = 1
/**
 * A new block id. Call it from event handlers and builders, never inside the
 * reducer, so the reducer stays pure.
 */
export const newId = () => 'b' + uid++

/** A block of a type with default values, then vals on top. */
export function mk<T extends BlockType>(
  type: T,
  name: string,
  vals: Partial<BlockOf<T>> = {},
  id: string = newId()
): BlockOf<T> {
  const b: Record<string, unknown> = { id, type, name, on: true }
  for (const p of TYPES[type].p) b[p.key] = p.def
  if (type === 'ind') Object.assign(b, { dmode: 'none', dR: 1, dL: 10e-6 })
  return Object.assign(b, vals) as BlockOf<T>
}

export const CONV_DEFAULTS: Conv = {
  vinMin: 12,
  vinNom: 12,
  vinMax: 12,
  pout: 10,
  eta: 1,
  vout: 5,
  fsw: 1e6,
  phases: 1,
  k: 6,
  fcheck: 1e6,
  pLight: 0,
}

export const PLOT_DEFAULTS: PlotSettings = {
  fmin: 10,
  fmax: 100e6,
  n: 800,
  xfer: 'H',
  load: 'open',
  rload: 10,
  z0: 50,
  undamped: true,
  tol: false,
  dL: -30,
  dC: -40,
  tab: 'zout',
  sweepId: null,
}

export function baseState(
  name: string,
  conv: Partial<Conv>,
  source: Partial<Source>,
  blocks: Block[],
  plot: Partial<PlotSettings> = {}
): Design {
  return {
    v: 1,
    name,
    conv: { ...CONV_DEFAULTS, ...conv },
    source: { R: 0, L: 0, ...source },
    blocks,
    plot: { ...PLOT_DEFAULTS, ...plot },
  }
}
