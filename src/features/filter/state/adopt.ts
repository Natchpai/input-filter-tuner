// The only entry point for untrusted designs: links, JSON files and
// localStorage. Copies known fields only, as numbers within sane limits, and
// drops everything else. A new state field needs a line here.
import {
  BLOCK_TYPES,
  type Block,
  type BlockType,
  DAMP,
  type DampMode,
  type Design,
  type TabKey,
  TYPES,
} from '../engine'
import { baseState, mk } from './defaults'

export const TAB_KEYS: TabKey[] = ['zout', 'xfer', 'zin', 'tm', 'elem', 'sweep']

type Obj = Record<string, unknown>

const has = (o: unknown, k: string) =>
  !!o && Object.prototype.hasOwnProperty.call(o, k)
const isObj = (o: unknown): o is Obj => !!o && typeof o === 'object'

function num(v: unknown, def: number, lo = -Infinity, hi = Infinity) {
  const x = Number(v)
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def
}
const pos = (v: unknown, def: number) => {
  const x = Number(v)
  return Number.isFinite(x) && x > 0 ? x : def
}

export function adopt(obj: unknown): Design {
  if (!isObj(obj) || !Array.isArray(obj.blocks) || !isObj(obj.conv))
    throw new Error('not a filter design')
  const base = baseState(String(obj.name || 'Loaded').slice(0, 80), {}, {}, [])
  const cv = base.conv,
    oc = obj.conv
  for (const k of [
    'vinMin',
    'vinNom',
    'vinMax',
    'pout',
    'vout',
    'fsw',
    'fcheck',
  ] as const)
    cv[k] = pos(oc[k], cv[k])
  cv.eta = num(oc.eta, cv.eta, 0.3, 1)
  cv.phases = Math.round(num(oc.phases, cv.phases, 1, 8))
  cv.k = num(oc.k, cv.k, 0, 20)
  const os: Obj = isObj(obj.source) ? obj.source : {}
  base.source.R = num(os.R, 0, 0)
  base.source.L = num(os.L, 0, 0)
  const pl = base.plot,
    op: Obj = isObj(obj.plot) ? obj.plot : {}
  pl.fmin = pos(op.fmin, pl.fmin)
  pl.fmax = Math.max(pos(op.fmax, pl.fmax), pl.fmin * 10)
  pl.n = Math.round(num(op.n, pl.n, 100, 4000))
  pl.rload = pos(op.rload, pl.rload)
  pl.z0 = pos(op.z0, pl.z0)
  pl.dL = num(op.dL, pl.dL, -90, 90)
  pl.dC = num(op.dC, pl.dC, -90, 90)
  if (typeof op.undamped === 'boolean') pl.undamped = op.undamped
  if (typeof op.tol === 'boolean') pl.tol = op.tol
  if (op.xfer === 'H' || op.xfer === 'S21') pl.xfer = op.xfer
  if (op.load === 'open' || op.load === 'conv' || op.load === 'res')
    pl.load = op.load
  if (TAB_KEYS.includes(op.tab as TabKey)) pl.tab = op.tab as TabKey
  base.blocks = obj.blocks
    .filter(
      (b): b is Obj =>
        isObj(b) &&
        typeof b.type === 'string' &&
        BLOCK_TYPES.includes(b.type as BlockType) &&
        has(TYPES, b.type)
    )
    .map((b) => {
      const type = b.type as BlockType
      const T = TYPES[type]
      const n = mk(
        type,
        String(b.name ?? '').slice(0, 40) || T.prefix
      ) as unknown as Obj
      for (const p of T.p)
        n[p.key] = p.allowZero ? num(b[p.key], p.def, 0) : pos(b[p.key], p.def)
      if (type === 'cap') {
        n.n = Math.round(num(n.n, 1, 1, 50))
        n.derate = num(n.derate, 0, 0, 90)
      }
      n.on = b.on !== false
      if (type === 'ind') {
        n.dmode = has(DAMP, b.dmode as string) ? (b.dmode as DampMode) : 'none'
        n.dR = pos(b.dR, n.dR as number)
        n.dL = pos(b.dL, n.dL as number)
      }
      if (has(b, '_q')) n._q = pos(b._q, 0.707)
      return n as unknown as Block
    })
  return base
}
