// Theme colour tokens as concrete values, for Plotly.

export type PlotColors = {
  a: string
  b: string
  c: string
  d: string
  e: string
  bad: string
  muted: string
  ink: string
  line: string
  panel: string
  accent: string
}

/** Read the tokens of the current theme (call after the theme class is set). */
export function readColors(el: Element = document.documentElement): PlotColors {
  const cs = getComputedStyle(el)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  return {
    a: v('--chart-1'),
    b: v('--chart-3'),
    c: v('--chart-4'),
    d: v('--chart-2'),
    e: v('--chart-5'),
    bad: v('--destructive'),
    muted: v('--muted-foreground'),
    ink: v('--foreground'),
    line: v('--border'),
    panel: v('--card'),
    accent: v('--primary'),
  }
}
