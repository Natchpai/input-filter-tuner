// Design report as a zip: <folder>/report.md and the four figures, in the
// light palette, ready for the report archive. Needs a DOM.
import { strToU8, zipSync } from 'fflate'
import { type Design, metrics, type TabKey } from '../engine'
import { curveSets } from '../plots/curves'
import { buildPlot } from '../plots/traces'
import {
  type REPORT_FIGURES,
  type ReportOptions,
  reportMarkdown,
} from './report'
import { plotSvgText, readLightColors, schematicSvg } from './svg'

const PLOT_FIGS: [(typeof REPORT_FIGURES)[number], TabKey][] = [
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
  const sets = curveSets(st)
  const m = metrics(st)
  const files: Record<string, Uint8Array> = {
    'report.md': strToU8(reportMarkdown(st, opts)),
    'fig_schematic.svg': strToU8(schematicSvg(schematic)),
  }
  for (const [file, tab] of PLOT_FIGS) {
    const s = { ...st, plot: { ...st.plot, tab } }
    // Figures show the design alone, without overlays.
    const fig = buildPlot(s, sets, m, [], colors).main
    files[file] = strToU8(await plotSvgText(fig, 1000, 560))
  }
  const zip = zipSync({ [folder]: files }, { level: 6 })
  return { name: folder + '.zip', data: new Uint8Array(zip) }
}
