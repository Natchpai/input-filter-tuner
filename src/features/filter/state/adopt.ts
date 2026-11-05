// The only entry point for untrusted designs: links, JSON files and
// localStorage. Copies known fields only, as numbers within sane limits, and
// drops everything else. A new state field needs a line here.
import {
  type AsstSettings,
  BLOCK_TYPES,
  clampAsst,
  type Block,
  CABLE_L_MAX,
  CABLE_R_MAX,
  type BlockType,
  type Curve,
  DAMP,
  EMI_MARGIN_MAX,
  EMI_STDS,
  EMI_TR_MAX,
  type DampMode,
  type Design,
  type BusConv,
  MAX_LOADS,
  MAX_BLOCK_NAME,
  MAX_NOTES,
  MAX_TOL,
  type TabKey,
  tabOf,
  TOL_KEYS,
  type TranView,
  TYPES,
} from '../engine'
import { ASST_DEFAULTS, baseState, mk, mkLoad } from './defaults'

export const TAB_KEYS: TabKey[] = [
  'zout',
  'xfer',
  'zin',
  'tm',
  'elem',
  'sweep',
  'emi',
  'time',
]

const TRAN_VIEWS: TranView[] = ['hot', 'step', 'ripple']

type Obj = Record<string, unknown>

const has = (o: unknown, k: string) =>
  !!o && Object.prototype.hasOwnProperty.call(o, k)
const isObj = (o: unknown): o is Obj => !!o && typeof o === 'object'

const scalar = (v: unknown) => typeof v === 'number' || typeof v === 'string'
/** A number from a number, string or boolean; NaN for anything else. */
const toNum = (v: unknown) =>
  scalar(v) || typeof v === 'boolean' ? Number(v) : NaN
/** A string from a string or number; '' for anything else. */
const toStr = (v: unknown) =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''

/** Design assistant inputs from untrusted data; bad fields get defaults. */
function asstOf(v: unknown): AsstSettings {
  const D = ASST_DEFAULTS
  const o: Obj = isObj(v) ? v : {}
  const n = (x: unknown, def: number) =>
    scalar(x) && x !== '' ? num(x, def) : def
  const stIn = (x: unknown, def: AsstSettings['st'][number]) => {
    const s: Obj = isObj(x) ? x : {}
    return {
      fix:
        s.fix === 'L'
          ? ('L' as const)
          : s.fix === 'C'
            ? ('C' as const)
            : def.fix,
      val: n(s.val, NaN),
      damp: toStr(s.damp) as AsstSettings['st'][number]['damp'],
    }
  }
  const st = Array.isArray(o.st) ? o.st : []
  const ser: Obj = isObj(o.ser) ? o.ser : {}
  const rngIn = (x: unknown) => {
    const r: Obj = isObj(x) ? x : {}
    return {
      lMin: n(r.lMin, 0),
      lMax: n(r.lMax, 0),
      cMin: n(r.cMin, 0),
      cMax: n(r.cMax, 0),
    }
  }
  const rng = Array.isArray(o.rng) ? o.rng : []
  return clampAsst(
    {
      on: o.on === true,
      stages: o.stages === 2 ? 2 : 1,
      target: o.target === 'emi' ? 'emi' : 'db',
      aDb: n(o.aDb, D.aDb),
      fa: n(o.fa, D.fa),
      split: n(o.split, D.split),
      rule: o.rule === 'leastCd' ? 'leastCd' : 'q',
      q: n(o.q, D.q),
      st: [stIn(st[0], D.st[0]), stIn(st[1], D.st[1])],
      ser: {
        L: toStr(ser.L) as AsstSettings['ser']['L'],
        C: toStr(ser.C) as AsstSettings['ser']['C'],
        R: toStr(ser.R) as AsstSettings['ser']['R'],
      },
      goal: toStr(o.goal) as AsstSettings['goal'],
      qPeak: n(o.qPeak, D.qPeak),
      eps: n(o.eps, D.eps),
      rng: [rngIn(rng[0]), rngIn(rng[1])],
      allForms: o.allForms === true,
    },
    D
  )
}

function num(v: unknown, def: number, lo = -Infinity, hi = Infinity) {
  const x = toNum(v)
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def
}
const pos = (v: unknown, def: number) => {
  const x = toNum(v)
  return Number.isFinite(x) && x > 0 ? x : def
}

/** Most blocks a design may hold. */
const MAX_BLOCKS = 64
/** Plot range limits, Hz. */
const F_MIN = 1e-3,
  F_MAX = 1e10

// Tolerances (tol). Only the keys listed in TOL_KEYS for the block type are
// read, each as a number or a non-empty string that gives a finite value > 0,
// clamped to MAX_TOL (± %). Anything else is dropped. No valid key: undefined.
function tolOf(
  v: unknown,
  type: BlockType
): Record<string, number> | undefined {
  if (!isObj(v) || Array.isArray(v)) return undefined
  const out: Record<string, number> = {}
  for (const k of TOL_KEYS[type] as readonly string[]) {
    if (!has(v, k)) continue
    const raw = v[k]
    if (!scalar(raw)) continue
    if (typeof raw === 'string' && raw.trim() === '') continue
    const x = Number(raw)
    if (Number.isFinite(x) && x > 0) out[k] = Math.min(MAX_TOL, x)
  }
  return Object.keys(out).length ? out : undefined
}

// Bias curves (cv, li). Reads at most CURVE_READ raw items and keeps at most
// CURVE_KEEP valid points. A point is [x, y] with x >= 0 and y > 0, given as
// a number or a string (nested arrays and objects are rejected). Sorted by x,
// duplicate x dropped (first one wins). No valid point: undefined.
const CURVE_READ = 256
const CURVE_KEEP = 64
function curve(v: unknown): Curve | undefined {
  if (!Array.isArray(v)) return undefined
  const pts: Curve = []
  const n = Math.min(v.length, CURVE_READ)
  for (let i = 0; i < n; i++) {
    const it: unknown = v[i]
    if (!Array.isArray(it) || it.length < 2) continue
    if (!scalar(it[0]) || !scalar(it[1])) continue
    if (typeof it[0] === 'string' && it[0].trim() === '') continue
    if (typeof it[1] === 'string' && it[1].trim() === '') continue
    const x = Number(it[0]),
      y = Number(it[1])
    if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y > 0)
      pts.push([x, y])
  }
  pts.sort((a, b) => a[0] - b[0])
  const out = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0])
  return out.length ? out.slice(0, CURVE_KEEP) : undefined
}

function loadOf(o: Obj, i: number, cv: Design['conv']): BusConv {
  const d = mkLoad(cv, '')
  for (const k of ['pout', 'vout', 'fsw', 'fcheck'] as const)
    d[k] = pos(o[k], d[k])
  d.eta = num(o.eta, d.eta, 0.3, 1)
  d.phases = Math.round(num(o.phases, d.phases, 1, 8))
  d.pLight = num(o.pLight, 0, 0)
  d.name = toStr(o.name).slice(0, MAX_BLOCK_NAME) || `Conv ${i + 2}`
  d.on = o.on !== false
  return d
}

export function adopt(obj: unknown): Design {
  if (!isObj(obj) || !Array.isArray(obj.blocks) || !isObj(obj.conv))
    throw new Error('not a filter design')
  const base = baseState((toStr(obj.name) || 'Loaded').slice(0, 80), {}, {}, [])
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
  // Light-load power: 0 or more. Kept as typed, like the reducer does; every
  // use clamps it to the full power (pBus, oppoint), Lessons 2 and 3.
  cv.pLight = num(oc.pLight, 0, 0)
  // Extra converters (M5): the same field rules as conv, new ids.
  if (Array.isArray(obj.loads))
    base.loads = obj.loads
      .filter(isObj)
      .slice(0, MAX_LOADS)
      .map((o, i) => loadOf(o, i, cv))
  const os: Obj = isObj(obj.source) ? obj.source : {}
  base.source.R = num(os.R, 0, 0)
  base.source.L = num(os.L, 0, 0)
  const pl = base.plot,
    op: Obj = isObj(obj.plot) ? obj.plot : {}
  pl.fmin = Math.min(Math.max(pos(op.fmin, pl.fmin), F_MIN), F_MAX / 10)
  pl.fmax = Math.min(Math.max(pos(op.fmax, pl.fmax), pl.fmin * 10), F_MAX)
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
  if (TRAN_VIEWS.includes(op.tview as TranView)) pl.tview = op.tview as TranView
  // EMI settings: enums by whitelist, the class checked against the standard.
  const em = base.emi,
    oe: Obj = isObj(obj.emi) ? obj.emi : {}
  if (oe.std === 'cispr25' || oe.std === 'cispr32') {
    const cl = EMI_STDS[oe.std].classes
    em.std = oe.std
    // An unknown class falls back to the strictest one (the last).
    // String() only on a scalar: an object's toString can throw (Lesson 7).
    const c = scalar(oe.cls) ? String(oe.cls) : ''
    em.cls = cl.includes(c) ? c : cl[cl.length - 1]
  }
  if (typeof oe.on === 'boolean') em.on = oe.on
  if (oe.lines === 1 || oe.lines === 2) em.lines = oe.lines
  if (scalar(oe.tr) && oe.tr !== '') em.tr = num(oe.tr, em.tr, 0, EMI_TR_MAX)
  if (scalar(oe.margin) && oe.margin !== '')
    em.margin = num(oe.margin, em.margin, 0, EMI_MARGIN_MAX)
  // Time-domain settings (M4).
  const tn = base.tran,
    ot: Obj = isObj(obj.tran) ? obj.tran : {}
  if (typeof ot.on === 'boolean') tn.on = ot.on
  if (scalar(ot.lCable) && ot.lCable !== '')
    tn.lCable = num(ot.lCable, tn.lCable, 0, CABLE_L_MAX)
  if (scalar(ot.rCable) && ot.rCable !== '')
    tn.rCable = num(ot.rCable, tn.rCable, 0, CABLE_R_MAX)
  // Design assistant inputs (M3): each field by type, then the shared limits.
  base.asst = asstOf(obj.asst)
  // The EMI and Time domain tabs exist only while their check is on.
  pl.tab = tabOf(base)
  if (typeof obj.notes === 'string' && obj.notes)
    base.notes = obj.notes.slice(0, MAX_NOTES)
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
        toStr(b.name).slice(0, MAX_BLOCK_NAME) || T.prefix
      ) as unknown as Obj
      for (const p of T.p)
        n[p.key] = p.allowZero ? num(b[p.key], p.def, 0) : pos(b[p.key], p.def)
      if (type === 'cap') {
        n.n = Math.round(num(n.n, 1, 1, 50))
        n.derate = num(n.derate, 0, 0, 90)
      }
      if (type === 'cap') {
        const c = curve(b.cv)
        if (c) n.cv = c
      }
      if (type === 'ind' || type === 'bead2' || type === 'bead4') {
        const c = curve(b.li)
        if (c) n.li = c
      }
      {
        const t = tolOf(b.tol, type)
        if (t) n.tol = t
      }
      n.on = b.on !== false
      if (type === 'ind') {
        n.dmode =
          typeof b.dmode === 'string' && has(DAMP, b.dmode)
            ? (b.dmode as DampMode)
            : 'none'
        n.dR = pos(b.dR, n.dR as number)
        n.dL = pos(b.dL, n.dL as number)
      }
      if (has(b, '_q')) n._q = pos(b._q, 0.707)
      return n as unknown as Block
    })
    .slice(0, MAX_BLOCKS)
  return base
}
