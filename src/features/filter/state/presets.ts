// Presets. Each one traces back to a design report (see CLAUDE.md).
import { dampKey, type Design, optimizeParam, setParam } from '../engine'
import { baseState, mk } from './defaults'

type Preset = {
  name: string
  make: () => Design
  /** Indexes of blocks whose damping R is set to the numeric optimum. */
  optimize?: number | number[]
}

const D1 = {
  vinMin: 48,
  vinNom: 48,
  vinMax: 48,
  pout: 100,
  eta: 1,
  vout: 12,
  fsw: 500e3,
  fcheck: 500e3,
}
const D3 = {
  vinMin: 12,
  vinNom: 12,
  vinMax: 12,
  pout: 10,
  eta: 1,
  vout: 5,
  fsw: 1.1e6,
  fcheck: 1.1e6,
}

const PRESETS: Preset[] = [
  {
    name: 'D1 · LC undamped (48 V, 100 W)',
    make: () =>
      baseState('D1 LC undamped', D1, {}, [
        mk('ind', 'L1', { L: 22e-6, dcr: 20e-3 }),
        mk('cap', 'C1', { c: 10e-6, esr: 0 }),
      ]),
  },
  {
    name: 'D1 · LC + Rd-Cd, Q = 0.707',
    make: () =>
      baseState('D1 LC + Rd-Cd', D1, {}, [
        mk('ind', 'L1', { L: 22e-6, dcr: 20e-3 }),
        mk('cap', 'C1', { c: 10e-6, esr: 0 }),
        mk('rc', 'Rd1', { rd: 1.06, cd: 150e-6 }),
      ]),
  },
  {
    name: 'D1 · Method A: R in series with C',
    make: () =>
      baseState('D1 Method A', D1, {}, [
        mk('ind', 'L1', { L: 22e-6, dcr: 20e-3 }),
        mk('cap', 'C1', { c: 10e-6, esr: 2.08 }),
      ]),
  },
  {
    name: 'D1 · Method B: R across L',
    make: () =>
      baseState('D1 Method B', D1, {}, [
        mk('ind', 'L1', { L: 22e-6, dcr: 20e-3, dmode: 'R', dR: 1.06 }),
        mk('cap', 'C1', { c: 10e-6, esr: 0 }),
      ]),
  },
  {
    name: 'D1 · Method D: R in series with L',
    make: () =>
      baseState('D1 Method D', D1, {}, [
        mk('ind', 'L1', { L: 22e-6, dcr: 20e-3 }),
        mk('res', 'RD', { r: 2.08 }),
        mk('cap', 'C1', { c: 10e-6, esr: 0 }),
      ]),
  },
  {
    name: 'LC + parallel Rd-Ld (n = 0.5, optimum)',
    make: () =>
      baseState('LC + parallel Rd-Ld', D1, {}, [
        mk('ind', 'L1', {
          L: 22e-6,
          dcr: 20e-3,
          dmode: 'RLpar',
          dL: 11e-6,
          dR: 1.35,
        }),
        mk('cap', 'C1', { c: 10e-6, esr: 0 }),
      ]),
    optimize: 0,
  },
  {
    name: 'LC + series Rd∥Ld (n = 1, optimum)',
    make: () =>
      baseState('LC + series Rd-Ld', D1, {}, [
        mk('ind', 'L1', {
          L: 22e-6,
          dcr: 20e-3,
          dmode: 'RLser',
          dL: 22e-6,
          dR: 0.76,
        }),
        mk('cap', 'C1', { c: 10e-6, esr: 0 }),
      ]),
    optimize: 0,
  },
  {
    name: 'D3 · 2-element bead + C (12 V, 10 W)',
    make: () =>
      baseState('D3 bead filter', D3, {}, [
        mk('bead2', 'FB1', { rdc: 0.16, lb: 1e-6, rb: 50 }),
        mk('cap', 'C1', { c: 10e-6, esr: 0 }),
      ]),
  },
  {
    name: 'D4 · 4-element bead + 68 mΩ + 2×10 µF',
    make: () =>
      baseState('D4 bead final', D3, {}, [
        mk('bead4', 'FB1', {
          rs: 50e-3,
          lb: 1e-6,
          rp: 150,
          cb: 2e-12,
          // NP-DR-26004 report.md:200: "about 0.8 µH at 0.83 A". An assumed
          // typical value, not a datasheet value.
          li: [
            [0, 1.0e-6],
            [0.83, 0.8e-6],
          ],
        }),
        mk('res', 'R1', { r: 68e-3 }),
        mk('cap', 'C1', { c: 10e-6, esr: 0, n: 2, derate: 30 }),
      ]),
  },
  {
    name: 'Pi / CLC + Rd-Cd (12 V, 24 W)',
    make: () =>
      baseState(
        'Pi CLC',
        {
          vinMin: 9,
          vinNom: 12,
          vinMax: 15,
          pout: 24,
          eta: 0.92,
          vout: 5,
          fsw: 500e3,
          fcheck: 500e3,
        },
        {},
        [
          mk('cap', 'C1', {
            c: 4.7e-6,
            esr: 5e-3,
            esl: 0.5e-9,
            n: 2,
            derate: 30,
          }),
          mk('ind', 'L1', { L: 4.7e-6, dcr: 15e-3 }),
          mk('cap', 'C2', {
            c: 10e-6,
            esr: 3e-3,
            esl: 0.5e-9,
            n: 2,
            derate: 30,
          }),
          mk('rc', 'Rd1', { rd: 0.6, cd: 68e-6, esr: 0.05 }),
        ]
      ),
    optimize: 3,
  },
  {
    name: '2-stage LC, both damped (24 V, 60 W)',
    make: () =>
      baseState(
        '2-stage LC',
        {
          vinMin: 18,
          vinNom: 24,
          vinMax: 32,
          pout: 60,
          eta: 0.94,
          vout: 12,
          fsw: 400e3,
          fcheck: 400e3,
        },
        {},
        [
          mk('ind', 'L1', { L: 10e-6, dcr: 12e-3 }),
          mk('cap', 'C1', { c: 4.7e-6, esr: 4e-3, n: 2, derate: 35 }),
          mk('rc', 'Rd1', { rd: 1.2, cd: 33e-6 }),
          mk('ind', 'L2', { L: 2.2e-6, dcr: 6e-3 }),
          mk('cap', 'C2', { c: 4.7e-6, esr: 4e-3, n: 4, derate: 35 }),
          mk('rc', 'Rd2', { rd: 0.5, cd: 47e-6 }),
        ]
      ),
    optimize: [2, 5],
  },
  {
    name: 'D6 · TPS62142 bus: R_SRC, C_BUS, L101, C_BUCK',
    make: () =>
      baseState(
        'D6 TPS62142',
        {
          vinMin: 4.5,
          vinNom: 5,
          vinMax: 5.5,
          pout: 6.6,
          eta: 0.9,
          vout: 3.3,
          fsw: 2.5e6,
          fcheck: 2.5e6,
        },
        { R: 0.056 },
        [
          mk('cap', 'C_BUS', { c: 10e-6, esr: 5e-3, n: 3 }),
          mk('ind', 'L101', { L: 0.33e-6, dcr: 0.13 }),
          mk('cap', 'C_BUCK', { c: 10e-6, esr: 5e-3, n: 3 }),
        ]
      ),
  },
  {
    name: 'LQRx 02 · 24→12 V 240 W, 2-phase',
    make: () =>
      baseState(
        'LQRx 02 power state',
        {
          vinMin: 15,
          vinNom: 24,
          vinMax: 28,
          pout: 240,
          eta: 0.95,
          vout: 12,
          fsw: 200e3,
          phases: 2,
          fcheck: 200e3,
        },
        {},
        [
          mk('res', 'R101', { r: 5e-3 }),
          mk('ind', 'L101', { L: 1e-6, dcr: 5.6e-3 }),
          mk('cap', 'Cf', { c: 4.7e-6, esr: 0, n: 8, derate: 33 }),
          mk('rc', 'Cd', { rd: 0, cd: 94e-6, esr: 0.195 }),
        ]
      ),
  },
  {
    name: 'LQRx 03 · LMR54410 1.1 MHz input',
    make: () =>
      baseState(
        'LQRx 03 buck',
        {
          vinMin: 9.39,
          vinNom: 12,
          vinMax: 24,
          pout: 9,
          eta: 0.85,
          vout: 9,
          fsw: 1.1e6,
          fcheck: 1.1e6,
        },
        {},
        [
          mk('res', 'R301', { r: 20e-3 }),
          mk('ind', 'L301', { L: 2.2e-6, dcr: 0.2 }),
          mk('cap', 'C303', { c: 4.7e-6, esr: 0, derate: 33 }),
          mk('cap', 'C304', { c: 0.1e-6, esr: 0 }),
          mk('rc', 'Cd', { rd: 0, cd: 22e-6, esr: 1 }),
        ]
      ),
  },
]

export const PRESET_NAMES = PRESETS.map((p) => p.name)
export const PRESET_COUNT = PRESETS.length

/** Build preset i, with its damping set to the optimum where it asks for it. */
export function buildPreset(i: number): Design {
  const p = PRESETS[i]
  let st = p.make()
  const opt =
    p.optimize === undefined ? [] : ([] as number[]).concat(p.optimize)
  for (const k of opt) {
    const b = st.blocks[k]
    const key = dampKey(b)
    if (!key) continue
    const val = optimizeParam(st, b.id, key, 1e-3, 1e3).val
    st = {
      ...st,
      blocks: st.blocks.map((x, j) => (j === k ? setParam(x, key, val) : x)),
    }
  }
  return st
}
