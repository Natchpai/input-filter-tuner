import { describe, expect, it } from 'vitest'
import {
  abs,
  add,
  type Complex,
  cx,
  type Design,
  div,
  grid,
  hotPlugAt,
  loadStepAt,
  mul,
  point,
  rnBus,
  TAU,
} from '../engine'
import { baseState, mk, mkLoad } from '../state/defaults'
import { buildPreset, PRESET_COUNT, PRESET_NAMES } from '../state/presets'
import {
  spiceElements,
  spiceHotPlug,
  spiceLoadStep,
  spiceNetlist,
} from './netlist'

const OPTS = { date: '2026-11-04', link: 'https://example.com/#d=abc' }
const LOADS = ['open', 'conv', 'res'] as const

type El = { name: string; a: string; b: string; value: number; ac: boolean }

// Element lines only: `name a b value` or `name a b AC mag`.
function parse(text: string): El[] {
  const out: El[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('*') || line.startsWith('.')) continue
    const t = line.split(/\s+/)
    if (t.length === 5 && t[3] === 'AC')
      out.push({ name: t[0], a: t[1], b: t[2], value: +t[4], ac: true })
    else if (t.length === 4)
      out.push({ name: t[0], a: t[1], b: t[2], value: +t[3], ac: false })
    else throw new Error('bad line: ' + line)
    expect(Number.isFinite(out[out.length - 1].value)).toBe(true)
  }
  return out
}

const sub = (a: Complex, b: Complex) => cx(a.re - b.re, a.im - b.im)

/** Modified nodal analysis at one frequency. Returns the node voltages. */
function solve(els: El[], f: number): Map<string, Complex> {
  const w = TAU * f
  const idx = new Map<string, number>()
  for (const e of els)
    for (const n of [e.a, e.b])
      if (n !== '0' && !idx.has(n)) idx.set(n, idx.size)
  const vsrc = els.filter((e) => e.name[0].toUpperCase() === 'V')
  const N = idx.size + vsrc.length
  const G: Complex[][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => cx(0))
  )
  const rhs: Complex[] = Array.from({ length: N }, () => cx(0))
  const at = (n: string) => (n === '0' ? -1 : idx.get(n)!)
  const stamp = (i: number, j: number, y: Complex) => {
    if (i >= 0 && j >= 0) G[i][j] = add(G[i][j], y)
  }
  let k = idx.size
  for (const e of els) {
    const a = at(e.a),
      b = at(e.b)
    const kind = e.name[0].toUpperCase()
    if (kind === 'R' || kind === 'L' || kind === 'C') {
      const y =
        kind === 'R'
          ? cx(1 / e.value)
          : kind === 'L'
            ? cx(0, -1 / (w * e.value))
            : cx(0, w * e.value)
      stamp(a, a, y)
      stamp(b, b, y)
      stamp(a, b, cx(-y.re, -y.im))
      stamp(b, a, cx(-y.re, -y.im))
    } else if (kind === 'I') {
      // Current flows from a to b through the source: it feeds node b.
      if (b >= 0) rhs[b] = add(rhs[b], cx(e.value))
      if (a >= 0) rhs[a] = sub(rhs[a], cx(e.value))
    } else if (kind === 'V') {
      stamp(a, k, cx(1))
      stamp(k, a, cx(1))
      stamp(b, k, cx(-1))
      stamp(k, b, cx(-1))
      rhs[k] = cx(e.value)
      k++
    } else throw new Error('unknown element ' + e.name)
  }
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < N; c++) {
    let p = c
    for (let r = c + 1; r < N; r++) if (abs(G[r][c]) > abs(G[p][c])) p = r
    if (abs(G[p][c]) === 0) throw new Error('singular matrix')
    ;[G[c], G[p]] = [G[p], G[c]]
    ;[rhs[c], rhs[p]] = [rhs[p], rhs[c]]
    for (let r = c + 1; r < N; r++) {
      const m = div(G[r][c], G[c][c])
      if (m.re === 0 && m.im === 0) continue
      for (let j = c; j < N; j++) G[r][j] = sub(G[r][j], mul(m, G[c][j]))
      rhs[r] = sub(rhs[r], mul(m, rhs[c]))
    }
  }
  const x: Complex[] = new Array<Complex>(N)
  for (let r = N - 1; r >= 0; r--) {
    let s = rhs[r]
    for (let j = r + 1; j < N; j++) s = sub(s, mul(G[r][j], x[j]))
    x[r] = div(s, G[r][r])
  }
  const v = new Map<string, Complex>([['0', cx(0)]])
  for (const [n, i] of idx) v.set(n, x[i])
  return v
}

const rel = (a: Complex, b: Complex) => abs(sub(a, b)) / abs(b)

/** Worst relative errors of Zout and H over 20 frequencies. */
function compare(st: Design) {
  const text = spiceNetlist(st, OPTS)
  const els = parse(text)
  const { h, z } = spiceElements(st)
  let ez = 0,
    eh = 0
  for (const f of grid(st.plot.fmin, st.plot.fmax, 20)) {
    const v = solve(els, f)
    const p = point(st, f)
    if (z.out === '0') expect(abs(p.Zout)).toBe(0)
    else {
      ez = Math.max(ez, rel(v.get(z.out)!, p.Zout))
      // |Zout| as asked, on top of the complex check.
      ez = Math.max(
        ez,
        Math.abs(abs(v.get(z.out)!) - abs(p.Zout)) / abs(p.Zout)
      )
    }
    eh = Math.max(eh, rel(v.get(h.out)!, p.H))
  }
  return { ez, eh, text, els }
}

const withLoad = (st: Design, load: (typeof LOADS)[number]): Design => ({
  ...st,
  plot: { ...st.plot, load },
})

/** Extra converters on the bus (M5). */
const withConvs = (st: Design, ...vals: Parameters<typeof mkLoad>[2][]) => ({
  ...st,
  loads: vals.map((v, i) => mkLoad(st.conv, `X${i + 2}`, v, `x${i}`)),
})

describe('SPICE netlist', () => {
  it('has all 14 presets', () => {
    expect(PRESET_COUNT).toBe(14)
  })

  for (let i = 0; i < PRESET_COUNT; i++) {
    it(`matches the engine: ${PRESET_NAMES[i]}`, () => {
      const st = buildPreset(i)
      for (const load of LOADS) {
        const { ez, eh } = compare(withLoad(st, load))
        expect(ez).toBeLessThan(1e-6)
        expect(eh).toBeLessThan(1e-6)
      }
    })
  }

  it('matches the engine with every part in use', () => {
    const st = baseState(
      'All parts',
      { vinNom: 12, pout: 20 },
      { R: 0.05, L: 2e-6 },
      [
        mk('ind', 'L1', {
          L: 4.7e-6,
          dcr: 10e-3,
          cp: 5e-12,
          dmode: 'R',
          dR: 3,
        }),
        mk('cap', 'C1', {
          c: 4.7e-6,
          esr: 3e-3,
          esl: 0.5e-9,
          n: 3,
          derate: 40,
        }),
        mk('ind', 'L2', {
          L: 2.2e-6,
          dcr: 0,
          cp: 2e-12,
          dmode: 'RLpar',
          dR: 0.5,
          dL: 1e-6,
        }),
        mk('rc', 'Rd1', { rd: 0.8, cd: 47e-6, esr: 20e-3, esl: 1e-9 }),
        mk('ind', 'L3', {
          L: 1e-6,
          dcr: 5e-3,
          dmode: 'RLser',
          dR: 0.3,
          dL: 1e-6,
        }),
        mk('bead2', 'FB1', { rdc: 0.05, lb: 0.5e-6, rb: 30 }),
        mk('bead4', 'FB2', { rs: 0.02, lb: 1e-6, rp: 120, cb: 0 }),
        mk('res', 'R1', { r: 0.1, l: 2e-9 }),
        mk('cap', 'C2', { c: 22e-6, esr: 10e-3, esl: 1e-9 }),
      ],
      { rload: 5 }
    )
    for (const load of LOADS) {
      const { ez, eh, els } = compare(withLoad(st, load))
      expect(ez).toBeLessThan(1e-6)
      expect(eh).toBeLessThan(1e-6)
      expect(els.some((e) => e.name === 'C_h_L1_cp')).toBe(true)
      expect(els.some((e) => e.name === 'C_h_FB2_cb')).toBe(false)
      expect(els.some((e) => e.name === 'R_h_L2_dcr')).toBe(false)
    }
  })

  it('keeps user text on one comment line and names valid', () => {
    // U+2028 (line separator) and U+0085 (NEL) break lines in some readers.
    const ls = String.fromCharCode(0x2028),
      nel = String.fromCharCode(0x85)
    const name = `Evil\n.tran 1m\r\nR9 a b 1${ls}* x${nel}.op`
    const st = baseState(name, {}, { R: 0.1 }, [
      mk('ind', 'L1\n.end', { L: 10e-6 }),
      mk('cap', '*', { c: 10e-6 }),
      mk('cap', '.', { c: 1e-6 }),
      mk('cap', 'l1_end', { c: 1e-6 }),
      mk('cap', '', { c: 2e-6 }),
      mk('res', 'src', { r: 0.01 }),
    ])
    const text = spiceNetlist(st, {
      date: '2026\n.op',
      link: 'https://x/#d=a\nV1 0 1 5',
    })
    for (const bad of ['\r', ls, nel, String.fromCharCode(0x2029)])
      expect(text.includes(bad)).toBe(false)
    const lines = text.split('\n')
    const directives = lines.filter((l) => l.startsWith('.'))
    expect(directives.map((l) => l.split(' ')[0])).toEqual([
      '.ac',
      '.meas',
      '.end',
    ])
    for (const l of lines) {
      if (!l || l.startsWith('*') || l.startsWith('.')) continue
      expect(l).toMatch(
        /^[RLCVI][A-Za-z0-9_]* [a-z0-9_]+ [a-z0-9_]+ (AC )?\S+$/
      )
    }
    expect(lines.filter((l) => l.startsWith('* Design:'))).toHaveLength(1)
    const names = parse(text).map((e) => e.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    const { ez, eh } = compare(st)
    expect(ez).toBeLessThan(1e-6)
    expect(eh).toBeLessThan(1e-6)
  })

  it('merges a series R of 0 and an L of 0 and never writes a 0', () => {
    const parts = [
      mk('ind', 'L1', { L: 10e-6, dcr: 0 }),
      mk('res', 'R0', { r: 0, l: 0 }),
      mk('cap', 'C1', { c: 10e-6, esr: 0, esl: 0 }),
    ]
    const st = baseState('Zeros', {}, {}, parts)
    const { h, z } = spiceElements(st)
    const all = [...h.elements, ...z.elements]
    expect(all.some((e) => e.name.includes('_R0_'))).toBe(false)
    expect(all.some((e) => e.name.includes('_dcr'))).toBe(false)
    for (const e of all)
      if (e.kind !== 'V' && e.kind !== 'I') expect(e.value).not.toBe(0)
    // Same nodes as without the zero block.
    const st2 = baseState('No R0', {}, {}, [parts[0], parts[2]])
    const nodes = (s: Design) =>
      new Set(spiceElements(s).h.elements.flatMap((e) => [e.a, e.b])).size
    expect(nodes(st)).toBe(nodes(st2))
    const { ez, eh } = compare(st)
    expect(ez).toBeLessThan(1e-6)
    expect(eh).toBeLessThan(1e-6)
  })

  it('writes a valid netlist with every block off', () => {
    const st = buildPreset(0)
    const off: Design = {
      ...st,
      source: { R: 0.1, L: 1e-6 },
      blocks: st.blocks.map((b) => ({ ...b, on: false })),
    }
    for (const load of LOADS) {
      const { ez, eh, text } = compare(withLoad(off, load))
      expect(ez).toBeLessThan(1e-6)
      expect(eh).toBeLessThan(1e-6)
      expect(text).toContain('.meas AC zpk MAX mag(V(z_out))')
      expect(text.trimEnd().endsWith('.end')).toBe(true)
    }
  })

  it('handles a converter node shorted to ground (no source, no blocks)', () => {
    const st = buildPreset(0)
    const off: Design = {
      ...st,
      blocks: st.blocks.map((b) => ({ ...b, on: false })),
    }
    const { eh, text } = compare(off)
    expect(eh).toBeLessThan(1e-6)
    expect(text).not.toContain('.meas')
    expect(text.trimEnd().endsWith('.end')).toBe(true)
  })

  it('writes the header and the sweep', () => {
    const st = withLoad(buildPreset(0), 'conv')
    const text = spiceNetlist(st, OPTS)
    expect(text).toContain('* Design: D1 LC undamped')
    expect(text).toContain('* Date: 2026-11-04')
    expect(text).toContain('* Load on H: converter, Rn = -23.04 ohm')
    expect(text).toContain('* Link: https://example.com/#d=abc')
    expect(text).toContain('.ac dec 200 10 100000000')
    expect(text).toContain('R_h_load_R h_out 0 -23.04')
    expect(text).toContain('I_z_src 0 z_out AC 1')
  })
})

describe('several converters (M5)', () => {
  it('H with the converter load uses the bus Rn and matches the engine', () => {
    const st = withLoad(
      withConvs(buildPreset(1), { pout: 30, eta: 0.9, fcheck: 50e3 }),
      'conv'
    )
    const { ez, eh, text } = compare(st)
    expect(ez).toBeLessThan(1e-6)
    expect(eh).toBeLessThan(1e-6)
    const rn = rnBus(st, st.conv.vinNom)
    expect(rn).not.toBeCloseTo(-23.04, 3)
    expect(text).toContain(
      `* Load on H: 2 converters, bus Rn = ${Number(rn.toPrecision(12))} ohm`
    )
  })

  it('an extra converter that is off changes nothing', () => {
    const st = withLoad(buildPreset(1), 'conv')
    const off = withConvs(st, { pout: 30, on: false })
    expect(spiceNetlist(off, OPTS)).toBe(spiceNetlist(st, OPTS))
    const row = loadStepAt(st, 48)
    expect(spiceLoadStep(off, row, OPTS)).toBe(spiceLoadStep(st, row, OPTS))
  })

  it('load step: one constant-power B source per converter', () => {
    const st = withConvs(buildPreset(1), {
      name: 'Aux',
      pout: 20,
      pLight: 5,
      eta: 0.8,
    })
    const row = loadStepAt(st, 48)
    const text = spiceLoadStep(st, row, OPTS)
    const bs = text.split('\n').filter((l) => l.startsWith('B_'))
    expect(bs).toHaveLength(2)
    expect(bs[0]).toMatch(
      /^B_t_conv t_out 0 I=if\(time<\S+,0,if\(time<\S+,100,0\)\)\/\(1\*max\(V\(t_out\),24\)\)$/
    )
    expect(bs[1]).toMatch(
      /^B_t_conv2 t_out 0 I=if\(time<\S+,5,if\(time<\S+,20,5\)\)\/\(0\.8\*max\(V\(t_out\),24\)\)$/
    )
    expect(text).toContain('* Vin = 48 V, 2 converters step together at t1 = ')
    expect(text).toContain('*   Aux: P 5 W -> 20 W')
    // Both sources step at the same times.
    const times = bs.map((b) =>
      [...b.matchAll(/time<([^,]+)/g)].map((m) => m[1])
    )
    expect(times[1]).toEqual(times[0])
  })
})

describe('time-domain netlists (M4)', () => {
  const d1 = () =>
    buildPreset(PRESET_NAMES.findIndex((n) => n.startsWith('D1 · LC + Rd-Cd')))

  /** Element lines of a .tran netlist: name a b value (V and B lines apart). */
  const elems = (text: string) =>
    text
      .split('\n')
      .filter((l) => l && !/^[*.VB]/.test(l))
      .map((l) => {
        const t = l.split(/\s+/)
        expect(t).toHaveLength(4)
        expect(Number.isFinite(+t[3])).toBe(true)
        return t
      })

  it('hot-plug: step source, cable in the source path, .tran and .meas', () => {
    const st = d1()
    st.tran = { ...st.tran, lCable: 2e-6, rCable: 0.05 }
    const row = hotPlugAt(st, 48)
    const text = spiceHotPlug(st, row, OPTS)
    expect(text).toContain('V_t_src t_vs 0 PWL(0 0 1e-12 48)')
    expect(text).toMatch(/^\.tran 0 \S+ 0 \S+$/m)
    expect(text).toContain('.meas TRAN vpk MAX V(t_out)')
    expect(text).toContain('.meas TRAN imin MIN I(V_t_src)')
    const els = elems(text)
    expect(els.find((e) => e[0] === 'L_t_src_L')?.[3]).toBe('0.000002')
    expect(els.find((e) => e[0] === 'R_t_src_R')?.[3]).toBe('0.05')
    expect(text.trimEnd().endsWith('.end')).toBe(true)
  })

  it('load step: constant-power B source with both edges inside the run', () => {
    const st = d1()
    const row = loadStepAt(st, 48)
    const text = spiceLoadStep(st, row, OPTS)
    const b = text.split('\n').find((l) => l.startsWith('B_t_conv'))!
    expect(b).toMatch(
      /^B_t_conv t_out 0 I=if\(time<\S+,0,if\(time<\S+,100,0\)\)\/\(1\*max\(V\(t_out\),24\)\)$/
    )
    const [t1, t2] = [...b.matchAll(/time<([^,]+)/g)].map((m) => +m[1])
    const tStop = +text.match(/^\.tran 0 (\S+)/m)![1]
    expect(0 < t1 && t1 < t2 && t2 < tStop).toBe(true)
    expect(text).toContain('V_t_src t_vs 0 48')
    expect(text).toContain('.meas TRAN vmin MIN V(t_out)')
    elems(text)
  })

  it('keeps user text on comment lines', () => {
    const st = { ...d1(), name: 'bad\nV1 0 1 99\r.end' }
    const text = spiceHotPlug(st, hotPlugAt(st, 48), OPTS)
    expect(text).toContain('* Design: bad V1 0 1 99 .end')
    expect(text.split('\n').filter((l) => l === '.end')).toHaveLength(1)
  })
})
