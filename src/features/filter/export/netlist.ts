// SPICE netlist export: the filter as a .cir file with two copies, one for H
// and one for Zout. Pure, no DOM access. The mapping follows zBlock in
// engine/ladder.ts element for element.
import { type Block, type Design, effC, kindOf, rnOf } from '../engine'

export type SpiceKind = 'R' | 'L' | 'C' | 'I' | 'V'

export type SpiceElement = {
  name: string
  kind: SpiceKind
  a: string
  b: string
  /** R in Ω, L in H, C in F; the DC value (0) for V and I. */
  value: number
  /** AC magnitude of a V or I source. */
  ac?: number
}

/** One copy of the filter and the node that holds the result. */
export type SpiceCopy = { elements: SpiceElement[]; out: string }

// A two-terminal network, built from a block before it is placed.
type Net =
  | { t: 'short' }
  | { t: 'open' }
  | { t: 'el'; kind: 'R' | 'L' | 'C'; part: string; v: number }
  | { t: 'ser' | 'par'; parts: Net[] }

const SHORT: Net = { t: 'short' }
const OPEN: Net = { t: 'open' }

/** R or L of 0 is a short, C of 0 (or a bad number) is left out. */
function el(kind: 'R' | 'L' | 'C', part: string, v: number): Net {
  if (!Number.isFinite(v)) return OPEN
  if (v === 0) return kind === 'C' ? OPEN : SHORT
  return { t: 'el', kind, part, v }
}

function ser(...parts: Net[]): Net {
  const keep: Net[] = []
  for (const p of parts) {
    if (p.t === 'open') return OPEN
    if (p.t === 'short') continue
    if (p.t === 'ser') keep.push(...p.parts)
    else keep.push(p)
  }
  if (keep.length === 0) return SHORT
  return keep.length === 1 ? keep[0] : { t: 'ser', parts: keep }
}

function par(...parts: Net[]): Net {
  const keep: Net[] = []
  for (const p of parts) {
    if (p.t === 'short') return SHORT
    if (p.t === 'open') continue
    if (p.t === 'par') keep.push(...p.parts)
    else keep.push(p)
  }
  if (keep.length === 0) return OPEN
  return keep.length === 1 ? keep[0] : { t: 'par', parts: keep }
}

/** The block as a network. Same terms as zBlock (scale 1). */
function blockNet(b: Block): Net {
  switch (b.type) {
    case 'ind': {
      const core = par(
        ser(el('R', 'dcr', b.dcr), el('L', 'L', b.L)),
        b.cp > 0 ? el('C', 'cp', b.cp) : OPEN
      )
      if (b.dmode === 'R') return par(core, el('R', 'dR', b.dR))
      if (b.dmode === 'RLpar')
        return par(core, ser(el('R', 'dR', b.dR), el('L', 'dL', b.dL)))
      if (b.dmode === 'RLser')
        return ser(core, par(el('R', 'dR', b.dR), el('L', 'dL', b.dL)))
      return core
    }
    case 'bead2':
      return ser(
        el('R', 'rdc', b.rdc),
        par(el('L', 'lb', b.lb), el('R', 'rb', b.rb))
      )
    case 'bead4':
      return ser(
        el('R', 'rs', b.rs),
        par(
          el('L', 'lb', b.lb),
          el('R', 'rp', b.rp),
          b.cb > 0 ? el('C', 'cb', b.cb) : OPEN
        )
      )
    case 'res':
      return ser(el('R', 'r', b.r), el('L', 'l', b.l))
    case 'cap': {
      const n = Math.max(1, b.n)
      return ser(
        el('R', 'esr', b.esr / n),
        el('L', 'esl', b.esl / n),
        el('C', 'c', n * effC(b))
      )
    }
    case 'rc':
      return ser(
        el('R', 'rd', b.rd),
        el('R', 'esr', b.esr),
        el('L', 'esl', b.esl),
        el('C', 'cd', b.cd)
      )
  }
}

/** Letters, digits and `_` only; SPICE names are not case sensitive. */
function tokens(blocks: Block[]): string[] {
  const used = new Set(['src', 'load', 'gmin'])
  return blocks.map((b, i) => {
    const base =
      String(b.name ?? '')
        .replace(/[^A-Za-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24) || `b${i + 1}`
    let t = base
    for (let k = 2; used.has(t.toLowerCase()); k++) t = `${base}_${k}`
    used.add(t.toLowerCase())
    return t
  })
}

/** Places networks between nodes and merges nodes joined by a short. */
class Builder {
  private els: SpiceElement[] = []
  private parent = new Map<string, string>()
  private count = 0
  constructor(
    private pre: string,
    private out: string
  ) {}

  node(): string {
    return `${this.pre}n${++this.count}`
  }

  private find(n: string): string {
    let r = n
    while (this.parent.has(r)) r = this.parent.get(r)!
    return r
  }

  // Ground wins, then the output node, then any other named node.
  private rank(n: string) {
    if (n === '0') return 3
    if (n === this.out) return 2
    return /^[a-z]_n\d+$/.test(n) ? 0 : 1
  }

  join(a: string, b: string) {
    const ra = this.find(a),
      rb = this.find(b)
    if (ra === rb) return
    if (this.rank(ra) >= this.rank(rb)) this.parent.set(rb, ra)
    else this.parent.set(ra, rb)
  }

  add(e: SpiceElement) {
    this.els.push(e)
  }

  place(net: Net, a: string, b: string, tag: string) {
    switch (net.t) {
      case 'short':
        this.join(a, b)
        return
      case 'open':
        return
      case 'par':
        for (const p of net.parts) this.place(p, a, b, tag)
        return
      case 'ser': {
        let n = a
        net.parts.forEach((p, i) => {
          const m = i === net.parts.length - 1 ? b : this.node()
          this.place(p, n, m, tag)
          n = m
        })
        return
      }
      case 'el':
        this.add({
          name: `${net.kind}_${this.pre}${tag}_${net.part}`,
          kind: net.kind,
          a,
          b,
          value: net.v,
        })
    }
  }

  done(): SpiceCopy {
    // Internal nodes left after merging are numbered 1, 2, ... in order.
    const names = new Map<string, string>()
    const name = (n: string) => {
      const r = this.find(n)
      if (this.rank(r) > 0) return r
      if (!names.has(r)) names.set(r, `${this.pre}n${names.size + 1}`)
      return names.get(r)!
    }
    const elements: SpiceElement[] = []
    for (const e of this.els) {
      const a = name(e.a),
        b = name(e.b)
      // Only possible when a short to ground covers the element.
      if (a === b) continue
      elements.push({ ...e, a, b })
    }
    return { elements, out: this.find(this.out) }
  }
}

function copy(st: Design, which: 'h' | 'z', tok: string[]): SpiceCopy {
  const pre = `${which}_`
  const out = `${pre}out`
  const bld = new Builder(pre, out)
  const src = ser(el('R', 'R', st.source.R), el('L', 'L', st.source.L))
  let rail = bld.node()
  if (which === 'h') {
    const vs = `${pre}vs`
    bld.add({ name: 'V_h_src', kind: 'V', a: vs, b: '0', value: 0, ac: 1 })
    bld.place(src, vs, rail, 'src')
  } else {
    // Source shorted: Rs and Ls go to ground.
    bld.place(src, '0', rail, 'src')
  }
  st.blocks.forEach((b, i) => {
    if (!b.on) return
    const net = blockNet(b)
    if (kindOf(b) === 'series') {
      const next = bld.node()
      bld.place(net, rail, next, tok[i])
      rail = next
    } else {
      bld.place(net, rail, '0', tok[i])
    }
  })
  bld.join(rail, out)
  if (which === 'h') {
    const rl = loadR(st)
    if (rl !== null) bld.place(el('R', 'R', rl), out, '0', 'load')
  } else {
    // 1 A into the converter node: SPICE current flows from a to b inside
    // the source, so b is the node it feeds.
    bld.add({ name: 'I_z_src', kind: 'I', a: '0', b: out, value: 0, ac: 1 })
  }
  bld.add({ name: `R_${pre}gmin`, kind: 'R', a: out, b: '0', value: 1e9 })
  return bld.done()
}

/** The load on the H copy as set in the plot settings, or null (open). */
function loadR(st: Design): number | null {
  if (st.plot.load === 'conv') return rnOf(st.conv, st.conv.vinNom)
  if (st.plot.load === 'res') return st.plot.rload
  return null
}

/** Both copies of the filter: `h` gives H = V(h_out), `z` gives Zout. */
export function spiceElements(st: Design): { h: SpiceCopy; z: SpiceCopy } {
  const tok = tokens(st.blocks)
  return { h: copy(st, 'h', tok), z: copy(st, 'z', tok) }
}

/** A number with 12 significant digits, in a form SPICE reads. */
function spiceNum(v: number): string {
  return String(Number(v.toPrecision(12)))
}

/** One line of user text for a `*` comment: no line breaks or control chars. */
function clean(s: unknown, max = Infinity): string {
  // Cc: C0 and C1 controls (CR, LF, NEL, ...). Zl, Zp: line and paragraph
  // separators.
  return String(s ?? '')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ')
    .trim()
    .slice(0, max)
}

function line(e: SpiceElement): string {
  if (e.kind === 'V' || e.kind === 'I')
    return `${e.name} ${e.a} ${e.b} AC ${spiceNum(e.ac ?? 0)}`
  return `${e.name} ${e.a} ${e.b} ${spiceNum(e.value)}`
}

function loadText(st: Design): string {
  const rl = loadR(st)
  if (st.plot.load === 'conv')
    return `converter, Rn = ${spiceNum(rl ?? 0)} ohm at Vin = ${spiceNum(st.conv.vinNom)} V`
  if (st.plot.load === 'res') return `resistor, ${spiceNum(rl ?? 0)} ohm`
  return 'open'
}

/** The full .cir text. `date` and `link` go into the header comments. */
export function spiceNetlist(
  st: Design,
  opts: { date: string; link: string }
): string {
  const { h, z } = spiceElements(st)
  const out = [
    '* Input Filter Tuner: SPICE netlist',
    `* Design: ${clean(st.name, 200)}`,
    `* Date: ${clean(opts.date, 100)}`,
    `* Load on H: ${clean(loadText(st))}`,
    `* Link: ${clean(opts.link)}`,
    '*',
    `* h_*: V source AC 1 behind Rs and Ls. H = V(${h.out}).`,
    '* z_*: source shorted, Rs and Ls kept, 1 A AC into the converter node.',
    `*      Zout = V(${z.out}).`,
    '* Each output node has 1 GOhm to ground so no node floats.',
    '',
    '* H copy',
    ...h.elements.map(line),
    '',
    '* Zout copy',
    ...z.elements.map(line),
    '',
    `.ac dec 200 ${spiceNum(st.plot.fmin)} ${spiceNum(st.plot.fmax)}`,
  ]
  if (z.out === '0')
    out.push('* Zout is 0: the converter node is shorted to ground.')
  else out.push(`.meas AC zpk MAX mag(V(${z.out}))`)
  out.push('.end', '')
  return out.join('\n')
}
