// Traces and layouts for each plot tab. Pure: the Plotly component draws them.
import {
  abs,
  argd,
  bandLimit,
  bandsOf,
  type Complex,
  dampKey,
  db,
  dbuv,
  type Design,
  EMI_STDS,
  emiResult,
  limVal,
  type Metrics,
  point,
  rnOf,
  sectionOf,
  type Sweep,
  sweepParam,
  type TabKey,
  zBlock,
} from '../engine'
import { fmtSI } from '../lib/si'
import type { CurveSets } from './curves'
import type { PlotColors } from './theme-colors'

export const TABS: [TabKey, string][] = [
  ['zout', '|Zout| vs Rn'],
  ['xfer', 'S21 / H'],
  ['zin', 'Zin'],
  ['tm', 'Minor loop Tm'],
  ['elem', 'Element |Z|'],
  ['sweep', 'Rd sweep'],
  ['emi', 'Conducted EMI'],
]

/** Tabs that draw snapshot curves. */
export const SNAPSHOT_TABS: TabKey[] = ['zout', 'xfer', 'zin', 'tm']

type Obj = Record<string, unknown>
export type Figure = { traces: Obj[]; layout: Obj }
export type PlotResult = {
  main: Figure
  /** Second plot next to the first (Nyquist on the Tm tab). */
  side?: Figure
  note: string
  /** Rd sweep: the blocks that can be swept, and the one shown. */
  sweep?: { choices: { id: string; name: string }[]; current: string }
}

/**
 * Plotly renders a few HTML tags in text; show user names as plain text.
 * Plotly decodes numeric entities but not &quot;, so `"` becomes &#34;.
 */
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' })[
        c
      ]!
  )

const mag = (a: Complex[]) => a.map(abs)
const dbs = (a: Complex[]) => a.map((z) => db(abs(z)))
const ph = (a: Complex[]) => a.map(argd)

/** Grey reference curves of a saved design (overlay). */
export type Snapshot = {
  label: string
  f: number[]
  zout: number[]
  h: number[]
  s21: number[]
  zin: number[]
  tm: number[]
}

export function snapshotOf(label: string, s: Sweep): Snapshot {
  return {
    label,
    f: Array.from(s.f),
    zout: mag(s.Zout),
    h: dbs(s.H),
    s21: dbs(s.S21),
    zin: mag(s.Zin),
    tm: dbs(s.Tm),
  }
}

function axisBase(C: PlotColors): Obj {
  return {
    gridcolor: C.line,
    zerolinecolor: C.line,
    linecolor: C.line,
    tickfont: { color: C.muted },
    title: { font: { color: C.muted, size: 12 } },
    spikecolor: C.muted,
    spikethickness: 1,
    spikedash: 'dot',
    hoverformat: '.4~s',
  }
}

function makeLayout(C: PlotColors, extra: Obj = {}): Obj {
  // Spikes, hover box and toolbar take the theme colours. With a transparent
  // paper Plotly falls back to a white hover box, which is unreadable in dark
  // mode; it also outlines spike lines against plot_bgcolor.
  return {
    paper_bgcolor: C.panel,
    plot_bgcolor: C.panel,
    font: { color: C.ink, size: 11 },
    hoverlabel: {
      bgcolor: C.panel,
      bordercolor: C.line,
      font: { color: C.ink, size: 11 },
    },
    modebar: {
      bgcolor: 'rgba(0,0,0,0)',
      color: C.muted,
      activecolor: C.accent,
    },
    margin: { l: 62, r: 16, t: 10, b: 44 },
    hovermode: 'x unified',
    showlegend: true,
    legend: {
      orientation: 'h',
      y: 1.02,
      yanchor: 'bottom',
      x: 0,
      font: { size: 11 },
    },
    xaxis: {
      type: 'log',
      title: { text: 'Frequency (Hz)' },
      exponentformat: 'SI',
      ...axisBase(C),
    },
    ...extra,
  }
}

/** Frequency markers; markers at the same frequency share one line. */
function vlines(list: [number | null | undefined, string, string][]): Obj[] {
  const merged: [number, string, string][] = []
  for (const [f, label, color] of list) {
    if (!f || !(f > 0)) continue
    const m = merged.find((x) => Math.abs(Math.log10(x[0] / f)) < 0.02)
    if (m) m[1] += ' · ' + label
    else merged.push([f, label, color])
  }
  return merged.map(([f, label, color]) => ({
    type: 'line',
    xref: 'x',
    yref: 'paper',
    x0: f,
    x1: f,
    y0: 0,
    y1: 1,
    line: { color, width: 1, dash: 'dot' },
    label: { text: label, textposition: 'end', font: { size: 10, color } },
  }))
}

export function buildPlot(
  S: Design,
  sets: CurveSets,
  m: Metrics,
  snapshots: Snapshot[],
  C: PlotColors
): PlotResult {
  // The EMI tab exists only while EMI is on; otherwise draw Zout.
  const tab = S.plot.tab === 'emi' && !S.emi.on ? 'zout' : S.plot.tab
  if (tab === 'emi') return emiPlot(S, C)
  const f = Array.from(sets.nom.f)
  const cv = S.conv
  const ax = (extra: Obj) => ({ ...axisBase(C), ...extra })
  const marks: [number | null | undefined, string, string][] = [
    [m.prim && m.prim.f0, 'f0', C.muted],
    [cv.fsw, 'fsw', C.muted],
  ]
  if (m.ripple.N > 1) marks.push([m.ripple.fr, 'N·fsw', C.muted])
  const traces: Obj[] = []
  let layout: Obj
  let note = ''
  let side: Figure | undefined
  let sweepInfo: PlotResult['sweep']
  const tolTraces = (fn: (s: Sweep) => number[], yaxis?: string) => {
    const out: Obj[] = []
    if (sets.tL)
      out.push({
        x: f,
        y: fn(sets.tL),
        name: `L ${S.plot.dL}%`,
        line: { color: C.c, width: 1, dash: 'dot' },
        yaxis,
      })
    if (sets.tC)
      out.push({
        x: f,
        y: fn(sets.tC),
        name: `C ${S.plot.dC}%`,
        line: { color: C.d, width: 1, dash: 'dot' },
        yaxis,
      })
    if (sets.tLC)
      out.push({
        x: f,
        y: fn(sets.tLC),
        name: 'L and C',
        line: { color: C.bad, width: 1, dash: 'dot' },
        yaxis,
      })
    return out
  }
  const snapTr = (key: 'zout' | 'h' | 's21' | 'zin' | 'tm') =>
    snapshots.map((s, i) => ({
      x: s.f,
      y: s[key],
      name: esc(s.label),
      line: { color: C.muted, width: 1.2, dash: i % 2 ? 'dash' : 'longdash' },
      opacity: 0.8,
    }))

  if (tab === 'zout') {
    traces.push({
      x: f,
      y: mag(sets.nom.Zout),
      name: '|Zout|',
      line: { color: C.a, width: 2.2 },
    })
    if (sets.und)
      traces.push({
        x: f,
        y: mag(sets.und.Zout),
        name: 'undamped',
        line: { color: C.b, width: 1.2, dash: 'dash' },
      })
    if (sets.worst)
      traces.push({
        x: f,
        y: mag(sets.worst.Zout),
        name: esc(sets.worstLabel ?? 'Worst corner'),
        line: { color: C.e, width: 1.6, dash: 'dash' },
      })
    traces.push(...tolTraces((s) => mag(s.Zout)))
    traces.push(...snapTr('zout'))
    const rns = (
      [
        ['min', cv.vinMin],
        ['nom', cv.vinNom],
        ['max', cv.vinMax],
      ] as const
    ).filter((x, i, a) => a.findIndex((y) => y[1] === x[1]) === i)
    rns.forEach(([, v], i) => {
      const r = Math.abs(rnOf(cv, v))
      traces.push({
        x: [f[0], f[f.length - 1]],
        y: [r, r],
        name: `|Rn| ${fmtSI(v, 'V')}`,
        mode: 'lines',
        line: { color: C.bad, width: 1.4, dash: i ? 'dashdot' : 'solid' },
        hoverinfo: 'skip',
      })
    })
    const lim = Math.abs(m.rn.min) / 10 ** (cv.k / 20)
    traces.push({
      x: [f[0], m.fHi],
      y: [lim, lim],
      name: `|Rn|−${cv.k} dB`,
      mode: 'lines',
      line: { color: C.bad, width: 1, dash: 'dot' },
      hoverinfo: 'skip',
    })
    traces.push({
      x: [m.peak.f],
      y: [m.peak.v],
      name: 'peak',
      mode: 'markers+text',
      marker: { color: C.a, size: 9, symbol: 'diamond' },
      text: [`${fmtSI(m.peak.v, 'Ω')} @ ${fmtSI(m.peak.f, 'Hz')}`],
      textposition: 'top right',
      textfont: { size: 11 },
    })
    traces.push({
      x: f,
      y: ph(sets.nom.Zout),
      name: '∠Zout',
      yaxis: 'y2',
      line: { color: C.a, width: 1.2 },
      showlegend: false,
    })
    if (sets.und)
      traces.push({
        x: f,
        y: ph(sets.und.Zout),
        name: '∠ undamped',
        yaxis: 'y2',
        line: { color: C.b, width: 1, dash: 'dash' },
        showlegend: false,
      })
    layout = makeLayout(C, {
      yaxis: ax({
        type: 'log',
        title: { text: '|Zout| (Ω)' },
        domain: [0.32, 1],
        exponentformat: 'SI',
      }),
      yaxis2: ax({
        title: { text: 'Phase (°)' },
        domain: [0, 0.25],
        range: [-95, 95],
        dtick: 45,
      }),
      shapes: vlines([...marks, [m.fHi, 'check max', C.bad]]),
    })
    note =
      'Margin is checked from f min up to "f check max". Above the converter loop crossover the converter is no longer a negative resistance.'
  } else if (tab === 'xfer') {
    const useS = S.plot.xfer === 'S21'
    const pick = (s: Sweep) => (useS ? s.S21 : s.H)
    const name = useS
      ? `S21 (${S.plot.z0} Ω)`
      : `H (${S.plot.load === 'open' ? 'open' : S.plot.load === 'conv' ? 'loaded by Rn' : 'R load'})`
    traces.push({
      x: f,
      y: dbs(pick(sets.nom)),
      name,
      line: { color: C.a, width: 2.2 },
    })
    if (sets.und)
      traces.push({
        x: f,
        y: dbs(pick(sets.und)),
        name: 'undamped',
        line: { color: C.b, width: 1.2, dash: 'dash' },
      })
    traces.push(...tolTraces((s) => dbs(pick(s))))
    traces.push(...snapTr(useS ? 's21' : 'h'))
    const atF = [cv.fsw, m.ripple.N > 1 ? m.ripple.fr : null].filter(
      (x): x is number => !!x
    )
    const pts = atF
      .map((fr) => point(S, fr))
      .map((p) => db(abs(useS ? p.S21 : p.H)))
    traces.push({
      x: atF,
      y: pts,
      mode: 'markers+text',
      name: 'at fsw',
      marker: { color: C.bad, size: 8 },
      text: pts.map((v) => v.toFixed(1) + ' dB'),
      textposition: 'bottom left',
    })
    traces.push({
      x: f,
      y: ph(pick(sets.nom)),
      yaxis: 'y2',
      name: '∠',
      line: { color: C.a, width: 1.2 },
      showlegend: false,
    })
    layout = makeLayout(C, {
      yaxis: ax({
        title: { text: (useS ? '|S21|' : '|H|') + ' (dB)' },
        domain: [0.32, 1],
      }),
      yaxis2: ax({
        title: { text: 'Phase (°)' },
        domain: [0, 0.25],
        dtick: 90,
      }),
      shapes: vlines(marks),
    })
    note = useS
      ? `S21 uses the filter blocks only, between two ${S.plot.z0} Ω ports. Source impedance and converter are not included.`
      : 'H = Vout/Vsrc including the source impedance. Open load matches the NP-DR report plots. |H open| is also the source/converter ripple-current ratio.'
  } else if (tab === 'zin') {
    traces.push({
      x: f,
      y: mag(sets.nom.Zin),
      name: '|Zin| loaded by Rn (Vin nom)',
      line: { color: C.a, width: 2.2 },
    })
    traces.push({
      x: f,
      y: mag(sets.nom.ZinOpen),
      name: '|Zin| converter side open',
      line: { color: C.d, width: 1.4, dash: 'dash' },
    })
    if (sets.und)
      traces.push({
        x: f,
        y: mag(sets.und.Zin),
        name: 'undamped, loaded',
        line: { color: C.b, width: 1.2, dash: 'dash' },
      })
    traces.push(...snapTr('zin'))
    traces.push({
      x: f,
      y: sets.nom.Zin.map((z) => z.re),
      name: 'Re(Zin) loaded',
      yaxis: 'y3',
      line: { color: C.c, width: 1.2 },
      showlegend: true,
    })
    traces.push({
      x: f,
      y: ph(sets.nom.Zin),
      name: '∠Zin loaded',
      yaxis: 'y2',
      line: { color: C.a, width: 1.2 },
      showlegend: false,
    })
    layout = makeLayout(C, {
      yaxis: ax({
        type: 'log',
        title: { text: '|Zin| (Ω)' },
        domain: [0.42, 1],
        exponentformat: 'SI',
      }),
      yaxis3: ax({ title: { text: 'Re (Ω)' }, domain: [0.22, 0.38] }),
      yaxis2: ax({
        title: { text: 'Phase (°)' },
        domain: [0, 0.18],
        range: [-185, 185],
        dtick: 90,
      }),
      shapes: vlines(marks),
    })
    note =
      'Zin is seen by the source (excludes Rsrc/Lsrc). With the converter as −|Rn|, Re(Zin) < 0 near f0 means the filter and converter together look active from the source.'
  } else if (tab === 'tm') {
    const tm = sets.nom.Tm
    traces.push({
      x: f,
      y: dbs(tm),
      name: '|Tm| = |Zout/Rn|',
      line: { color: C.a, width: 2.2 },
    })
    if (sets.und)
      traces.push({
        x: f,
        y: dbs(sets.und.Tm),
        name: 'undamped',
        line: { color: C.b, width: 1.2, dash: 'dash' },
      })
    traces.push(...snapTr('tm'))
    traces.push({
      x: [f[0], f[f.length - 1]],
      y: [-cv.k, -cv.k],
      name: `−${cv.k} dB`,
      mode: 'lines',
      line: { color: C.bad, width: 1, dash: 'dot' },
    })
    traces.push({
      x: f,
      y: ph(tm),
      yaxis: 'y2',
      name: '∠Tm',
      line: { color: C.a, width: 1.2 },
      showlegend: false,
    })
    layout = makeLayout(C, {
      yaxis: ax({ title: { text: '|Tm| (dB)' }, domain: [0.32, 1] }),
      yaxis2: ax({
        title: { text: 'Phase (°)' },
        domain: [0, 0.25],
        range: [-185, 185],
        dtick: 90,
      }),
      shapes: vlines(marks),
    })
    const circ: [number, number][] = []
    for (let i = 0; i <= 120; i++) {
      const a = (2 * Math.PI * i) / 120
      circ.push([Math.cos(a), Math.sin(a)])
    }
    side = {
      traces: [
        {
          x: tm.map((z) => z.re),
          y: tm.map((z) => z.im),
          name: 'Tm',
          mode: 'lines',
          line: { color: C.a, width: 2 },
          text: f.map((v) => fmtSI(v, 'Hz')),
          hovertemplate: '%{text}<br>%{x:.3f} %{y:.3f}j<extra></extra>',
        },
        {
          x: tm.map((z) => z.re),
          y: tm.map((z) => -z.im),
          name: 'mirror',
          mode: 'lines',
          line: { color: C.a, width: 1, dash: 'dot' },
          hoverinfo: 'skip',
        },
        {
          x: [-1],
          y: [0],
          name: '−1',
          mode: 'markers',
          marker: { color: C.bad, size: 10, symbol: 'x' },
        },
        {
          x: circ.map((p) => p[0]),
          y: circ.map((p) => p[1]),
          name: '|Tm| = 1',
          mode: 'lines',
          line: { color: C.muted, width: 1, dash: 'dot' },
          hoverinfo: 'skip',
        },
      ],
      layout: makeLayout(C, {
        hovermode: 'closest',
        xaxis: ax({
          title: { text: 'Re(Tm)' },
          zeroline: true,
          scaleanchor: 'y',
        }),
        yaxis: ax({ title: { text: 'Im(Tm)' }, zeroline: true }),
      }),
    }
    note =
      'Tm = Zout/Zconv with Zconv = Rn at Vin min (negative). Stable when the Nyquist curve does not encircle −1. Middlebrook asks |Tm| ≪ 1 at all f.'
  } else if (tab === 'elem') {
    const pal = [C.a, C.b, C.c, C.d, C.bad, C.muted]
    S.blocks.forEach((b, i) => {
      if (!b.on) return
      const z = f.map((fr) => zBlock(b, 2 * Math.PI * fr))
      const color = pal[i % pal.length]
      traces.push({
        x: f,
        y: z.map(abs),
        name: `|Z| ${esc(b.name)}`,
        line: { color, width: 1.8 },
      })
      if (b.type === 'bead2' || b.type === 'bead4') {
        traces.push({
          x: f,
          y: z.map((q) => q.re),
          name: `R ${esc(b.name)}`,
          line: { color, width: 1, dash: 'dash' },
        })
        traces.push({
          x: f,
          y: z.map((q) => Math.abs(q.im)),
          name: `|X| ${esc(b.name)}`,
          line: { color, width: 1, dash: 'dot' },
        })
      }
    })
    layout = makeLayout(C, {
      yaxis: ax({
        type: 'log',
        title: { text: '|Z| (Ω)' },
        exponentformat: 'SI',
      }),
      shapes: vlines(marks),
    })
    note =
      'Impedance of each block on its own (series blocks: element impedance; shunt blocks: branch impedance to ground).'
  } else {
    const cand = S.blocks.filter((b) => b.on && dampKey(b))
    if (!cand.length) {
      layout = makeLayout(C, {
        annotations: [
          {
            text: 'Add an Rd-Cd leg or inductor damping to sweep Rd.',
            xref: 'paper',
            yref: 'paper',
            x: 0.5,
            y: 0.5,
            showarrow: false,
          },
        ],
      })
    } else {
      const b = cand.find((x) => x.id === S.plot.sweepId) || cand[0]
      const key = dampKey(b)!
      // The x axis is the total damping R. For an Rd-Cd leg that is Rd + Cd ESR,
      // so a leg damped only by an e-cap ESR (Rd = 0) is centred on its ESR,
      // not on 0.
      const esr = b.type === 'rc' ? b.esr : 0
      const cur =
        ((b.type === 'rc' ? b.rd : b.type === 'ind' ? b.dR : 0) || 0) + esr
      const sec = sectionOf(S, b.id)
      const center = cur > 0 ? cur : sec ? sec.Z0 : 1
      const lo = Math.max(center / 100, esr),
        hi = center * 100 // Rd ≥ 0, so total ≥ ESR
      const tot: number[] = []
      for (let i = 0; i <= 50; i++) tot.push(lo * (hi / lo) ** (i / 50))
      const sw = sweepParam(
        S,
        b.id,
        key,
        tot.map((t) => Math.max(0, t - esr))
      )
      const best = sw.reduce<{ peak: number; x: number }>(
        (a, c, i) => (c.peak < a.peak ? { peak: c.peak, x: tot[i] } : a),
        { peak: sw[0].peak, x: tot[0] }
      )
      traces.push({
        x: tot,
        y: sw.map((s) => s.peak),
        name: 'peak |Zout|',
        line: { color: C.a, width: 2.2 },
      })
      traces.push({
        x: tot,
        y: sw.map((s) => s.hfsw),
        name: '|H| at fsw (dB)',
        yaxis: 'y2',
        line: { color: C.d, width: 1.4, dash: 'dash' },
      })
      const lim = Math.abs(m.rn.min) / 10 ** (cv.k / 20)
      traces.push({
        x: [tot[0], tot[tot.length - 1]],
        y: [lim, lim],
        name: `|Rn|−${cv.k} dB`,
        mode: 'lines',
        line: { color: C.bad, width: 1, dash: 'dot' },
      })
      traces.push({
        x: [cur],
        y: [m.peak.v],
        mode: 'markers',
        name: 'current',
        marker: { color: C.a, size: 10, symbol: 'diamond' },
      })
      traces.push({
        x: [best.x],
        y: [best.peak],
        mode: 'markers',
        name: 'best on grid',
        marker: { color: C.d, size: 9 },
      })
      layout = makeLayout(C, {
        hovermode: 'x unified',
        xaxis: ax({
          type: 'log',
          title: {
            text: `${esc(b.name)}: ${b.type === 'rc' ? 'Rd + Cd ESR' : 'Rd'} (Ω)`,
          },
          exponentformat: 'SI',
        }),
        yaxis: ax({
          type: 'log',
          title: { text: 'peak |Zout| (Ω)' },
          exponentformat: 'SI',
        }),
        yaxis2: ax({
          title: { text: '|H| fsw (dB)' },
          overlaying: 'y',
          side: 'right',
        }),
        margin: { l: 62, r: 56, t: 10, b: 44 },
      })
      note = `Sweeps the damping R of ${b.name} from 1/100× to 100× its value.`
      sweepInfo = {
        choices: cand.map((c) => ({ id: c.id, name: c.name })),
        current: b.id,
      }
    }
  }
  return { main: { traces, layout }, side, note, sweep: sweepInfo }
}

/**
 * Conducted EMI tab: predicted harmonics at the worst full-load Vin corner,
 * the no-filter spectrum and the limit lines; beside it, the filter
 * attenuation against the attenuation needed per harmonic. The plot shows
 * single harmonics; the card applies the RBW sum.
 */
function emiPlot(S: Design, C: PlotColors): PlotResult {
  const r = emiResult(S)
  const { std, cls, margin } = S.emi
  const info = EMI_STDS[std]
  const bands = bandsOf(std, cls)
  const sp = r.spectra[r.worstCorner]
  const pts = (sp?.pts ?? []).filter((p) => p.c > 0)
  const f = pts.map((p) => p.f)
  const ax = (extra: Obj) => ({ ...axisBase(C), ...extra })
  const xaxis = ax({
    type: 'log',
    title: { text: 'Frequency (Hz)' },
    exponentformat: 'SI',
    range: [Math.log10(150e3), Math.log10(info.fMax)],
  })
  const traces: Obj[] = [
    {
      x: f,
      y: pts.map((p) => dbuv(p.vBare)),
      name: 'no filter',
      mode: 'lines',
      line: { color: C.muted, width: 1, dash: 'dot' },
    },
    {
      x: f,
      y: pts.map((p) => dbuv(p.vPred)),
      name: 'predicted',
      mode: 'markers',
      marker: { color: C.a, size: 5 },
    },
  ]
  // Limit lines per band and detector; one legend entry per detector.
  const dets = [
    ['pk', 'peak limit', 'solid'],
    ['qp', 'QP limit', 'dot'],
    ['av', 'AV limit', 'dash'],
  ] as const
  for (const [k, name, dash] of dets) {
    let first = true
    for (const b of bands) {
      const l = b[k]
      if (l === undefined) continue
      traces.push({
        x: [b.fLo, b.fHi],
        y: [limVal(l, b, b.fLo), limVal(l, b, b.fHi)],
        name,
        legendgroup: k,
        showlegend: first,
        mode: 'lines',
        hoverinfo: 'skip',
        line: { color: C.bad, width: 1.5, dash },
      })
      first = false
    }
  }
  if (margin > 0) {
    let first = true
    for (const b of bands) {
      const lo = bandLimit(b, b.fLo) - margin,
        hi = bandLimit(b, b.fHi) - margin
      traces.push({
        x: [b.fLo, b.fHi],
        y: [lo, hi],
        name: `limit − ${margin} dB`,
        legendgroup: 'margin',
        showlegend: first,
        mode: 'lines',
        hoverinfo: 'skip',
        line: { color: C.c, width: 1, dash: 'dot' },
      })
      first = false
    }
  }
  // Deep sinc nulls would stretch the axis; show 80 dB below the lowest limit.
  const lows = bands.map((b) =>
    Math.min(bandLimit(b, b.fLo), bandLimit(b, b.fHi))
  )
  const highs = pts.map((p) => dbuv(p.vBare))
  const yLo = (lows.length ? Math.min(...lows) : 0) - 80
  const yHi = Math.max(yLo + 100, ...highs, ...lows) + 10
  const main: Figure = {
    traces,
    layout: makeLayout(C, {
      hovermode: 'closest',
      xaxis,
      yaxis: ax({ title: { text: 'dBµV' }, range: [yLo, yHi] }),
    }),
  }
  // Strictest limit per harmonic over the bands that hold it.
  const need: { f: number; a: number }[] = []
  for (const p of pts) {
    const lims = bands
      .filter((b) => p.f >= b.fLo && p.f <= b.fHi)
      .map((b) => bandLimit(b, p.f))
    if (lims.length)
      need.push({ f: p.f, a: dbuv(p.vBare) - (Math.min(...lims) - margin) })
  }
  const side: Figure = {
    traces: [
      {
        x: f,
        y: pts.map((p) => db(p.vBare / p.vPred)),
        name: 'filter attenuation',
        mode: 'lines',
        line: { color: C.a, width: 1.4 },
      },
      {
        x: need.map((n) => n.f),
        y: need.map((n) => n.a),
        name: 'needed',
        mode: 'markers',
        marker: { color: C.bad, size: 5 },
      },
    ],
    layout: makeLayout(C, {
      hovermode: 'closest',
      xaxis,
      yaxis: ax({ title: { text: 'attenuation (dB)' } }),
    }),
  }
  const parts = [
    `${info.label}, class ${cls}, ${info.lisn.name}, ${S.emi.lines} line${S.emi.lines > 1 ? 's' : ''}.`,
    sp ? `Worst corner: ${sp.label}.` : '',
    'Fixed fsw: one harmonic reads the same on every detector.',
    r.rbwSum
      ? 'Harmonics closer than RBW/2 are summed in the card, not here.'
      : '',
    'Limits ASSUMED until checked against the standard.',
  ]
  return { main, side, note: parts.filter(Boolean).join(' ') }
}
