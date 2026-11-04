// Block types: how each one sits in the ladder and which parameters it has.
import type {
  Block,
  BlockOf,
  BlockType,
  CapBlock,
  DampMode,
  InductiveBlock,
  Scale,
} from './model'

/** Keys of a block type whose values are numbers. */
export type NumKey<B> = {
  [K in keyof B]-?: B[K] extends number ? K : never
}[keyof B] &
  string

export type ParamSpec<K extends string = string> = {
  key: K
  label: string
  unit: string
  def: number
  min: number
  max: number
  /** 0 is a valid value (the part is left out). */
  allowZero: boolean
}

export type TypeSpec<T extends BlockType = BlockType> = {
  /** series: in the rail. shunt: rail to ground. */
  kind: 'series' | 'shunt'
  label: string
  prefix: string
  p: ParamSpec<NumKey<BlockOf<T>>>[]
  /** Offers the inductor damping options. */
  damp: boolean
}

const P = <K extends string>(
  key: K,
  label: string,
  unit: string,
  def: number,
  min: number,
  max: number,
  allowZero: boolean
): ParamSpec<K> => ({ key, label, unit, def, min, max, allowZero })

export const TYPES: { [T in BlockType]: TypeSpec<T> } = {
  ind: {
    kind: 'series',
    label: 'Inductor',
    prefix: 'L',
    p: [
      P('L', 'L', 'H', 10e-6, 1e-9, 10e-3, false),
      P('dcr', 'DCR', 'Ω', 20e-3, 1e-4, 10, true),
      P('cp', 'Cp (SRF)', 'F', 0, 0.1e-12, 1e-9, true),
    ],
    damp: true,
  },
  bead2: {
    kind: 'series',
    label: 'Ferrite bead, 2-element: Rdc + (Lb ∥ Rb)',
    prefix: 'FB',
    p: [
      P('rdc', 'Rdc', 'Ω', 50e-3, 1e-4, 10, true),
      P('lb', 'Lb', 'H', 1e-6, 1e-9, 100e-6, false),
      P('rb', 'Rb', 'Ω', 50, 0.1, 10e3, false),
    ],
    damp: false,
  },
  bead4: {
    kind: 'series',
    label: 'Ferrite bead, 4-element: Rs + (Lb ∥ Rp ∥ Cb)',
    prefix: 'FB',
    p: [
      P('rs', 'Rs', 'Ω', 50e-3, 1e-4, 10, true),
      P('lb', 'Lb', 'H', 1e-6, 1e-9, 100e-6, false),
      P('rp', 'Rp', 'Ω', 150, 0.1, 100e3, false),
      P('cb', 'Cb', 'F', 2e-12, 0.01e-12, 1e-9, true),
    ],
    damp: false,
  },
  res: {
    kind: 'series',
    label: 'Series resistor',
    prefix: 'R',
    p: [
      P('r', 'R', 'Ω', 0.1, 1e-4, 1e3, true),
      P('l', 'ESL', 'H', 0, 0.01e-9, 100e-9, true),
    ],
    damp: false,
  },
  cap: {
    kind: 'shunt',
    label: 'Capacitor bank',
    prefix: 'C',
    p: [
      P('c', 'C (each)', 'F', 10e-6, 1e-12, 10e-3, false),
      P('esr', 'ESR (each)', 'Ω', 5e-3, 1e-4, 10, true),
      P('esl', 'ESL (each)', 'H', 0, 0.01e-9, 100e-9, true),
      P('n', 'Count', '', 1, 1, 50, false),
      P('derate', 'DC-bias loss', '%', 0, 0, 90, true),
    ],
    damp: false,
  },
  rc: {
    kind: 'shunt',
    label: 'Rd-Cd damping leg',
    prefix: 'Rd',
    p: [
      P('rd', 'Rd', 'Ω', 1, 1e-3, 1e3, true),
      P('cd', 'Cd', 'F', 47e-6, 1e-9, 10e-3, false),
      P('esr', 'Cd ESR', 'Ω', 0, 1e-4, 10, true),
      P('esl', 'Cd ESL', 'H', 0, 0.01e-9, 100e-9, true),
    ],
    damp: false,
  },
}

export const BLOCK_TYPES = Object.keys(TYPES) as BlockType[]

/** Damping options for an inductor. */
export const DAMP: Record<DampMode, string> = {
  none: 'No damping',
  R: 'R across L (method B)',
  RLpar: 'Rd + Ld in series, across L (parallel Rd-Ld)',
  RLser: 'Rd ∥ Ld, in series with L (series Rd-Ld)',
}

export const SC1: Scale = { L: 1, C: 1 }

export const kindOf = (b: Block) => TYPES[b.type].kind

export function effC(b: CapBlock, s: Scale = SC1) {
  return b.c * (1 - (b.derate || 0) / 100) * s.C
}

export const isInductive = (b: Block): b is InductiveBlock =>
  b.type === 'ind' || b.type === 'bead2' || b.type === 'bead4'

export const mainL = (b: InductiveBlock, s: Scale = SC1) =>
  (b.type === 'ind' ? b.L : b.lb) * s.L

/** Read a numeric parameter by name. */
export const getParam = (b: Block, key: string): number =>
  (b as unknown as Record<string, number>)[key]

/** Copy of a block with one numeric parameter changed. */
export const setParam = <B extends Block>(b: B, key: string, val: number): B =>
  ({ ...b, [key]: val }) as B
