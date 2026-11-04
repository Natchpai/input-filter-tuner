// Design report text (report.md) for the PDF builder of the report archive.
// Pure: no DOM. The zip, the dialog and the figures are made elsewhere.
import { DAMP, TYPES, db, metrics, type Block, type Design } from '../engine'
import { fmtSI } from '../lib/si'

export const REPORT_FIGURES = [
  'fig_schematic.svg',
  'fig_zout.svg',
  'fig_xfer.svg',
  'fig_zin.svg',
] as const

export type ReportOptions = {
  author: string
  docNo: string
  date: string
  revision: string
  link: string
  toolUrl: string
}

const CAPTIONS: Record<(typeof REPORT_FIGURES)[number], string> = {
  'fig_schematic.svg': 'Filter schematic',
  'fig_zout.svg': '|Zout| against |Rn|',
  'fig_xfer.svg': 'Transfer function',
  'fig_zin.svg': 'Input impedance Zin',
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

/** Keep user lines from starting a heading, a rule or a code fence. */
const safeLine = (l: string) =>
  /^\s*(#|-{3}|={3}|`{3}|~{3})/.test(l) ? '\\' + l.trimStart() : l

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
      `Input = ${fmtSI(cv.vinNom, 'V')}, ${fmtSI(cv.pout, 'W')} | fsw = ${fsw} | Filter = ${on.map((b) => b.name).join(', ') || 'none'}`,
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
    [`Attenuation at ${fr}`, `${db(m.ripple.hfr).toFixed(1)} dB`],
    ['|H| at fsw', `${db(m.ripple.hfsw).toFixed(1)} dB`],
    ['Source ripple current (rms)', fmtSI(m.ripple.isrc / Math.SQRT2, 'A')],
    ['Ripple voltage at converter pins (peak)', fmtSI(m.ripple.vout, 'V')],
    ['DC series R (incl. source)', fmtSI(m.dc.r, OHM)],
    ['DC input current (Vin min)', fmtSI(m.dc.iin, 'A')],
    [
      'DC loss (Vin min)',
      `${fmtSI(m.dc.loss, 'W')}, ${m.dc.pct.toFixed(2)} % of P, drop ${fmtSI(m.dc.drop, 'V')}`,
    ]
  )

  const figures = REPORT_FIGURES.map(
    (f) => `![${CAPTIONS[f]}](${f}){width=92%}`
  ).join('\n\n')

  return [
    '---',
    ...front,
    '---',
    '',
    '## 1. Inputs',
    '',
    inputs,
    '',
    '## 2. Parts',
    '',
    parts,
    '',
    '## 3. Results',
    '',
    table(['Quantity', 'Value'], res),
    '',
    '## 4. Figures',
    '',
    figures,
    '',
    '## 5. Notes',
    '',
    notesText(st),
    '',
    '## 6. Method',
    '',
    '- Rn = −Vin²·η/P is flat and holds up to fcheck, so the peak search and the Nyquist scan stop there.',
    '- Zout is seen from the converter with the source voltage shorted. Rsrc and Lsrc stay in the path.',
    '- Q is the series form Re(Zout(f0))/Z0.',
    '',
    `Made with Input Filter Tuner: ${oneLine(opts.toolUrl)}. Reopen this design: ${oneLine(opts.link)}`,
    '',
  ].join('\n')
}
