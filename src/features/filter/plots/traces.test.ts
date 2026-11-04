// Plot traces: user text reaches Plotly in a form it decodes.
import { expect, test } from 'vitest'
import { metrics } from '../engine'
import { buildPreset } from '../state/presets'
import { curveSets } from './curves'
import type { PlotColors } from './theme-colors'
import { buildPlot } from './traces'

const C: PlotColors = {
  a: '#1',
  b: '#2',
  c: '#3',
  d: '#4',
  e: '#5',
  bad: '#6',
  muted: '#7',
  ink: '#8',
  line: '#9',
  panel: '#a',
  accent: '#b',
}

test('a " in a block name is sent as &#34;, which Plotly decodes', () => {
  const st0 = buildPreset(0)
  const st = {
    ...st0,
    plot: { ...st0.plot, tab: 'elem' as const },
    blocks: st0.blocks.map((b, i) =>
      i === 0 ? { ...b, name: 'C "bulk"' } : b
    ),
  }
  const names = buildPlot(
    st,
    curveSets(st),
    metrics(st),
    [],
    C
  ).main.traces.map((t) => String(t.name))
  expect(names).toContain('|Z| C &#34;bulk&#34;')
  expect(names.join()).not.toContain('&quot;')
})
