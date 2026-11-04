// Time domain (M4, docs/M4-plan.md): hot-plug, load step and the source
// ripple waveform.
//
// Solver: modified nodal analysis on the element graph of circuit.ts, fixed
// step, trapezoidal companion models. Unknowns are the node voltages and the
// branch currents of the source and of every inductor. After each
// discontinuity there is one tiny backward-Euler step (the t = 0+ point) and
// two backward-Euler half steps, as SPICE does, so stiff parasitic modes do
// not ring at the step rate. The converter is a constant-power load at the
// converter node, a rank-1 change of the matrix, solved by Newton with
// Sherman-Morrison so the LU is reused.
import { blockNet, Builder, type CircuitElement, el, ser } from './circuit'
import { abs } from './complex'
import { dutyOf, harmonicSigned } from './emi'
import { point } from './ladder'
import type { Design } from './model'
import { atCorner, type Corner } from './oppoint'
import { kindOf } from './types'

// ---------------------------------------------------------------- circuit

/** Largest cable L and R the inputs and adopt() accept. */
export const CABLE_L_MAX = 100e-6
export const CABLE_R_MAX = 10

export type TranCircuit = {
  /** Non-ground node names, in matrix order. */
  nodes: string[]
  /** Size of the system: nodes, then the source branch, then inductors. */
  size: number
  /** Index of the converter node, or -1 when it is ground. */
  out: number
  /** Row of the source branch current. */
  src: number
  res: { a: number; b: number; g: number }[]
  caps: { a: number; b: number; c: number }[]
  inds: { a: number; b: number; l: number; k: number }[]
  /** Source node index (−1 if ground). */
  vs: number
  /** Node each ON shunt block hangs from, for its peak voltage. */
  shunts: { id: string; name: string; node: number }[]
}

/** Conductance from every node to ground, so no node floats. */
const GMIN = 1e-12
/** Series resistance of every inductor branch, so L-only loops solve at DC. */
const RL_MIN = 1e-9

/** The design as a circuit: source behind Rsrc + Lsrc, blocks, converter. */
export function buildTran(st: Design): TranCircuit {
  const bld = new Builder('t_', 't_out')
  const vsName = 't_vs'
  bld.add({ name: 'V_t_src', kind: 'V', a: vsName, b: '0', value: 0 })
  let rail = bld.node()
  bld.place(
    ser(el('R', 'R', st.source.R), el('L', 'L', st.source.L)),
    vsName,
    rail,
    'src'
  )
  const shuntRail: { id: string; name: string; rail: string }[] = []
  st.blocks.forEach((b, i) => {
    if (!b.on) return
    const net = blockNet(b)
    if (kindOf(b) === 'series') {
      const next = bld.node()
      bld.place(net, rail, next, `b${i}`)
      rail = next
    } else {
      bld.place(net, rail, '0', `b${i}`)
      shuntRail.push({ id: b.id, name: b.name, rail })
    }
  })
  bld.join(rail, 't_out')
  const copy = bld.done()
  const name = (n: string) => bld.nodeName(n)
  const els: CircuitElement[] = copy.elements
  const nodes: string[] = []
  const idx = new Map<string, number>()
  const at = (n: string) => {
    if (n === '0') return -1
    let k = idx.get(n)
    if (k === undefined) {
      k = nodes.length
      idx.set(n, k)
      nodes.push(n)
    }
    return k
  }
  // Every node first, so branch rows come after them.
  for (const e of els) {
    at(e.a)
    at(e.b)
  }
  const outName = name('t_out')
  const vsNode = name(vsName)
  const out = at(outName)
  const vs = at(vsNode)
  let row = nodes.length
  const src = row++
  const res: TranCircuit['res'] = []
  const caps: TranCircuit['caps'] = []
  const inds: TranCircuit['inds'] = []
  for (const e of els) {
    const a = at(e.a),
      b = at(e.b)
    if (e.kind === 'R') res.push({ a, b, g: 1 / e.value })
    else if (e.kind === 'C') caps.push({ a, b, c: e.value })
    else if (e.kind === 'L') inds.push({ a, b, l: e.value, k: row++ })
  }
  return {
    nodes,
    size: row,
    out,
    src,
    res,
    caps,
    inds,
    vs,
    shunts: shuntRail.map((s) => ({
      id: s.id,
      name: s.name,
      node: at(name(s.rail)),
    })),
  }
}

// ------------------------------------------------------------ linear algebra

type Lu = { a: Float64Array; piv: Int32Array; n: number }

/** LU with partial pivoting, in place on a copy. */
function lu(m: Float64Array, n: number): Lu {
  const a = Float64Array.from(m)
  const piv = new Int32Array(n)
  for (let k = 0; k < n; k++) {
    let p = k,
      big = Math.abs(a[k * n + k])
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(a[i * n + k])
      if (v > big) {
        big = v
        p = i
      }
    }
    if (!(big > 1e-300)) throw new Error('time domain: singular circuit')
    piv[k] = p
    if (p !== k)
      for (let j = 0; j < n; j++) {
        const t = a[k * n + j]
        a[k * n + j] = a[p * n + j]
        a[p * n + j] = t
      }
    const d = a[k * n + k]
    for (let i = k + 1; i < n; i++) {
      const f = (a[i * n + k] /= d)
      if (f !== 0)
        for (let j = k + 1; j < n; j++) a[i * n + j] -= f * a[k * n + j]
    }
  }
  return { a, piv, n }
}

/** Solves in place: b becomes x. */
function luSolve(f: Lu, b: Float64Array): Float64Array {
  const { a, piv, n } = f
  for (let k = 0; k < n; k++) {
    const p = piv[k]
    if (p !== k) {
      const t = b[k]
      b[k] = b[p]
      b[p] = t
    }
  }
  for (let i = 1; i < n; i++) {
    let s = b[i]
    for (let j = 0; j < i; j++) s -= a[i * n + j] * b[j]
    b[i] = s
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]
    for (let j = i + 1; j < n; j++) s -= a[i * n + j] * b[j]
    b[i] = s / a[i * n + i]
  }
  return b
}

/**
 * System matrix with companion factor kf: a capacitor is the conductance
 * C·kf, an inductor branch has v − L·kf·i on its row. kf = 2/h is a
 * trapezoidal step h or a backward-Euler step h/2; kf = 0 is DC.
 */
function matrix(c: TranCircuit, kf: number): Float64Array {
  const n = c.size
  const m = new Float64Array(n * n)
  const g = (i: number, j: number, v: number) => {
    if (i >= 0 && j >= 0) m[i * n + j] += v
  }
  const two = (a: number, b: number, v: number) => {
    g(a, a, v)
    g(b, b, v)
    g(a, b, -v)
    g(b, a, -v)
  }
  for (let i = 0; i < c.nodes.length; i++) g(i, i, GMIN)
  for (const r of c.res) two(r.a, r.b, r.g)
  for (const q of c.caps) two(q.a, q.b, q.c * kf)
  const branch = (a: number, b: number, k: number, r: number) => {
    // KCL: the branch current leaves a and enters b.
    g(a, k, 1)
    g(b, k, -1)
    // Row: Va − Vb − r·i = rhs.
    g(k, a, 1)
    g(k, b, -1)
    m[k * n + k] -= r
  }
  branch(c.vs, -1, c.src, 0)
  for (const l of c.inds) branch(l.a, l.b, l.k, l.l * kf + RL_MIN)
  return m
}

// ---------------------------------------------------------------- stepping

/** Converter current at time t and node voltage v: [I, dI/dV]. */
export type Load = (t: number, v: number) => [number, number]

/** Constant-power load I = p/(eta·max(v, vClamp)). `p()` is read each step. */
export function cpl(p: () => number, eta: number, vClamp: number): Load {
  return (_t, v) => {
    const P = p()
    if (P === 0) return [0, 0]
    if (v <= vClamp) return [P / (eta * vClamp), 0]
    return [P / (eta * v), -P / (eta * v * v)]
  }
}

const vAt = (x: Float64Array, i: number) => (i < 0 ? 0 : x[i])

/**
 * Adds the converter load at node o to y = A⁻¹·b and writes the solution to
 * x. z = A⁻¹·e_o. Newton on the node voltage alone, since the load is a
 * rank-1 change A + g·e_o·e_oᵀ: with u = y + w·z, x_o = u_o/(1 + g·z_o),
 * then x = u − g·x_o·z (Sherman-Morrison). Returns the load current.
 */
function addLoad(
  y: Float64Array,
  z: Float64Array,
  o: number,
  load: Load,
  t: number,
  vStart: number,
  x: Float64Array
): number {
  let v0 = vStart
  for (let it = 0; it < 50; it++) {
    const [I, g] = load(t, v0)
    const v1 = (y[o] - (I - g * v0) * z[o]) / (1 + g * z[o])
    const done = Math.abs(v1 - v0) <= 1e-12 * (Math.abs(v0) + 1)
    v0 = v1
    if (done) break
  }
  const [I, g] = load(t, v0)
  const w = -(I - g * v0)
  const xo = (y[o] + w * z[o]) / (1 + g * z[o])
  for (let i = 0; i < y.length; i++) x[i] = y[i] + (w - g * xo) * z[i]
  return I + g * (xo - v0)
}

type Mat = { f: Lu; z: Float64Array | null; kf: number }

/**
 * Fixed-step transient run. `x` holds node voltages and branch currents.
 * Call restart() at a discontinuity (source or load step); the next step()
 * then returns the t = 0+ point at the same time, and the step after it uses
 * two backward-Euler half steps.
 */
export class Sim {
  readonly x: Float64Array
  /** Capacitor currents (trapezoidal history). */
  private ic: Float64Array
  t = 0
  /** Converter current of the last step, A. */
  iLoad = 0
  private main: Mat
  private tiny: Mat
  private phase: 'edge' | 'be' | 'trap' = 'edge'
  private b: Float64Array

  constructor(
    readonly c: TranCircuit,
    readonly h: number,
    readonly vs: (t: number) => number,
    readonly load: Load | null,
    x0?: Float64Array
  ) {
    this.x = x0 ? Float64Array.from(x0) : new Float64Array(c.size)
    this.ic = new Float64Array(c.caps.length)
    this.b = new Float64Array(c.size)
    this.main = this.mat(2 / h)
    this.tiny = this.mat(1 / (h * 1e-6))
  }

  private mat(kf: number): Mat {
    const f = lu(matrix(this.c, kf), this.c.size)
    let z: Float64Array | null = null
    if (this.c.out >= 0 && this.load) {
      z = new Float64Array(this.c.size)
      z[this.c.out] = 1
      luSolve(f, z)
    }
    return { f, z, kf }
  }

  restart() {
    this.phase = 'edge'
  }

  vOut() {
    return vAt(this.x, this.c.out)
  }

  /** Current delivered by the source, A. */
  iSrc() {
    return -this.x[this.c.src]
  }

  /** One output sample: the 0+ point after a restart, else t + h. */
  step() {
    if (this.phase === 'edge') {
      this.advance(this.tiny, false, this.t)
      this.phase = 'be'
      return
    }
    if (this.phase === 'be') {
      this.advance(this.main, false, this.t + this.h / 2)
      this.advance(this.main, false, this.t + this.h)
      this.phase = 'trap'
    } else this.advance(this.main, true, this.t + this.h)
    this.t += this.h
  }

  private advance(m: Mat, trap: boolean, tNew: number) {
    const { c, x, ic, b } = this
    b.fill(0)
    const caps = c.caps
    for (let j = 0; j < caps.length; j++) {
      const q = caps[j]
      const geq = q.c * m.kf
      const ieq = geq * (vAt(x, q.a) - vAt(x, q.b)) + (trap ? ic[j] : 0)
      if (q.a >= 0) b[q.a] += ieq
      if (q.b >= 0) b[q.b] -= ieq
      ic[j] = ieq // kept for the update below
    }
    for (const l of c.inds) {
      const req = l.l * m.kf
      b[l.k] = -req * x[l.k] - (trap ? vAt(x, l.a) - vAt(x, l.b) : 0)
    }
    b[c.src] = this.vs(tNew)
    luSolve(m.f, b) // b is now y = A⁻¹·b_lin
    const o = c.out
    if (o >= 0 && this.load && m.z) {
      this.iLoad = addLoad(b, m.z, o, this.load, tNew, x[o], x)
    } else {
      x.set(b)
      this.iLoad = 0
    }
    for (let j = 0; j < caps.length; j++) {
      const q = caps[j]
      ic[j] = q.c * m.kf * (vAt(x, q.a) - vAt(x, q.b)) - ic[j]
    }
  }
}

/** DC operating point with source vin and the given load. */
export function dcPoint(
  c: TranCircuit,
  vin: number,
  load: Load | null
): Float64Array {
  const f = lu(matrix(c, 0), c.size)
  const b = new Float64Array(c.size)
  b[c.src] = vin
  luSolve(f, b)
  const o = c.out
  if (o < 0 || !load) return b
  const z = new Float64Array(c.size)
  z[o] = 1
  luSolve(f, z)
  const x = new Float64Array(c.size)
  addLoad(b, z, o, load, 0, b[o], x)
  return x
}

// ------------------------------------------------------------- time scale

/**
 * Frequencies that set the step and the shortest run: the resonance peaks of
 * |Hopen| and |Zout| between 10 Hz and 20·fsw that reach 0.3 of the largest
 * peak of their curve. With no peak, the −3 dB corner of Hopen; with none of
 * those, fsw.
 */
export function timeScale(st: Design): { fLo: number; fHi: number } {
  const fA = 10,
    fB = 20 * st.conv.fsw
  const n = Math.max(50, Math.ceil(100 * Math.log10(fB / fA)))
  const f: number[] = [],
    h: number[] = [],
    z: number[] = []
  for (let i = 0; i < n; i++) {
    const fi = fA * (fB / fA) ** (i / (n - 1))
    const p = point(st, fi)
    f.push(fi)
    h.push(abs(p.Hopen))
    z.push(abs(p.Zout))
  }
  const peaks: number[] = []
  for (const y of [h, z]) {
    const loc: number[] = []
    for (let i = 1; i < n - 1; i++)
      if (y[i] > y[i - 1] && y[i] >= y[i + 1]) loc.push(i)
    const top = Math.max(0, ...loc.map((i) => y[i]))
    for (const i of loc) if (y[i] >= 0.3 * top) peaks.push(f[i])
  }
  if (peaks.length === 0) {
    const k = h.findIndex((v) => v < h[0] / Math.SQRT2)
    if (k > 0) peaks.push(f[k])
  }
  if (peaks.length === 0) peaks.push(st.conv.fsw)
  return { fLo: Math.min(...peaks), fHi: Math.max(...peaks) }
}

/** Steps per period of the highest resonance, first try. */
const PER_PERIOD = 100
/** Step halving stops when the peaks agree within this, or at MAX_PER. */
const STEP_TOL = 1e-3
const MAX_PER = 1600
/** Longest run per segment, steps. */
export const MAX_STEPS = 200_000
/** Settled: within this share of the peak deviation for MIN_PERIODS of fLo. */
const SETTLE = 0.01
const MIN_PERIODS = 3

export type TranStatus = 'settled' | 'slow' | 'unstable'

/** Waveform for the plot: time, converter-node voltage, a current. */
export type Wave = { t: number[]; v: number[]; i: number[] }

/** Running record of one run, with the settle check. */
class Trace {
  t: number[] = []
  v: number[] = []
  i: number[] = []
  add(t: number, v: number, i: number) {
    this.t.push(t)
    this.v.push(v)
    this.i.push(i)
  }
}

/**
 * Runs `sim` until v and iSrc stay within SETTLE of their peak deviation
 * from (vF, iF) for MIN_PERIODS/fLo, or MAX_STEPS. Records every sample.
 */
function runToSettle(
  sim: Sim,
  tr: Trace,
  vF: number,
  iF: number,
  fLo: number,
  vin: number,
  cur: () => number
): { status: TranStatus; tSettle: number } {
  const t0 = sim.t
  const hold = MIN_PERIODS / fLo
  let pv = 0,
    pi = 0,
    lastBig = t0,
    lastBigV = t0
  const winV: number[] = [] // |dev v| at each step, for the growth check
  for (let k = 0; k <= MAX_STEPS; k++) {
    sim.step()
    const v = sim.vOut(),
      i = sim.iSrc()
    tr.add(sim.t, v, cur())
    if (!Number.isFinite(v) || Math.abs(v) > 4 * vin)
      return { status: 'unstable', tSettle: NaN }
    const dv = Math.abs(v - vF),
      di = Math.abs(i - iF)
    winV.push(dv)
    pv = Math.max(pv, dv)
    pi = Math.max(pi, di)
    if (dv > SETTLE * pv) lastBigV = sim.t
    if (dv > SETTLE * pv || di > SETTLE * pi) lastBig = sim.t
    if (sim.t - lastBig >= hold && sim.t - t0 >= hold)
      return { status: 'settled', tSettle: lastBigV - t0 }
  }
  // Not settled: growing or sustained if the last window still swings at
  // half the peak.
  const nWin = Math.max(1, Math.round(hold / sim.h))
  const last = Math.max(...winV.slice(-nWin))
  return { status: last >= 0.5 * pv ? 'unstable' : 'slow', tSettle: NaN }
}

/** Peak of samples y around index k, refined by a parabola through 3 points. */
function refine(t: number[], y: number[], k: number): { t: number; y: number } {
  if (k <= 0 || k >= y.length - 1) return { t: t[k], y: y[k] }
  const h1 = t[k] - t[k - 1],
    h2 = t[k + 1] - t[k]
  if (!(h1 > 0) || Math.abs(h1 - h2) > 1e-9 * h1) return { t: t[k], y: y[k] }
  const a = y[k - 1],
    b = y[k],
    c = y[k + 1]
  const den = a - 2 * b + c
  if (den === 0) return { t: t[k], y: b }
  const d = (0.5 * (a - c)) / den
  if (Math.abs(d) > 1) return { t: t[k], y: b }
  return { t: t[k] + d * h1, y: b - 0.25 * (a - c) * d }
}

function argMax(y: number[], from = 0, to = y.length): number {
  let k = from
  for (let i = from + 1; i < to; i++) if (y[i] > y[k]) k = i
  return k
}
function argMin(y: number[], from = 0, to = y.length): number {
  let k = from
  for (let i = from + 1; i < to; i++) if (y[i] < y[k]) k = i
  return k
}

/**
 * At most `max` buckets, each keeping its first and last sample and the
 * min and max of v and i, so steps and peaks survive.
 */
export function decimate(w: Wave, max = 1500): Wave {
  const n = w.t.length
  if (n <= 3 * max) return { t: [...w.t], v: [...w.v], i: [...w.i] }
  const out: Wave = { t: [], v: [], i: [] }
  const per = n / max
  for (let b = 0; b < max; b++) {
    const lo = Math.floor(b * per),
      hi = Math.min(n, Math.floor((b + 1) * per))
    const keep = new Set([lo, hi - 1, argMin(w.v, lo, hi), argMax(w.v, lo, hi)])
    keep.add(argMin(w.i, lo, hi))
    keep.add(argMax(w.i, lo, hi))
    for (const k of [...keep].sort((a, c) => a - c)) {
      out.t.push(w.t[k])
      out.v.push(w.v[k])
      out.i.push(w.i[k])
    }
  }
  return out
}

/** Unique Vin corners, low to high. */
function vins(st: Design): number[] {
  const c = st.conv
  return [...new Set([c.vinMin, c.vinNom, c.vinMax])].sort((a, b) => a - b)
}

const cornerOf = (vin: number, p: number, eta: number): Corner => ({
  vin,
  pLoad: p,
  i: p / (eta * vin),
  label: `${vin} V`,
})

// --------------------------------------------------------------- hot-plug

export type HotPlugRow = {
  vin: number
  /** Peak converter-node voltage, V, and when, s. */
  vPeak: number
  tPeak: number
  /** (vPeak − vin)/vin, %. */
  overshoot: number
  /**
   * Peak source current, A. Null when Lsrc = 0: with no cable inductance
   * the current at the step is set by parasitic spikes (ESL, Cb, Cp) that
   * the step does not resolve.
   */
  iPeak: number | null
  tIPeak: number
  /** ∫ i² dt of the source current over the run, A²s; null when Lsrc = 0. */
  i2t: number | null
  /** Peak voltage of the node each shunt block hangs from. */
  nodePeaks: { id: string; name: string; v: number }[]
  status: TranStatus
  /** Step, s, and steps per period of the highest resonance. */
  dt: number
  per: number
  wave: Wave
}

/** Design copy with the hot-plug cable added after Rsrc + Lsrc. */
export function withCable(st: Design): Design {
  const t = st.tran
  return {
    ...st,
    source: { R: st.source.R + t.rCable, L: st.source.L + t.lCable },
  }
}

/**
 * Hot-plug at one Vin: ideal step through Rsrc + Lsrc and the cable,
 * converter open.
 */
export function hotPlugRun(
  st: Design,
  vin: number,
  perPeriod = PER_PERIOD
): HotPlugRow {
  const d = withCable(atCorner(st, cornerOf(vin, 0, st.conv.eta)))
  const c = buildTran(d)
  const { fLo, fHi } = timeScale(d)
  const dt = 1 / (perPeriod * fHi)
  const sim = new Sim(c, dt, () => vin, null)
  const tr = new Trace()
  tr.add(0, 0, 0)
  const peaks = c.shunts.map(() => 0)
  // Shunt peaks are tracked on every sample through the current() hook.
  const cur = () => {
    c.shunts.forEach((s, k) => {
      peaks[k] = Math.max(peaks[k], vAt(sim.x, s.node))
    })
    return sim.iSrc()
  }
  const { status } = runToSettle(sim, tr, vin, 0, fLo, vin, cur)
  const cable = d.source.L > 0
  const kv = argMax(tr.v)
  const pv = refine(tr.t, tr.v, kv)
  const ki = argMax(tr.i)
  const pi = refine(tr.t, tr.i, ki)
  let i2t = 0
  for (let k = 1; k < tr.t.length; k++)
    i2t += ((tr.i[k] ** 2 + tr.i[k - 1] ** 2) / 2) * (tr.t[k] - tr.t[k - 1])
  return {
    vin,
    vPeak: pv.y,
    tPeak: pv.t,
    overshoot: (100 * (pv.y - vin)) / vin,
    iPeak: cable ? pi.y : null,
    tIPeak: pi.t,
    i2t: cable ? i2t : null,
    nodePeaks: c.shunts.map((s, k) => ({
      id: s.id,
      name: s.name,
      v: peaks[k],
    })),
    status,
    dt,
    per: perPeriod,
    wave: decimate(tr),
  }
}

// --------------------------------------------------------------- load step

export type LoadStepRow = {
  vin: number
  /** DC converter-node voltage at light and full load, V. */
  vLight: number
  vFull: number
  /** Lowest voltage after the step up, V, and the dip vLight − vMin. */
  vMin: number
  droop: number
  /** Highest voltage after the step down, V, and the rise vMax − vFull. */
  vMax: number
  rise: number
  /** Ringing frequency after the step up, Hz; null if it does not ring. */
  fRing: number | null
  /** Time to stay within 1 % of the peak deviation, s; NaN if not settled. */
  settleUp: number
  settleDown: number
  /** Time of the step down, s (the step up is at 0). */
  tDown: number
  status: TranStatus
  /** Step, s, and steps per period of the highest resonance. */
  dt: number
  per: number
  /** v = converter-node voltage, i = converter current. */
  wave: Wave
}

/** Ringing frequency from the upward zero crossings of v − vF. */
function ringFreq(
  t: number[],
  v: number[],
  vF: number,
  from: number,
  to: number
): number | null {
  const cr: number[] = []
  for (let k = from + 1; k < to; k++) {
    const a = v[k - 1] - vF,
      b = v[k] - vF
    if (a < 0 && b >= 0) cr.push(t[k - 1] + ((t[k] - t[k - 1]) * -a) / (b - a))
  }
  if (cr.length < 2) return null
  return (cr.length - 1) / (cr[cr.length - 1] - cr[0])
}

const STATUS_RANK: Record<TranStatus, number> = {
  settled: 0,
  slow: 1,
  unstable: 2,
}

/** Load step at one Vin: P_light → P_full at t = 0, back once settled. */
export function loadStepRun(
  st: Design,
  vin: number,
  perPeriod = PER_PERIOD
): LoadStepRow {
  const cv = st.conv
  const pFull = cv.pout
  const pLight = Math.min(Math.max(0, cv.pLight), pFull)
  const d = atCorner(st, cornerOf(vin, pFull, cv.eta))
  const c = buildTran(d)
  const { fLo, fHi } = timeScale(d)
  const dt = 1 / (perPeriod * fHi)
  let p = pLight
  const load = cpl(() => p, cv.eta, 0.5 * vin)
  const x0 = dcPoint(c, vin, load)
  const vLight = vAt(x0, c.out)
  p = pFull
  const vFull = vAt(dcPoint(c, vin, load), c.out)
  const iFull = pFull / (cv.eta * Math.max(vFull, 0.5 * vin))
  p = pLight
  const sim = new Sim(c, dt, () => vin, load, x0)
  const tr = new Trace()
  const iL0 = load(0, vLight)[0]
  const cur = () => sim.iLoad
  // Step up at t = 0.
  p = pFull
  sim.restart()
  tr.add(0, vLight, iL0)
  const up = runToSettle(sim, tr, vFull, iFull, fLo, vin, cur)
  const nUp = tr.t.length
  const tDown = sim.t
  let down: { status: TranStatus; tSettle: number } = {
    status: up.status,
    tSettle: NaN,
  }
  if (up.status !== 'unstable') {
    p = pLight
    sim.restart()
    const iLight = pLight / (cv.eta * Math.max(vLight, 0.5 * vin))
    down = runToSettle(sim, tr, vLight, iLight, fLo, vin, cur)
  }
  const kMin = argMin(tr.v, 0, nUp)
  const pMin = refine(tr.t, tr.v, kMin)
  const kMax = nUp < tr.t.length ? argMax(tr.v, nUp) : -1
  const vMax = kMax >= 0 ? refine(tr.t, tr.v, kMax).y : vFull
  // A short flat lead-in before the step, kept out of the thinning so the
  // 0− sample stays next to it.
  const pre = -0.1 * Math.max(tDown, dt)
  const dec = decimate(tr)
  const wave: Wave = {
    t: [pre, ...dec.t],
    v: [vLight, ...dec.v],
    i: [iL0, ...dec.i],
  }
  const status =
    STATUS_RANK[down.status] > STATUS_RANK[up.status] ? down.status : up.status
  return {
    vin,
    vLight,
    vFull,
    vMin: pMin.y,
    droop: vLight - pMin.y,
    vMax,
    rise: kMax >= 0 ? vMax - vFull : 0,
    fRing: ringFreq(tr.t, tr.v, vFull, 0, nUp),
    settleUp: up.tSettle,
    settleDown: down.tSettle,
    tDown,
    status,
    dt,
    per: perPeriod,
    wave,
  }
}

const close = (a: number, b: number, floor: number) =>
  Math.abs(a - b) <= STEP_TOL * Math.max(Math.abs(b), floor)

/**
 * Runs at dt and dt/2, halving until the results agree within STEP_TOL.
 * Overdamped fast poles do not show as resonance peaks in timeScale(), so
 * the step is checked on every run. Returns the finer run.
 */
function converge<R extends { status: TranStatus }>(
  run: (perPeriod: number) => R,
  same: (a: R, b: R) => boolean
): R {
  let per = PER_PERIOD
  let a = run(per)
  for (;;) {
    per *= 2
    const b = run(per)
    if (b.status === 'unstable' || same(a, b) || per >= MAX_PER) return b
    a = b
  }
}

/** Hot-plug at one Vin, with the step size checked. */
export function hotPlugAt(st: Design, vin: number): HotPlugRow {
  return converge(
    (p) => hotPlugRun(st, vin, p),
    (a, b) =>
      close(a.vPeak, b.vPeak, 0) &&
      (a.iPeak === null || b.iPeak === null || close(a.iPeak, b.iPeak, 0))
  )
}

/** Load step at one Vin, with the step size checked. */
export function loadStepAt(st: Design, vin: number): LoadStepRow {
  const floor = 1e-3 * vin
  return converge(
    (p) => loadStepRun(st, vin, p),
    (a, b) => close(a.droop, b.droop, floor) && close(a.rise, b.rise, floor)
  )
}

// ------------------------------------------------------------ ripple

export type RippleWave = {
  vin: number
  /** Time over 3 switching periods, s. */
  t: number[]
  /** Converter input current (the trapezoids) and source current, A. */
  iConv: number[]
  iSrc: number[]
  /** Source current peak to peak, A. */
  pp: number
}

/** Periods shown, samples per period, highest harmonic frequency. */
const RIP_PERIODS = 3
const RIP_SAMPLES = 400
const RIP_FMAX = 100e6

/**
 * Steady-state source current at Vin nom and full load by Fourier synthesis:
 * i_src(t) = I_dc + Σ c_n·Re(Hopen(n·fsw)·e^{jnωt}). The converter current
 * is the same sum with Hopen = 1. Edge time is emi.tr.
 */
export function rippleWave(st: Design): RippleWave {
  const cv = st.conv
  const vin = cv.vinNom
  const d = atCorner(st, cornerOf(vin, cv.pout, cv.eta))
  const { D, io, N } = dutyOf(d.conv)
  const fsw = cv.fsw
  const tr = Math.max(0, st.emi.tr)
  const terms: { n: number; c: number; re: number; im: number }[] = []
  const nMax = Math.max(N, Math.min(20000, Math.floor(RIP_FMAX / fsw)))
  for (let n = N; n <= nMax; n += N) {
    const c = harmonicSigned(d.conv, tr, n)
    if (c === 0) continue
    const h = point(d, n * fsw).Hopen
    terms.push({ n, c, re: h.re, im: h.im })
  }
  const idc = io * D
  const T = 1 / fsw
  const m = RIP_PERIODS * RIP_SAMPLES
  const t: number[] = [],
    iConv: number[] = [],
    iSrc: number[] = []
  for (let k = 0; k <= m; k++) {
    const tk = (k / RIP_SAMPLES) * T
    let a = idc,
      s = idc
    for (const q of terms) {
      const ph = 2 * Math.PI * q.n * fsw * tk
      const co = Math.cos(ph),
        si = Math.sin(ph)
      a += q.c * co
      s += q.c * (q.re * co - q.im * si)
    }
    t.push(tk)
    iConv.push(a)
    iSrc.push(s)
  }
  return {
    vin,
    t,
    iConv,
    iSrc,
    pp: Math.max(...iSrc) - Math.min(...iSrc),
  }
}

// ------------------------------------------------------------ result

export type TranResult = {
  hot: HotPlugRow[]
  /** Index of the highest vPeak. */
  hotWorst: number
  step: LoadStepRow[]
  /** Index of the lowest vMin. */
  stepWorst: number
  ripple: RippleWave
}

export function tranResult(st: Design): TranResult {
  const v = vins(st)
  const hot = v.map((x) => hotPlugAt(st, x))
  const step = v.map((x) => loadStepAt(st, x))
  let hotWorst = 0,
    stepWorst = 0
  hot.forEach((r, k) => {
    if (r.vPeak > hot[hotWorst].vPeak) hotWorst = k
  })
  step.forEach((r, k) => {
    if (r.vMin < step[stepWorst].vMin) stepWorst = k
  })
  return { hot, hotWorst, step, stepWorst, ripple: rippleWave(st) }
}
