// Design state changes. Pure: new ids come in with the action.
import {
  type Block,
  type Conv,
  type Design,
  MAX_NOTES,
  type PlotSettings,
  setParam,
  type Source,
} from '../engine'

export type Action =
  | { t: 'replace'; st: Design }
  | { t: 'conv'; k: keyof Conv; v: number }
  | { t: 'source'; k: keyof Source; v: number }
  | { t: 'plot'; patch: Partial<PlotSettings> }
  | { t: 'param'; id: string; k: string; v: number }
  | { t: 'patch'; id: string; patch: Partial<Block> }
  | { t: 'move'; id: string; dir: -1 | 1 }
  | { t: 'dup'; id: string; newId: string }
  | { t: 'remove'; id: string }
  | { t: 'add'; block: Block }
  | { t: 'notes'; v: string }

const mapBlock = (st: Design, id: string, fn: (b: Block) => Block): Design => ({
  ...st,
  blocks: st.blocks.map((b) => (b.id === id ? fn(b) : b)),
})

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
      blocks.splice(i + 1, 0, { ...b, id: a.newId, name: b.name + "'" })
      return { ...st, blocks }
    }
    case 'remove':
      return { ...st, blocks: st.blocks.filter((b) => b.id !== a.id) }
    case 'add':
      return { ...st, blocks: [...st.blocks, a.block] }
    case 'notes':
      return { ...st, notes: a.v.slice(0, MAX_NOTES) }
  }
}
