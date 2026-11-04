// The filter as a graph of R, L, C elements between nodes. Pure, no DOM
// access. The mapping follows zBlock in ladder.ts element for element; the
// SPICE export (export/netlist.ts) and the time-domain solver (transient.ts)
// both build on it.
import type { Block } from './model'
import { effC } from './types'

export type ElKind = 'R' | 'L' | 'C' | 'I' | 'V'

export type CircuitElement = {
  name: string
  kind: ElKind
  a: string
  b: string
  /** R in Ω, L in H, C in F; the DC value (0) for V and I. */
  value: number
  /** AC magnitude of a V or I source. */
  ac?: number
}

/** One copy of the filter and the node that holds the result. */
export type CircuitCopy = { elements: CircuitElement[]; out: string }

// A two-terminal network, built from a block before it is placed.
export type Net =
  | { t: 'short' }
  | { t: 'open' }
  | { t: 'el'; kind: 'R' | 'L' | 'C'; part: string; v: number }
  | { t: 'ser' | 'par'; parts: Net[] }

export const SHORT: Net = { t: 'short' }
export const OPEN: Net = { t: 'open' }

/** R or L of 0 is a short, C of 0 (or a bad number) is left out. */
export function el(kind: 'R' | 'L' | 'C', part: string, v: number): Net {
  if (!Number.isFinite(v)) return OPEN
  if (v === 0) return kind === 'C' ? OPEN : SHORT
  return { t: 'el', kind, part, v }
}

export function ser(...parts: Net[]): Net {
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

export function par(...parts: Net[]): Net {
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
export function blockNet(b: Block): Net {
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
export function tokens(blocks: Block[]): string[] {
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
export class Builder {
  private els: CircuitElement[] = []
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

  add(e: CircuitElement) {
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

  private names = new Map<string, string>()

  /**
   * Final name of a node after merging. Internal nodes are numbered 1, 2,
   * ... in the order they are first named, so call it after done().
   */
  nodeName(n: string): string {
    const r = this.find(n)
    if (this.rank(r) > 0) return r
    if (!this.names.has(r))
      this.names.set(r, `${this.pre}n${this.names.size + 1}`)
    return this.names.get(r)!
  }

  done(): CircuitCopy {
    // Internal nodes left after merging are numbered 1, 2, ... in order.
    const name = (n: string) => this.nodeName(n)
    const elements: CircuitElement[] = []
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
