// Writes the parity reference: every preset of the old single-file tool, run
// through its own engine. Run once from the repo root while legacy/index.html
// still exists:
//   node scripts/legacy-fixture.mjs
// The output is committed and stays after legacy/ is removed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const html = readFileSync(join(root, 'legacy', 'index.html'), 'utf8')
const engineSrc = html.split('// ENGINE-START')[1].split('// ENGINE-END')[0]
const stateSrc = html
  .split('// ---------- State ----------')[1]
  .split('let S = null;')[0]
const { Engine: E, PRESETS } = new Function(
  engineSrc +
    '\nconst E = Engine;\n' +
    stateSrc +
    '\nreturn { Engine, PRESETS };'
)()

// Same as loadPreset() in the old UI.
function build(p) {
  const S = p.make()
  const opt = p.optimize === undefined ? [] : [].concat(p.optimize)
  for (const k of opt) {
    const b = S.blocks[k]
    const key = E.dampKey(b)
    if (key) b[key] = E.optimizeParam(S, b.id, key, 1e-3, 1e3).val
  }
  return S
}

// JSON has no Infinity or NaN; keep them as strings.
const n = (v) =>
  v === null || v === undefined
    ? null
    : Number.isFinite(v)
      ? v
      : String(v)
const c = (z) => [n(z.re), n(z.im)]

const FREQS = Array.from({ length: 40 }, (_, i) => 10 ** (1 + (7 * i) / 39))

const presets = PRESETS.map((p) => {
  const S = build(p)
  const m = E.metrics(S)
  const byIndex = (obj) =>
    S.blocks.map((b) => (b.id in obj ? n(obj[b.id]) : null))
  const blocks = S.blocks.map((b) => {
    const out = {}
    for (const [k, v] of Object.entries(b)) if (k !== 'id') out[k] = v
    return out
  })
  return {
    name: p.name,
    state: { ...S, blocks },
    metrics: {
      rn: m.rn,
      peak: { v: n(m.peak.v), f: n(m.peak.f), edge: m.peak.edge },
      margin: n(m.margin),
      pass: m.pass,
      unstableAt: n(m.unstableAt),
      prim: m.prim
        ? {
            name: m.prim.block.name,
            L: m.prim.L,
            C: m.prim.C,
            Z0: m.prim.Z0,
            f0: m.prim.f0,
            rL: m.prim.rL,
          }
        : null,
      qeff: n(m.qeff),
      qSeries: n(m.qSeries),
      fLo: m.fLo,
      fHi: m.fHi,
      dc: { ...m.dc, perBlock: byIndex(m.dc.perBlock) },
      ripple: { ...m.ripple, perBlock: byIndex(m.ripple.perBlock) },
    },
    points: FREQS.map((f) => {
      const pt = E.point(S, f)
      return {
        f,
        Zout: c(pt.Zout),
        H: c(pt.H),
        Hopen: c(pt.Hopen),
        S21: c(pt.S21),
        Zin: c(pt.Zin),
        Tm: c(pt.Tm),
      }
    }),
  }
})

const out = join(
  root,
  'src',
  'features',
  'filter',
  'engine',
  '__fixtures__',
  'legacy-presets.json'
)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(
  out,
  JSON.stringify({ source: 'legacy/index.html', presets }, null, 1) + '\n'
)
console.log(`wrote ${presets.length} presets to ${out}`)
