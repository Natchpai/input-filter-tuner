// Plot traces: user text reaches Plotly in a form it decodes.
import { expect, test } from 'vitest'
import { metrics } from '../engine'
import { buildPreset } from '../state/presets'
import { curveSets } from './curves'
import type { PlotColors } from './theme-colors'
import { buildPlot, timeUnit } from './traces'

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

test('time axis uses ns, µs, ms or s with ticks up to 999', () => {
  expect(timeUnit(0)).toEqual({ k: 1e-9, unit: 'ns' })
  expect(timeUnit(500e-9)).toEqual({ k: 1e-9, unit: 'ns' })
  expect(timeUnit(4e-5)).toEqual({ k: 1e-6, unit: 'µs' })
  expect(timeUnit(1.8e-3)).toEqual({ k: 1e-3, unit: 'ms' })
  expect(timeUnit(0.02)).toEqual({ k: 1e-3, unit: 'ms' })
  expect(timeUnit(-1.5e-4)).toEqual({ k: 1e-6, unit: 'µs' })
  expect(timeUnit(3)).toEqual({ k: 1, unit: 's' })
  // On the plot: D1 Rd-Cd hot-plug runs about 1.8 ms.
  const st = buildPreset(1)
  st.tran = { ...st.tran, on: true }
  st.plot = { ...st.plot, tab: 'time', tview: 'hot' }
  const m = metrics(st)
  const p = buildPlot(st, curveSets(st), m, [], C).main
  const xa = p.layout.xaxis as { title: { text: string } }
  expect(xa.title.text).toBe('Time (ms)')
  const x = p.traces[0].x as number[]
  expect(Math.max(...x)).toBeGreaterThan(1)
  expect(Math.max(...x)).toBeLessThan(1000)
})

test('frequency axes: a label per decade, 8 minor grid lines (2 to 9)', () => {
  const st = buildPreset(1)
  const m = metrics(st)
  for (const tab of ['zout', 'xfer', 'zin', 'tm', 'elem', 'emi'] as const) {
    const s = {
      ...st,
      emi: { ...st.emi, on: true },
      plot: { ...st.plot, tab },
    }
    const xa = buildPlot(s, curveSets(s), m, [], C).main.layout.xaxis as {
      type: string
      dtick: number
      minor: { dtick: string; showgrid: boolean }
    }
    expect(xa.type, tab).toBe('log')
    expect(xa.dtick, tab).toBe(1)
    expect(xa.minor, tab).toMatchObject({ dtick: 'D1', showgrid: true })
  }
})
