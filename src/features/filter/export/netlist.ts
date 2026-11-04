// SPICE netlist export: the filter as a .cir file with two copies, one for H
// and one for Zout. Pure, no DOM access. The mapping follows zBlock in
// engine/ladder.ts element for element.
import {
  atCorner,
  converters,
  type Design,
  type HotPlugRow,
  iBus,
  kindOf,
  type LoadStepRow,
  pBus,
  rnBus,
  withCable,
} from '../engine'
import {
  blockNet,
  Builder,
  type CircuitCopy,
  type CircuitElement,
  el,
  ser,
  tokens,
} from '../engine/circuit'

function copy(st: Design, which: 'h' | 'z', tok: string[]): CircuitCopy {
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
  if (st.plot.load === 'conv') return rnBus(st, st.conv.vinNom)
  if (st.plot.load === 'res') return st.plot.rload
  return null
}

/** Both copies of the filter: `h` gives H = V(h_out), `z` gives Zout. */
export function spiceElements(st: Design): { h: CircuitCopy; z: CircuitCopy } {
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

function line(e: CircuitElement): string {
  if (e.kind === 'V' || e.kind === 'I')
    return `${e.name} ${e.a} ${e.b} AC ${spiceNum(e.ac ?? 0)}`
  return `${e.name} ${e.a} ${e.b} ${spiceNum(e.value)}`
}

function loadText(st: Design): string {
  const rl = loadR(st)
  const n = converters(st).length
  if (st.plot.load === 'conv')
    return n > 1
      ? `${n} converters, bus Rn = ${spiceNum(rl ?? 0)} ohm at Vin = ${spiceNum(st.conv.vinNom)} V`
      : `converter, Rn = ${spiceNum(rl ?? 0)} ohm at Vin = ${spiceNum(st.conv.vinNom)} V`
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

// ------------------------------------------------------------ time domain

/** The filter behind a source node t_vs, converter node t_out (M4). */
function tranCopy(d: Design): CircuitCopy {
  const tok = tokens(d.blocks)
  const bld = new Builder('t_', 't_out')
  let rail = bld.node()
  bld.place(
    ser(el('R', 'R', d.source.R), el('L', 'L', d.source.L)),
    't_vs',
    rail,
    'src'
  )
  d.blocks.forEach((b, i) => {
    if (!b.on) return
    const net = blockNet(b)
    if (kindOf(b) === 'series') {
      const next = bld.node()
      bld.place(net, rail, next, tok[i])
      rail = next
    } else bld.place(net, rail, '0', tok[i])
  })
  bld.join(rail, 't_out')
  return bld.done()
}

function header(
  st: Design,
  title: string,
  opts: { date: string; link: string }
) {
  return [
    `* Input Filter Tuner: ${title}`,
    `* Design: ${clean(st.name, 200)}`,
    `* Date: ${clean(opts.date, 100)}`,
    `* Link: ${clean(opts.link)}`,
    '*',
  ]
}

/**
 * Hot-plug as a .tran netlist at the row's Vin: the source steps 0 → Vin in
 * 1 ps behind Rsrc + Lsrc and the cable, converter open. The .meas lines
 * give the peak converter-node voltage and the source current (I(V) is
 * negative while the source delivers).
 */
export function spiceHotPlug(
  st: Design,
  row: HotPlugRow,
  opts: { date: string; link: string }
): string {
  const vin = row.vin
  const d = withCable(atCorner(st, { vin, pLoad: 0, i: 0, label: '' }))
  const c = tranCopy(d)
  const tStop = row.wave.t[row.wave.t.length - 1]
  return [
    ...header(st, 'hot-plug transient', opts),
    `* Vin = ${spiceNum(vin)} V, cable ${spiceNum(st.tran.lCable)} H, ${spiceNum(st.tran.rCable)} ohm.`,
    `* Tool result: V peak ${spiceNum(row.vPeak)} V, I peak ${row.iPeak === null ? 'not set (no L)' : spiceNum(row.iPeak) + ' A'}.`,
    '',
    `V_t_src t_vs 0 PWL(0 0 1e-12 ${spiceNum(vin)})`,
    ...c.elements.map(line),
    '',
    `.tran 0 ${spiceNum(tStop)} 0 ${spiceNum(row.dt)}`,
    `.meas TRAN vpk MAX V(${c.out})`,
    '.meas TRAN imin MIN I(V_t_src)',
    '.end',
    '',
  ].join('\n')
}

/**
 * Load step as a .tran netlist at the row's Vin: one constant-power B source
 * per converter, I = P/(eta·max(V, Vin/2)), each stepping P_light → P_full at
 * t1 and back at t2, all together (M5). .meas: the light-load voltage, the
 * lowest V after t1, the highest after t2.
 */
export function spiceLoadStep(
  st: Design,
  row: LoadStepRow,
  opts: { date: string; link: string }
): string {
  const vin = row.vin
  const d = atCorner(st, {
    vin,
    pLoad: pBus(st, 'full'),
    i: iBus(st, vin, 'full'),
    label: '',
  })
  const c = tranCopy(d)
  const t1 = 0.1 * row.tDown
  const t2 = t1 + row.tDown
  const tStop = t1 + row.wave.t[row.wave.t.length - 1]
  const n = (v: number) => spiceNum(v)
  const us = converters(st)
  const srcs = us.map((u, k) => {
    const pFull = u.pout
    const pLight = Math.min(Math.max(0, u.pLight), pFull)
    const p = `if(time<${n(t1)},${n(pLight)},if(time<${n(t2)},${n(pFull)},${n(pLight)}))`
    return {
      name: clean(u.name, 40),
      step: `P ${n(pLight)} W -> ${n(pFull)} W`,
      line: `B_t_conv${k === 0 ? '' : k + 1} ${c.out} 0 I=${p}/(${n(u.eta)}*max(V(${c.out}),${n(0.5 * vin)}))`,
    }
  })
  const at = `at t1 = ${n(t1)} s, back at t2 = ${n(t2)} s.`
  const steps =
    srcs.length === 1
      ? [`* Vin = ${n(vin)} V, ${srcs[0].step} ${at}`]
      : [
          `* Vin = ${n(vin)} V, ${srcs.length} converters step together ${at}`,
          ...srcs.map((x) => `*   ${x.name}: ${x.step}`),
        ]
  return [
    ...header(st, 'load-step transient', opts),
    ...steps,
    `* Tool result: V min ${n(row.vMin)} V, V max ${n(row.vMax)} V.`,
    '',
    `V_t_src t_vs 0 ${n(vin)}`,
    ...c.elements.map(line),
    ...srcs.map((x) => x.line),
    '',
    `.tran 0 ${n(tStop)} 0 ${n(row.dt)}`,
    `.meas TRAN vlight FIND V(${c.out}) AT ${n(t1 / 2)}`,
    `.meas TRAN vmin MIN V(${c.out}) FROM ${n(t1)} TO ${n(t2)}`,
    `.meas TRAN vmax MAX V(${c.out}) FROM ${n(t2)} TO ${n(tStop)}`,
    '.end',
    '',
  ].join('\n')
}
