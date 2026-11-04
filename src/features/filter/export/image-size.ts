// Size, format and font of a saved plot image. Pure: no DOM, no storage.
import type { Figure } from '../plots/traces'

export type ImgFormat = 'svg' | 'png'

/** id, label, width, height. `screen` reads the plot on the page. */
export const IMG_PRESETS = [
  ['report', 'Report', 1000, 560],
  ['slide', 'Slide 16:9', 1600, 900],
  ['column', 'Two-column paper', 700, 450],
  ['square', 'Square', 800, 800],
  ['screen', 'Match screen', 0, 0],
  ['custom', 'Custom', 0, 0],
] as const

export type ImgPreset = (typeof IMG_PRESETS)[number][0]

export type ImgOpts = {
  preset: ImgPreset
  w: number
  h: number
  fmt: ImgFormat
  /** PNG pixel scale; SVG is always 1. */
  scale: number
  /** Base font size in px; every font in the figure scales with it. */
  font: number
}

/** The base font size the plots are built with (`makeLayout`). */
export const BASE_FONT = 11

export const IMG_LIMITS = {
  w: [200, 4000],
  h: [150, 4000],
  scale: [1, 4],
  font: [6, 24],
} as const

export const IMG_DEFAULT: ImgOpts = {
  preset: 'report',
  w: 1000,
  h: 560,
  fmt: 'svg',
  scale: 2,
  font: BASE_FONT,
}

function clampNum(
  v: unknown,
  [lo, hi]: readonly [number, number],
  def: number
) {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def
}

/** Whitelist and clamp settings from storage or the form. */
export function readImgOpts(raw: unknown): ImgOpts {
  const o =
    raw !== null && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : {}
  const preset = IMG_PRESETS.find(([id]) => id === o.preset)?.[0]
  const L = IMG_LIMITS
  const D = IMG_DEFAULT
  return {
    preset: preset ?? D.preset,
    w: clampNum(o.w, L.w, D.w),
    h: clampNum(o.h, L.h, D.h),
    fmt: o.fmt === 'png' ? 'png' : 'svg',
    scale: clampNum(o.scale, L.scale, D.scale),
    font: clampNum(o.font, L.font, D.font),
  }
}

/** Width and height of a fixed preset, or null for screen and custom. */
export function presetSize(p: ImgPreset): [number, number] | null {
  const row = IMG_PRESETS.find(([id]) => id === p)
  return row && row[2] > 0 ? [row[2], row[3]] : null
}

const round1 = (v: number) => Math.round(v * 10) / 10

function scaleFonts(v: unknown, k: number, key: string): unknown {
  if (Array.isArray(v))
    return v.length && typeof v[0] === 'object'
      ? v.map((x) => scaleFonts(x, k, ''))
      : v
  if (v === null || typeof v !== 'object' || ArrayBuffer.isView(v)) return v
  const out: Record<string, unknown> = {}
  for (const [kk, x] of Object.entries(v)) out[kk] = scaleFonts(x, k, kk)
  if (/font$/i.test(key) && typeof out.size === 'number')
    out.size = round1(out.size * k)
  return out
}

/**
 * Copy of a figure with every font size (layout, axes, legend, labels,
 * trace text) and the plot margins scaled by k, so text keeps its room.
 */
export function scaleFigure(fig: Figure, k: number): Figure {
  if (k === 1) return fig
  const layout = scaleFonts(fig.layout, k, '') as Record<string, unknown>
  const m = layout.margin as Record<string, unknown> | undefined
  if (m) {
    const mm: Record<string, unknown> = { ...m }
    for (const s of ['l', 'r', 't', 'b'])
      if (typeof mm[s] === 'number') mm[s] = Math.round((mm[s] as number) * k)
    layout.margin = mm
  }
  return {
    traces: fig.traces.map(
      (t) => scaleFonts(t, k, '') as Record<string, unknown>
    ),
    layout,
  }
}
