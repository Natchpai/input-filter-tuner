// Design state changes. Pure: new ids come in with the action.
import {
  type Block,
  CABLE_L_MAX,
  CABLE_R_MAX,
  type Conv,
  type Design,
  EMI_MARGIN_MAX,
  EMI_TR_MAX,
  type EmiSettings,
  MAX_BLOCK_NAME,
  MAX_NOTES,
  MAX_TOL,
  type PlotSettings,
  setParam,
  type Source,
  tabOf,
  type TolKey,
  type TranSettings,
} from '../engine'

export type Action =
  | { t: 'replace'; st: Design }
  | { t: 'conv'; k: keyof Conv; v: number }
  | { t: 'source'; k: keyof Source; v: number }
  | { t: 'plot'; patch: Partial<PlotSettings> }
  | { t: 'param'; id: string; k: string; v: number }
  | { t: 'tol'; id: string; k: TolKey; v: number }
  | { t: 'patch'; id: string; patch: Partial<Block> }
  | { t: 'move'; id: string; dir: -1 | 1 }
  | { t: 'dup'; id: string; newId: string }
  | { t: 'remove'; id: string }
  | { t: 'add'; block: Block }
  | { t: 'notes'; v: string }
  | { t: 'emi'; patch: Partial<EmiSettings> }
  | { t: 'tran'; patch: Partial<TranSettings> }

const mapBlock = (st: Design, id: string, fn: (b: Block) => Block): Design => ({
  ...st,
  blocks: st.blocks.map((b) => (b.id === id ? fn(b) : b)),
})

/** Set or clear one tolerance. Same state back when nothing changes. */
function setTol(st: Design, id: string, k: TolKey, v: number): Design {
  const b = st.blocks.find((x) => x.id === id)
  if (!b) return st
  const cur = (b.tol ?? {}) as Record<string, number>
  const set = Number.isFinite(v) && v > 0
  if (set ? cur[k] === Math.min(v, MAX_TOL) : !(k in cur)) return st
  const tol = { ...cur }
  if (set) tol[k] = Math.min(v, MAX_TOL)
  else delete tol[k]
  return mapBlock(st, id, (x) => {
    const { tol: _old, ...rest } = x
    return (Object.keys(tol).length ? { ...rest, tol } : rest) as Block
  })
}

/** st with its tab checked against the EMI and time-domain switches. */
function withTab(st: Design): Design {
  const tab = tabOf(st)
  return tab === st.plot.tab ? st : { ...st, plot: { ...st.plot, tab } }
}

export function reducer(st: Design, a: Action): Design {
  switch (a.t) {
    case 'replace':
      return a.st
    case 'conv':
      return { ...st, conv: { ...st.conv, [a.k]: a.v } }
    case 'source':
      return { ...st, source: { ...st.source, [a.k]: a.v } }
    case 'plot':
      return { ...st, plot: { ...st.plot, ...a.patch } }
    case 'param':
      return mapBlock(st, a.id, (b) => setParam(b, a.k, a.v))
    case 'tol':
      return setTol(st, a.id, a.k, a.v)
    case 'patch':
      return mapBlock(st, a.id, (b) => ({ ...b, ...a.patch }) as Block)
    case 'move': {
      const i = st.blocks.findIndex((b) => b.id === a.id),
        j = i + a.dir
      if (i < 0 || j < 0 || j >= st.blocks.length) return st
      const blocks = st.blocks.slice()
      ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
      return { ...st, blocks }
    }
    case 'dup': {
      const i = st.blocks.findIndex((b) => b.id === a.id)
      if (i < 0) return st
      const b = st.blocks[i]
      const blocks = st.blocks.slice()
      blocks.splice(i + 1, 0, {
        ...b,
        id: a.newId,
        name: (b.name + "'").slice(0, MAX_BLOCK_NAME),
      })
      return { ...st, blocks }
    }
    case 'remove':
      return { ...st, blocks: st.blocks.filter((b) => b.id !== a.id) }
    case 'add':
      return { ...st, blocks: [...st.blocks, a.block] }
    case 'notes':
      return { ...st, notes: a.v.slice(0, MAX_NOTES) }
    case 'emi': {
      const emi = { ...st.emi, ...a.patch }
      // Same limits as adopt(), so a reload gives back what was typed.
      emi.tr = Math.min(EMI_TR_MAX, Math.max(0, emi.tr))
      emi.margin = Math.min(EMI_MARGIN_MAX, Math.max(0, emi.margin))
      // Turning EMI off on the EMI tab goes back to the Zout tab.
      return withTab({ ...st, emi })
    }
    case 'tran': {
      const tran = { ...st.tran, ...a.patch }
      // Same limits as adopt(), so a reload gives back what was typed.
      tran.lCable = Math.min(CABLE_L_MAX, Math.max(0, tran.lCable))
      tran.rCable = Math.min(CABLE_R_MAX, Math.max(0, tran.rCable))
      // Turning it off on the Time domain tab goes back to the Zout tab.
      return withTab({ ...st, tran })
    }
  }
}
