import { describe, expect, it } from 'vitest'
import { db, emiResult, metrics, type Design } from '../engine'
import { fmtSI } from '../lib/si'
import { buildPreset, PRESET_NAMES } from '../state/presets'
import { REPORT_FIGURES, reportMarkdown, type ReportOptions } from './report'

// Port of parse_kv in report_figs.py (document-archive).
function parseKv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#') || !line.includes(':'))
      continue
    const i = line.indexOf(':')
    const k = line.slice(0, i)
    let v = line.slice(i + 1).trim()
    if (v && '"\''.includes(v[0]) && v.slice(1).includes(v[0])) {
      v = v.slice(1, v.indexOf(v[0], 1))
    } else {
      if (v.startsWith('#') && !/^#[0-9A-Fa-f]{6}(\s|$)/.test(v)) v = ''
      v = v.replace(/\s+#.*$/, '').trim()
    }
    out[k.trim().toLowerCase()] = v
  }
  return out
}

const ALLOWED = [
  'title',
  'subtitle',
  'short_title',
  'author',
  'doc_no',
  'date',
  'revision',
  'kicker',
  'specs',
  'note',
  'subscripts',
]

const OPTS: ReportOptions = {
  author: 'A. Engineer',
  docNo: 'XX-DR-1',
  date: 'Nov 4, 2026',
  revision: '0.1',
  link: 'https://x.test/#d=AAAA',
  toolUrl: 'https://x.test/',
}

const front = (md: string) => {
  const lines = md.split('\n')
  expect(lines[0]).toBe('---')
  const end = lines.indexOf('---', 1)
  expect(end).toBeGreaterThan(0)
  return lines.slice(1, end).join('\n')
}

const d4 = (): Design => {
  const i = PRESET_NAMES.findIndex((n) => n.startsWith('D4'))
  expect(i).toBeGreaterThanOrEqual(0)
  return buildPreset(i)
}

describe('reportMarkdown', () => {
  it('D4 has the margin, peak and all figures', () => {
    const st = d4()
    const md = reportMarkdown(st, OPTS)
    const m = metrics(st)
    expect(md).toContain('26.8 dB')
    expect(md).toContain(`${m.margin.toFixed(1)} dB`)
    expect(md).toContain(fmtSI(m.peak.v, 'Ω'))
    expect(md).toContain(`${db(m.ripple.hfsw).toFixed(1)} dB`)
    expect(md).toContain(fmtSI(m.dc.loss, 'W'))
    for (const f of REPORT_FIGURES) expect(md).toContain(`](${f}){width=92%}`)
    expect(md).toContain('## 7. Method')
    expect(md).toContain('## 4. Conducted EMI')
    const r = emiResult(st)
    const w = r.rows[r.worst]
    expect(md).toContain(`margin ${w.margin!.toFixed(1)} dB (${w.corner})`)
    expect(md).toContain('| MW | 530 kHz – 1.8 MHz | 54 / 41 / 34 |')
    expect(md).toContain(OPTS.link)
    const kv = parseKv(front(md))
    expect(kv.title).toBe('D4 bead final')
    expect(kv.doc_no).toBe('XX-DR-1')
    expect(kv.specs).toContain('fsw = 1.1 MHz')
    expect(Object.keys(kv).every((k) => ALLOWED.includes(k))).toBe(true)
  })

  it('notes appear, empty notes give None.', () => {
    const st = d4()
    expect(reportMarkdown(st, OPTS)).toMatch(/## 6\. Notes\n\nNone\.\n/)
    const noted = { ...st, notes: 'first line\n# Heading\n---\nlast' }
    const md = reportMarkdown(noted as Design, OPTS)
    expect(md).toContain('first line')
    expect(md).toContain('\n\n\\# Heading\n\n')
    expect(md).toContain('\n\n\\---\n\n')
    expect(md).not.toMatch(/^# /m)
    expect(md.split('\n').filter((l) => l === '---')).toHaveLength(2)
  })

  it.each([
    ['colon: here', 'colon: here'],
    ['a # b', 'a # b'],
    ['#leading', '#leading'],
    ['say "hi"', 'say "hi"'],
    ["it's", "it's"],
    ['both "x" and \'y\'', 'both "x" and \'y\''],
    ['#both "x" and \'y\'', "#both ”x” and 'y'"],
    ['"starts', '"starts'],
    ["'starts", "'starts"],
    ['two\nlines', 'two lines'],
  ])('hostile name %j reads back', (name, want) => {
    const md = reportMarkdown({ ...d4(), name }, { ...OPTS, author: name })
    const kv = parseKv(front(md))
    expect(kv.title).toBe(want)
    expect(kv.short_title).toBe(want)
    expect(kv.author).toBe(want)
    expect(Object.keys(kv).every((k) => ALLOWED.includes(k))).toBe(true)
  })

  it('skips empty keys but keeps the title', () => {
    const md = reportMarkdown(
      { ...d4(), name: '' },
      { ...OPTS, author: '', docNo: '' }
    )
    const kv = parseKv(front(md))
    expect('author' in kv).toBe(false)
    expect('doc_no' in kv).toBe(false)
    expect('title' in kv).toBe(true)
  })

  it('escapes | in block names inside tables', () => {
    const st = d4()
    st.blocks = st.blocks.map((b, i) => (i === 0 ? { ...b, name: 'a|b' } : b))
    expect(reportMarkdown(st, OPTS)).toContain('Table: a|b')
  })
})
