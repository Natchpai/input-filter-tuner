// Design report text (report.md) for the PDF builder of the report archive.
// Pure: no DOM. The zip, the dialog and the figures are made elsewhere.
import {
  DAMP,
  EMI_STDS,
  TYPES,
  converters,
  db,
  emiResult,
  fcOf,
  metrics,
  pBus,
  rnOf,
  sensitivity,
  vinLow,
  type Band,
  type Block,
  type Design,
  type Lim,
  type TranResult,
  tranResult,
} from '../engine'
import { fmtSI } from '../lib/si'

export const REPORT_FIGURES = [
  'fig_schematic.svg',
  'fig_zout.svg',
  'fig_xfer.svg',
  'fig_zin.svg',
  'fig_emi.svg',
  'fig_hotplug.svg',
  'fig_loadstep.svg',
  'fig_ripple.svg',
] as const

export type ReportFigure = (typeof REPORT_FIGURES)[number]

const TIME_FIGURES: readonly ReportFigure[] = [
  'fig_hotplug.svg',
  'fig_loadstep.svg',
  'fig_ripple.svg',
]

/**
 * Figures of this design's report: the EMI figure only while EMI is on, the
 * time-domain figures only while that check is on.
 */
export const reportFigures = (st: Design): ReportFigure[] =>
  REPORT_FIGURES.filter(
    (f) =>
      (f !== 'fig_emi.svg' || st.emi.on) &&
      (!TIME_FIGURES.includes(f) || st.tran.on)
  )

export type ReportOptions = {
  author: string
  docNo: string
  date: string
  revision: string
  link: string
  toolUrl: string
}

const CAPTIONS: Record<ReportFigure, string> = {
  'fig_schematic.svg': 'Filter schematic',
  'fig_zout.svg': '|Zout| against |Rn|',
  'fig_xfer.svg': 'Transfer function',
  'fig_zin.svg': 'Input impedance Zin',
  'fig_emi.svg': 'Predicted conducted emissions against the limits',
  'fig_hotplug.svg': 'Hot-plug: converter-node voltage and source current',
  'fig_loadstep.svg': 'Load step: converter-node voltage and current',
  'fig_ripple.svg': 'Source ripple current over three switching periods',
}

const CTRL = /[\p{Cc}\p{Zl}\p{Zp}]/gu

/** One line of plain text: control characters become spaces. */
const oneLine = (s: unknown) =>
  String(s ?? '')
    .replace(CTRL, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * User text inside a line: one line, with `*` and `_` escaped, so a name
 * like "C*in" or "C_{x}" is not read as bold, italic or a subscript.
 */
const txt = (s: unknown) => oneLine(s).replace(/[*_]/g, '\\$&')

/** A table cell: user text with `|` escaped. */
const cell = (s: unknown) => txt(s).replace(/\|/g, '\\|')

/**
 * Front matter value. The builder reads flat `key: value` lines, not YAML:
 * a value is quoted only when it starts with a quote, and ` #` starts a
 * comment in an unquoted value.
 */
export function fmValue(s: unknown): string {
  let v = oneLine(s)
  const hasD = v.includes('"'),
    hasS = v.includes("'")
  if (!/^["'#]/.test(v) && !v.includes(' #')) return v
  if (hasD && hasS) {
    v = v.replace(/"/g, '”')
    return `"${v}"`
  }
  return hasD ? `'${v}'` : `"${v}"`
}

const table = (head: [string, string], rows: [string, string][]) =>
  [
    `| ${head[0]} | ${head[1]} |`,
    '| --- | --- |',
    ...rows.map(([k, v]) => `| ${cell(k)} | ${cell(v)} |`),
  ].join('\n')

function blockRows(b: Block): [string, string][] {
  const rows: [string, string][] = []
  for (const p of TYPES[b.type].p) {
    const v = (b as unknown as Record<string, number>)[p.key]
    if (typeof v !== 'number') continue
    rows.push([p.label, fmtSI(v, p.unit)])
  }
  if (b.type === 'ind') {
    rows.push(['Damping', DAMP[b.dmode]])
    if (b.dmode !== 'none') rows.push(['Rd', fmtSI(b.dR, 'Ω')])
    if (b.dmode === 'RLpar' || b.dmode === 'RLser')
      rows.push(['Ld', fmtSI(b.dL, 'H')])
  }
  return rows
}

/**
 * Keep user lines from starting a heading, a rule, a code fence, an equation
 * ($$), a figure (![), a table (|), a note box (>) or a page break
 * (a whole line `\pagebreak` or `<!-- pagebreak -->`).
 */
const PAGEBREAK = /^\s*(\\pagebreak|<!--\s*pagebreak\s*-->)\s*$/
const safeLine = (l: string) =>
  /^\s*(#|-{3}|={3}|`{3}|~{3}|\$\$|!\[|\||>)/.test(l) || PAGEBREAK.test(l)
    ? '\\' + l.trimStart()
    : l

function notesText(st: Design): string {
  const raw = (st as { notes?: unknown }).notes
  const s = typeof raw === 'string' ? raw : ''
  const lines = s
    .replace(/\r\n?/g, '\n')
    .replace(/(?!\n)[\p{Cc}\p{Zl}\p{Zp}]/gu, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
    .map(safeLine)
  return lines.length ? lines.join('\n\n') : 'None.'
}

const limText = (l: Lim | undefined) =>
  l === undefined ? '–' : typeof l === 'number' ? String(l) : `${l[0]}→${l[1]}`

/** Section 4: EMI settings, verdict and the per-band table. */
function emiText(st: Design): string {
  const e = st.emi,
    info = EMI_STDS[e.std]
  const r = emiResult(st)
  const w = r.worst >= 0 ? r.rows[r.worst] : null
  const dB = (v: number) => `${v.toFixed(1)} dB`
  const head = [
    `- Standard: ${info.label}, class ${cell(e.cls)}; ${info.lisn.name}, ${e.lines} line(s). The AN replaces Rsrc and Lsrc.`,
    `- Converter current: trapezoid, edge time ${fmtSI(e.tr, 's')}, ${convText(st)}; every full-load Vin corner.`,
    `- Design margin below the limit: ${e.margin} dB.`,
    w
      ? `- Result: **${r.pass ? 'Pass' : 'Fail'}**. Worst ${cell(w.band.name)} at ${fmtSI(w.f!, 'Hz')}, margin ${dB(w.margin!)} (${cell(w.corner)}).`
      : '- Result: no harmonic falls inside a limit band.',
    r.f0Max === null
      ? '- No filter attenuation needed.'
      : `- A 2nd-order LC needs f0 ≤ ${fmtSI(r.f0Max, 'Hz')} (40 dB/dec).`,
  ]
  if (r.rbwSum)
    head.push('- Harmonics closer than RBW/2 are added in amplitude.')
  if (r.dropout.length)
    head.push(
      `- Out of regulation at ${cell(r.dropout.join('; '))} (Vout ≥ Vin·η): no ripple predicted there.`
    )
  const rows = r.rows.map((x) => {
    const lims = `${limText(x.band.pk)} / ${limText(x.band.qp)} / ${limText(x.band.av)}`
    const range = `${fmtSI(x.band.fLo, 'Hz')} – ${fmtSI(x.band.fHi, 'Hz')}`
    if (x.margin === null)
      return `| ${cell(x.band.name)} | ${range} | ${lims} | – | – | no harmonic | – |`
    return `| ${cell(x.band.name)} | ${range} | ${lims} | ${fmtSI(x.f!, 'Hz')} | ${x.pred!.toFixed(1)} dBµV | ${dB(x.margin)} | ${dB(Math.max(0, x.aReq!))} |`
  })
  return [
    ...head,
    '',
    '| Band | Range | Pk / QP / AV (dBµV) | Worst f | Predicted | Margin | Needed |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    'Limit values are taken from public summaries of the standards and must be checked against the standard text.',
  ].join('\n')
}

/** Time domain section: settings, worst cases and the per-Vin table. */
function timeText(st: Design, r: TranResult): string {
  const t = st.tran
  const h = r.hot[r.hotWorst],
    s = r.step[r.stepWorst]
  const bad = r.step.find((x) => x.status === 'unstable')
  const many = converters(st).length > 1
  const pl = Math.min(Math.max(0, pBus(st, 'light')), pBus(st, 'full'))
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`
  const head = [
    `- Hot-plug: ideal step through Rsrc + Lsrc and a cable of ${fmtSI(t.lCable, 'H')}, ${fmtSI(t.rCable, 'Ω')}; ${many ? 'converters' : 'converter'} off; every Vin.`,
    many
      ? `- Load step: every converter steps together, bus total ${fmtSI(pl, 'W')} → ${fmtSI(pBus(st, 'full'), 'W')} and back, each I = P/(η·V); every Vin.`
      : `- Load step: constant power ${fmtSI(pl, 'W')} → ${fmtSI(st.conv.pout, 'W')} and back, I = P/(η·V); every Vin.`,
    `- Worst hot-plug: V peak ${fmtSI(h.vPeak, 'V')} (${pct(h.overshoot)}) at ${fmtSI(h.vin, 'V')}` +
      (h.iPeak !== null
        ? `, inrush ${fmtSI(h.iPeak, 'A')}, I²t ${fmtSI(h.i2t, 'A²s')}.`
        : '; no inrush with cable L = 0.'),
    bad
      ? `- Load step: **unstable** at ${fmtSI(bad.vin, 'V')}; the ringing grows under constant power.`
      : `- Worst load step: V min ${fmtSI(s.vMin, 'V')} (dip ${fmtSI(s.droop, 'V')}) at ${fmtSI(s.vin, 'V')}.`,
    `- Source ripple at ${fmtSI(r.ripple.vin, 'V')}, full load: ${fmtSI(r.ripple.pp, 'A')} p-p.`,
  ]
  if (h.nodePeaks.length)
    head.push(
      `- Peak voltage at each shunt part (hot-plug, ${fmtSI(h.vin, 'V')}): ` +
        h.nodePeaks
          .map((p) => `${cell(p.name)} ${fmtSI(p.v, 'V')}`)
          .join(', ') +
        '.'
    )
  const rows = r.hot.map((x, i) => {
    const q = r.step[i]
    const ok = q.status !== 'unstable'
    return (
      `| ${fmtSI(x.vin, 'V')} | ${fmtSI(x.vPeak, 'V')} (${pct(x.overshoot)}) | ${fmtSI(x.iPeak, 'A')} | ${fmtSI(x.i2t, 'A²s')} | ` +
      `${ok ? fmtSI(q.vMin, 'V') : '–'} | ${ok ? fmtSI(q.vMax, 'V') : '–'} | ` +
      `${ok && Number.isFinite(q.settleUp) ? fmtSI(q.settleUp, 's') : '–'} | ${q.status === 'settled' ? x.status : q.status} |`
    )
  })
  return [
    ...head,
    '',
    '| Vin | V peak | Inrush | I²t | V min | V max | Settle | Status |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n')
}

/** fsw and phases of each converter, for one line of text. */
const sensUnit = (key: string) =>
  key === 'L' || key === 'lb' || key === 'dL'
    ? 'H'
    : key === 'c' || key === 'cd'
      ? 'F'
      : 'Ω'
const signedDb = (v: number) =>
  (Math.abs(v) < 0.005
    ? '0.00'
    : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2)) + ' dB'

/** Sensitivity table (M3): +10 % per part, largest margin change first. */
function sensText(st: Design): string {
  const s = sensitivity(st)
  if (s.rows.length === 0) return 'No part values to vary.'
  return [
    `Each part +${Math.round(s.step * 100)} % on its own. Margin at Vin min, full load (${s.margin.toFixed(1)} dB); attenuation at ${fmtSI(s.fr, 'Hz')} (${s.att.toFixed(1)} dB). Positive is better.`,
    '',
    '| Part | Value | Δ margin | Δ attenuation |',
    '| --- | --- | --- | --- |',
    ...s.rows.map(
      (r) =>
        `| ${cell(r.label)} | ${cell(fmtSI(r.value, sensUnit(r.key)))} | ${signedDb(r.dMargin)} | ${signedDb(r.dAtt)} |`
    ),
  ].join('\n')
}

function convText(st: Design): string {
  const us = converters(st)
  if (us.length === 1) return `${st.conv.phases} phase(s)`
  return us
    .map((u) => `${txt(u.name)} ${fmtSI(u.fsw, 'Hz')} × ${u.phases}`)
    .join(', ')
}

const bandRange = (b: Band) => `${fmtSI(b.fLo, 'Hz')} to ${fmtSI(b.fHi, 'Hz')}`

/** Converter table: one row per converter that is on, then the bus. */
function convTable(st: Design): string {
  const cv = st.conv
  const lo = vinLow(cv)
  const us = converters(st)
  const rows = us.map(
    (u) =>
      `| ${cell(u.name)} | ${fmtSI(u.pout, 'W')} | ${fmtSI(Math.min(u.pLight, u.pout), 'W')} | ${u.eta.toFixed(3)} | ${fmtSI(u.vout, 'V')} | ${fmtSI(u.fsw, 'Hz')} | ${u.phases} | ${fmtSI(fcOf(u), 'Hz')} | ${fmtSI(rnOf(u, lo), 'Ω')} |`
  )
  const fcs = us.map(fcOf)
  return [
    `Table: Converters on the bus (Rn at Vin min = ${fmtSI(lo, 'V')})`,
    '| Converter | P | P light | η | Vout | fsw | Phases | f check | Rn |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
    `| Bus | ${fmtSI(pBus(st, 'full'), 'W')} | ${fmtSI(pBus(st, 'light'), 'W')} | – | – | – | – | ${fmtSI(Math.min(...fcs), 'Hz')} – ${fmtSI(Math.max(...fcs), 'Hz')} | ${fmtSI(metrics(st).rn.min, 'Ω')} |`,
  ].join('\n')
}

export function reportMarkdown(
  st: Design,
  opts: ReportOptions,
  /** Time-domain result, if already computed; else computed here when on. */
  tran?: TranResult
): string {
  const m = metrics(st)
  const cv = st.conv,
    p = m.prim
  const us = converters(st)
  const many = us.length > 1
  const OHM = 'Ω'
  const fsw = fmtSI(cv.fsw, 'Hz')
  const fsws = [...new Set(us.map((u) => u.fsw))]
    .sort((a, b) => a - b)
    .map((f) => fmtSI(f, 'Hz'))
    .join(', ')
  // The |Rn| the margin is taken against: the limiting band's with several
  // bands, else the bus |Rn| at Vin min.
  const rnLim = Math.abs(
    m.bands.length > 1 ? m.bands[m.limitBand].rn : m.rn.min
  )
  const kLim = fmtSI(rnLim / 10 ** (cv.k / 20), OHM)
  const on = st.blocks.filter((b) => b.on)
  const margin = `${m.margin.toFixed(1)} dB`
  const verdict = m.unstableAt
    ? `Unstable: Nyquist encircles −1 at ${fmtSI(m.unstableAt, 'Hz')}`
    : m.pass
      ? `Pass (need ≥ ${cv.k} dB)`
      : `Fail (need ≥ ${cv.k} dB)`

  const fm: [string, string][] = [
    ['title', st.name || 'Input filter design'],
    ['subtitle', 'Input filter for a switching converter'],
    ['short_title', st.name],
    ['author', opts.author],
    ['doc_no', opts.docNo],
    ['date', opts.date],
    ['revision', opts.revision],
    ['kicker', 'Input Filter Design Notes'],
    [
      'specs',
      `Input = ${fmtSI(cv.vinNom, 'V')}, ${fmtSI(pBus(st, 'full'), 'W')} | fsw = ${fsws} | Filter = ${on.map((b) => b.name.replace(/\|/g, '/')).join(', ') || 'none'}`,
    ],
    [
      'note',
      `Margin to |Rn| ${margin}, need ≥ ${cv.k} dB. Check part values against the data sheets.`,
    ],
    ['subscripts', 'Rn, Z0, f0, fsw, Rs, Ls, Rd, Cd, Ld, Vin'],
  ]
  const front = fm
    .map(([k, v]) => [k, fmValue(v)] as const)
    .filter(([k, v]) => k === 'title' || v !== '')
    .map(([k, v]) => `${k}: ${v}`)

  const inputs = [
    many
      ? table(
          ['Parameter', 'Value'],
          [
            [
              'Vin min / nom / max',
              `${fmtSI(cv.vinMin, 'V')} / ${fmtSI(cv.vinNom, 'V')} / ${fmtSI(cv.vinMax, 'V')}`,
            ],
            ['Converters on the bus', String(us.length)],
            [
              'Bus Rn at Vin min / nom / max',
              `${fmtSI(m.rn.min, OHM)} / ${fmtSI(m.rn.nom, OHM)} / ${fmtSI(m.rn.max, OHM)}`,
            ],
            ['Margin required k', `${cv.k} dB`],
          ]
        ) +
        '\n\n' +
        convTable(st)
      : table(
          ['Parameter', 'Value'],
          [
            [
              'Vin min / nom / max',
              `${fmtSI(cv.vinMin, 'V')} / ${fmtSI(cv.vinNom, 'V')} / ${fmtSI(cv.vinMax, 'V')}`,
            ],
            ['Vout', fmtSI(cv.vout, 'V')],
            ['P (output)', fmtSI(cv.pout, 'W')],
            ['Efficiency η', cv.eta.toFixed(3)],
            ['fsw', fsw],
            ['Phases', String(cv.phases)],
            [
              'Rn at Vin min / nom / max',
              `${fmtSI(m.rn.min, OHM)} / ${fmtSI(m.rn.nom, OHM)} / ${fmtSI(m.rn.max, OHM)}`,
            ],
            ['Margin required k', `${cv.k} dB`],
            ['fcheck', fmtSI(cv.fcheck, 'Hz')],
          ]
        ),
    '',
    table(
      ['Source', 'Value'],
      [
        ['Rsrc', fmtSI(st.source.R, OHM)],
        ['Lsrc', fmtSI(st.source.L, 'H')],
      ]
    ),
  ].join('\n')

  const parts = on.length
    ? on
        .map(
          (b) =>
            `Table: ${txt(b.name)} (${TYPES[b.type].kind}, ${oneLine(TYPES[b.type].label)})\n` +
            table(['Parameter', 'Value'], blockRows(b))
        )
        .join('\n\n')
    : 'No enabled parts.'

  const res: [string, string][] = [
    [
      'Peak |Zout|',
      `${fmtSI(m.peak.v, OHM)} at ${fmtSI(m.peak.f, 'Hz')}${m.peakIsEdge ? ' (range edge)' : ''}`,
    ],
    [
      'Margin to |Rn| (Middlebrook)',
      `${margin}, ${verdict}; |Rn| ${fmtSI(rnLim, OHM)}, limit line ${kLim}` +
        (m.bands.length > 1
          ? `; limited by band ${bandRange(m.bands[m.limitBand])} (${m.bands[m.limitBand].names.join(', ')})`
          : ''),
    ],
  ]
  if (m.bands.length > 1)
    m.bands.forEach((b, i) =>
      res.push([
        `Band ${i + 1}: ${bandRange(b)} (${b.names.join(', ')})`,
        `|Rn| ${fmtSI(Math.abs(b.rn), OHM)}, peak ${fmtSI(b.peak.v, OHM)} at ${fmtSI(b.peak.f, 'Hz')}, ${b.margin.toFixed(1)} dB`,
      ])
    )
  if (p && m.qSeries !== null && m.qeff !== null) {
    res.push(
      ['Z0', fmtSI(p.Z0, OHM)],
      ['f0', `${fmtSI(p.f0, 'Hz')} (${p.block.name} with ${fmtSI(p.C, 'F')})`],
      ['Q = Re(Zout(f0))/Z0 (series form)', m.qSeries.toFixed(2)],
      ['Peak/Z0', m.qeff.toFixed(2)]
    )
  }
  const fr = fmtSI(m.ripple.fr, 'Hz')
  const rw = m.ripple.per[m.ripple.worst]
  res.push(
    [
      many
        ? `Lowest attenuation (${rw.name} at ${fr})`
        : `Attenuation at ${fr}`,
      `${(-db(m.ripple.hfr)).toFixed(1)} dB`,
    ],
    [
      many
        ? 'Highest |H| at a converter fsw (converter side open)'
        : '|H| at fsw (converter side open)',
      `${db(m.ripple.hfsw).toFixed(1)} dB`,
    ],
    ...(many
      ? m.ripple.per.map((r): [string, string] => [
          `${r.name}: fr / ripple harmonic / attenuation`,
          `${fmtSI(r.fr, 'Hz')} / ${fmtSI(r.ih, 'A')} / ${(-db(r.hfr)).toFixed(1)} dB`,
        ])
      : []),
    ['Source ripple current (rms)', fmtSI(m.ripple.isrc / Math.SQRT2, 'A')],
    ['Ripple voltage at converter pins (peak)', fmtSI(m.ripple.vout, 'V')],
    ['DC series R (incl. source)', fmtSI(m.dc.r, OHM)],
    ['DC input current (Vin min)', fmtSI(m.dc.iin, 'A')],
    [
      'DC loss (Vin min)',
      `${fmtSI(m.dc.loss, 'W')}, ${m.dc.pct.toFixed(2)} % of ${many ? 'bus P' : 'P'}, drop ${fmtSI(m.dc.drop, 'V')}`,
    ]
  )

  const figures = reportFigures(st)
    .map((f) => `![${CAPTIONS[f]}](${f}){width=92%}`)
    .join('\n\n')
  const method = [
    '- Rn = −Vin²·η/P is flat and holds up to fcheck, so the peak search and the Nyquist scan stop there.',
    '- Zout is seen from the converter with the source voltage shorted. Rsrc and Lsrc stay in the path.',
    '- Q is the series form Re(Zout(f0))/Z0.',
  ]
  if (many)
    method.push(
      '- Several converters: each one counts in the bus Rn = −Vin²/Σ(P/η) up to its own f check and drops out above it. The check range is split at each f check, and the margin is the lowest over the bands. Ripple at the same frequency adds in phase; different frequencies add as root-sum-square.'
    )
  if (st.emi.on)
    method.push(
      '- EMI: harmonic n of the trapezoid input current, c_n = 2·Io·|sin(nπD)|/(nπ)·|sinc(nπ·tr·fsw)| (multiples of N only), through the filter into the AN impedance (jωL + R) ∥ 50 Ω. Fixed fsw, so one harmonic reads the same on every detector.'
    )
  if (st.tran.on)
    method.push(
      '- Time domain: modified nodal analysis of the same R, L, C elements, fixed-step trapezoidal integration with backward-Euler steps after each step change; the step is halved until the peaks agree within 0.1 %. Linear C(V) and L(I) at each corner, no tolerances, no converter loop.'
    )
  // Sections are numbered in order; Conducted EMI and Time domain are there
  // only while on.
  const sections: [string, string][] = [
    ['Inputs', inputs],
    ['Parts', parts],
    ['Results', table(['Quantity', 'Value'], res)],
    ['Sensitivity', sensText(st)],
    ...(st.emi.on
      ? ([['Conducted EMI', emiText(st)]] as [string, string][])
      : []),
    ...(st.tran.on
      ? ([['Time domain', timeText(st, tran ?? tranResult(st))]] as [
          string,
          string,
        ][])
      : []),
    ['Figures', figures],
    ['Notes', notesText(st)],
    ['Method', method.join('\n')],
  ]

  return [
    '---',
    ...front,
    '---',
    '',
    ...sections.flatMap(([h, body], k) => [`## ${k + 1}. ${h}`, '', body, '']),
    `Made with Input Filter Tuner: ${oneLine(opts.toolUrl)}. Reopen this design: ${oneLine(opts.link)}`,
    '',
  ].join('\n')
}
