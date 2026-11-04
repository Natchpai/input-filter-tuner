// Design report text (report.md) for the PDF builder of the report archive.
// Pure: no DOM. The zip, the dialog and the figures are made elsewhere.
import {
  DAMP,
  EMI_STDS,
  TYPES,
  db,
  emiResult,
  metrics,
  type Block,
  type Design,
  type Lim,
} from '../engine'
import { fmtSI } from '../lib/si'

export const REPORT_FIGURES = [
  'fig_schematic.svg',
  'fig_zout.svg',
  'fig_xfer.svg',
  'fig_zin.svg',
  'fig_emi.svg',
] as const

export type ReportFigure = (typeof REPORT_FIGURES)[number]

/** Figures of this design's report: the EMI figure only while EMI is on. */
export const reportFigures = (st: Design): ReportFigure[] =>
  REPORT_FIGURES.filter((f) => f !== 'fig_emi.svg' || st.emi.on)

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
}

const CTRL = /[\p{Cc}\p{Zl}\p{Zp}]/gu

/** One line of plain text: control characters become spaces. */
const oneLine = (s: unknown) =>
  String(s ?? '')
    .replace(CTRL, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** A table cell: one line, `|` escaped. */
const cell = (s: unknown) => oneLine(s).replace(/\|/g, '\\|')

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
 * ($$), a figure (![), a table (|) or a note box (>).
 */
const safeLine = (l: string) =>
  /^\s*(#|-{3}|={3}|`{3}|~{3}|\$\$|!\[|\||>)/.test(l) ? '\\' + l.trimStart() : l

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
    `- Converter current: trapezoid, edge time ${fmtSI(e.tr, 's')}, ${st.conv.phases} phase(s); every full-load Vin corner.`,
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

export function reportMarkdown(st: Design, opts: ReportOptions): string {
  const m = metrics(st)
  const cv = st.conv,
    p = m.prim
  const OHM = 'Ω'
  const fsw = fmtSI(cv.fsw, 'Hz')
  const kLim = fmtSI(Math.abs(m.rn.min) / 10 ** (cv.k / 20), OHM)
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
      `Input = ${fmtSI(cv.vinNom, 'V')}, ${fmtSI(cv.pout, 'W')} | fsw = ${fsw} | Filter = ${on.map((b) => b.name.replace(/\|/g, '/')).join(', ') || 'none'}`,
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
    table(
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
            `Table: ${oneLine(b.name)} (${TYPES[b.type].kind}, ${oneLine(TYPES[b.type].label)})\n` +
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
      `${margin}, ${verdict}; |Rn| ${fmtSI(Math.abs(m.rn.min), OHM)}, limit line ${kLim}`,
    ],
  ]
  if (p && m.qSeries !== null && m.qeff !== null) {
    res.push(
      ['Z0', fmtSI(p.Z0, OHM)],
      ['f0', `${fmtSI(p.f0, 'Hz')} (${p.block.name} with ${fmtSI(p.C, 'F')})`],
      ['Q = Re(Zout(f0))/Z0 (series form)', m.qSeries.toFixed(2)],
      ['Peak/Z0', m.qeff.toFixed(2)]
    )
  }
  const fr = fmtSI(m.ripple.fr, 'Hz')
  res.push(
    [`Attenuation at ${fr}`, `${(-db(m.ripple.hfr)).toFixed(1)} dB`],
    ['|H| at fsw (converter side open)', `${db(m.ripple.hfsw).toFixed(1)} dB`],
    ['Source ripple current (rms)', fmtSI(m.ripple.isrc / Math.SQRT2, 'A')],
    ['Ripple voltage at converter pins (peak)', fmtSI(m.ripple.vout, 'V')],
    ['DC series R (incl. source)', fmtSI(m.dc.r, OHM)],
    ['DC input current (Vin min)', fmtSI(m.dc.iin, 'A')],
    [
      'DC loss (Vin min)',
      `${fmtSI(m.dc.loss, 'W')}, ${m.dc.pct.toFixed(2)} % of P, drop ${fmtSI(m.dc.drop, 'V')}`,
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
  if (st.emi.on)
    method.push(
      '- EMI: harmonic n of the trapezoid input current, c_n = 2·Io·|sin(nπD)|/(nπ)·|sinc(nπ·tr·fsw)| (multiples of N only), through the filter into the AN impedance (jωL + R) ∥ 50 Ω. Fixed fsw, so one harmonic reads the same on every detector.'
    )
  // Sections are numbered in order; Conducted EMI is there only while on.
  const sections: [string, string][] = [
    ['Inputs', inputs],
    ['Parts', parts],
    ['Results', table(['Quantity', 'Value'], res)],
    ...(st.emi.on
      ? ([['Conducted EMI', emiText(st)]] as [string, string][])
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
