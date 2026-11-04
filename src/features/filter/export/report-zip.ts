// Design report as a zip: <folder>/report.md and the figures of
// reportFigures() (EMI only when on), in the light palette, ready for the
// report archive. Needs a DOM.
import { strToU8, zipSync } from 'fflate'
import { cornerMetrics, type Design, metrics, type TabKey } from '../engine'
import { curveSets } from '../plots/curves'
import { buildPlot } from '../plots/traces'
import {
  type ReportFigure,
  reportFigures,
  type ReportOptions,
  reportMarkdown,
} from './report'
import { plotSvgText, readLightColors, schematicSvg } from './svg'

const PLOT_FIGS: [ReportFigure, TabKey][] = [
  ['fig_zout.svg', 'zout'],
  ['fig_xfer.svg', 'xfer'],
  ['fig_zin.svg', 'zin'],
  ['fig_emi.svg', 'emi'],
]

/** Folder (and zip) name: the doc no, else the design name. */
export const reportFolder = (st: Design, docNo: string) =>
  (docNo.trim() || st.name || 'filter-report')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 60) || 'filter-report'

export async function reportZip(
  st: Design,
  opts: ReportOptions,
  schematic: SVGSVGElement
): Promise<{ name: string; data: Uint8Array<ArrayBuffer> }> {
  const folder = reportFolder(st, opts.docNo)
  const colors = readLightColors()
  const cm = cornerMetrics(st)
  const sets = curveSets(st, cm.rows[cm.worst])
  const m = metrics(st)
  const files: Record<string, Uint8Array> = {
    'report.md': strToU8(reportMarkdown(st, opts)),
    'fig_schematic.svg': strToU8(schematicSvg(schematic)),
  }
  const want = reportFigures(st)
  for (const [file, tab] of PLOT_FIGS) {
    if (!want.includes(file)) continue
    const s = { ...st, plot: { ...st.plot, tab } }
    // Figures show the design alone, without overlays.
    const fig = buildPlot(s, sets, m, [], colors).main
    files[file] = strToU8(await plotSvgText(fig, 1000, 560))
  }
  const zip = zipSync({ [folder]: files }, { level: 6 })
  return { name: folder + '.zip', data: new Uint8Array(zip) }
}
