// Figure export: schematic SVG and plot images, always in the light palette.
// Needs a DOM. The light tokens come from an off-screen `.light-scope`
// element (see theme.css), so the page never flips theme.
import { type PlotColors, readColors } from '../plots/theme-colors'
import type { Figure } from '../plots/traces'

type PlotlyModule = typeof import('plotly.js-basic-dist-min').default
let plotlyPromise: Promise<PlotlyModule> | null = null
// Same module id as plots/plotly-chart.tsx, so the bundler shares one copy.
const loadPlotly = () =>
  (plotlyPromise ??= import('plotly.js-basic-dist-min').then((m) => m.default))

/** Run `fn` with an off-screen element that carries the light tokens. */
export function withLightScope<T>(fn: (host: HTMLElement) => T): T {
  const host = document.createElement('div')
  host.className = 'light-scope'
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:fixed;left:-99999px;top:0;pointer-events:none;visibility:hidden'
  document.body.appendChild(host)
  try {
    return fn(host)
  } finally {
    host.remove()
  }
}

/** The plot colours of the light theme. */
export const readLightColors = (): PlotColors => withLightScope(readColors)

let ctx2d: CanvasRenderingContext2D | null | undefined
/** Any CSS colour (oklch, color-mix, hex) to rgb, plus alpha. */
function toRgb(c: string): { rgb: string; a: number } | null {
  if (!c || c === 'none' || c === 'transparent') return null
  ctx2d ??= document.createElement('canvas').getContext('2d', {
    willReadFrequently: true,
  })
  if (!ctx2d) return null
  ctx2d.clearRect(0, 0, 1, 1)
  ctx2d.fillStyle = '#000'
  ctx2d.fillStyle = c
  ctx2d.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx2d.getImageData(0, 0, 1, 1).data
  if (a === 0) return null
  return { rgb: `rgb(${r},${g},${b})`, a: a / 255 }
}

function paint(el: Element, prop: 'fill' | 'stroke', value: string) {
  const c = toRgb(value)
  if (!c) {
    el.setAttribute(prop, 'none')
    return
  }
  el.setAttribute(prop, c.rgb)
  if (c.a < 0.999) el.setAttribute(`${prop}-opacity`, c.a.toFixed(3))
}

const STROKE_PROPS = [
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
]
const TEXT_PROPS = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
]

/**
 * Standalone SVG text of the schematic, in the light palette.
 * The live element is not touched.
 */
export function schematicSvg(
  el: SVGSVGElement,
  opts: { background?: boolean } = {}
): string {
  const { background = true } = opts
  return withLightScope((host) => {
    const clone = el.cloneNode(true) as SVGSVGElement
    host.appendChild(clone)
    clone.querySelectorAll('.hit, title').forEach((n) => n.remove())
    const hostCs = getComputedStyle(host)
    for (const n of Array.from(clone.querySelectorAll('*'))) {
      const cs = getComputedStyle(n)
      const tag = n.tagName.toLowerCase()
      if (tag !== 'g') {
        paint(n, 'fill', cs.fill)
        paint(n, 'stroke', cs.stroke)
        if (cs.stroke !== 'none') {
          for (const p of STROKE_PROPS)
            n.setAttribute(p, cs.getPropertyValue(p))
        }
      }
      if (tag === 'text' || tag === 'tspan') {
        for (const p of TEXT_PROPS) n.setAttribute(p, cs.getPropertyValue(p))
      }
      if (cs.opacity !== '1') n.setAttribute('opacity', cs.opacity)
    }
    for (const n of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
      n.removeAttribute('class')
      n.removeAttribute('style')
      n.removeAttribute('data-f')
    }
    const vb = clone.viewBox.baseVal
    const w = clone.getAttribute('width') ?? String(vb.width)
    const h = clone.getAttribute('height') ?? String(vb.height)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', w)
    clone.setAttribute('height', h)
    clone.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`)
    if (background) {
      const bg = toRgb(hostCs.getPropertyValue('--card').trim())
      if (bg) {
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        r.setAttribute('x', String(vb.x))
        r.setAttribute('y', String(vb.y))
        r.setAttribute('width', String(vb.width))
        r.setAttribute('height', String(vb.height))
        r.setAttribute('fill', bg.rgb)
        clone.insertBefore(r, clone.firstChild)
      }
    }
    return new XMLSerializer().serializeToString(clone)
  })
}

/**
 * Render a figure with Plotly. The caller builds the figure with
 * `readLightColors()`. SVG comes back as a data URL, PNG as a data URL too.
 */
export async function plotImage(
  figure: Figure,
  format: 'svg' | 'png',
  w: number,
  h: number,
  /** PNG pixel scale (default 2); SVG is always 1. */
  scale = 2
): Promise<string> {
  const Plotly = await loadPlotly()
  return Plotly.toImage(
    {
      data: figure.traces as Plotly.Data[],
      layout: figure.layout as Partial<Plotly.Layout>,
    },
    { format, width: w, height: h, scale: format === 'png' ? scale : 1 }
  )
}

/** Bytes of a data URL (base64 or URL-encoded). */
export function dataUrlBytes(url: string): Uint8Array<ArrayBuffer> {
  const i = url.indexOf(',')
  const body = url.slice(i + 1)
  if (url.slice(0, i).includes(';base64'))
    return Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return new TextEncoder().encode(decodeURIComponent(body))
}

/** Decoded SVG text of a figure (for the report zip). */
export async function plotSvgText(
  figure: Figure,
  w: number,
  h: number
): Promise<string> {
  return new TextDecoder().decode(
    dataUrlBytes(await plotImage(figure, 'svg', w, h))
  )
}
