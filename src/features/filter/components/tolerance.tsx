import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  type Design,
  type ExtremeRow,
  type McResult,
  tolItems,
  tolLabel,
} from '../engine'
import { PlotlyChart } from '../plots/plotly-chart'
import type { PlotColors } from '../plots/theme-colors'
import type { Figure } from '../plots/traces'
import TolWorker from '../workers/tolerance.worker?worker&inline'
import { Hint, Note, ToolCard } from './tool-card'

const th =
  'px-1.5 py-1 text-right font-medium whitespace-nowrap first:text-left'
const td = 'px-1.5 py-1 text-right whitespace-nowrap first:text-left'

type Run = { key: string; ext: ExtremeRow[] | null; mc: McResult }

/**
 * Key of what the run depends on: the converter, source and blocks, plus
 * f min and n (check range and grid). View settings do not count.
 */
function designKey(st: Design): string {
  return JSON.stringify({
    conv: st.conv,
    loads: st.loads,
    source: st.source,
    blocks: st.blocks,
    fmin: st.plot.fmin,
    n: st.plot.n,
  })
}

const dB = (v: number) => v.toFixed(1)

function marginCls(v: number, k: number) {
  return v < k ? 'text-destructive' : 'text-status-done'
}

function histogram(board: Float64Array, k: number, C: PlotColors): Figure {
  let lo = Infinity
  let hi = -Infinity
  for (const v of board) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (!(hi > lo)) {
    lo -= 0.5
    hi += 0.5
  }
  const bins = 30
  const w = (hi - lo) / bins
  const count = new Array<number>(bins).fill(0)
  for (const v of board)
    count[Math.min(bins - 1, Math.floor((v - lo) / w))] += 1
  const x = count.map((_, i) => lo + (i + 0.5) * w)
  const axis = {
    gridcolor: C.line,
    linecolor: C.line,
    zerolinecolor: C.line,
    tickfont: { color: C.muted },
  }
  return {
    traces: [
      {
        type: 'bar',
        x,
        y: count,
        width: w * 0.95,
        marker: { color: C.a },
        hovertemplate: '%{x:.1f} dB: %{y} boards<extra></extra>',
      },
    ],
    layout: {
      paper_bgcolor: C.panel,
      plot_bgcolor: C.panel,
      font: { color: C.ink, size: 11 },
      margin: { l: 52, r: 16, t: 10, b: 44 },
      showlegend: false,
      // Fit the data. The required margin k is drawn only when it falls
      // inside; the table colours show pass or fail either way.
      xaxis: {
        ...axis,
        title: { text: 'Board margin (dB)' },
        range: [lo - w, hi + w],
      },
      yaxis: { ...axis, title: { text: 'Boards' } },
      shapes: (k >= lo - w && k <= hi + w ? [k] : []).map((x) => ({
        type: 'line',
        x0: x,
        x1: x,
        y0: 0,
        y1: 1,
        yref: 'paper',
        line: { color: C.bad, width: 1.5, dash: 'dash' },
      })),
    },
  }
}

export function Tolerance({ st, colors }: { st: Design; colors: PlotColors }) {
  const items = tolItems(st)
  const [n, setN] = useState(1000)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const worker = useRef<Worker | null>(null)
  const key = designKey(st)

  const stop = () => {
    worker.current?.terminate()
    worker.current = null
    setRunning(false)
  }
  useEffect(() => () => worker.current?.terminate(), [])

  const start = () => {
    worker.current?.terminate()
    const draws = Math.min(10000, Math.max(100, Math.round(n) || 1000))
    const w = new TolWorker()
    worker.current = w
    setN(draws)
    setTotal(draws)
    setDone(0)
    setError(null)
    setRunning(true)
    w.onmessage = (e: MessageEvent) => {
      const d = e.data
      if (d.type === 'progress') setDone(d.done)
      else if (d.type === 'done') {
        setRun({ key, ext: d.ext, mc: d.mc })
        setDone(draws)
        stop()
      } else if (d.type === 'error') {
        setError(d.message)
        stop()
      }
    }
    w.onerror = (e) => {
      setError(e.message || 'The worker failed.')
      stop()
    }
    w.postMessage({ st, n: draws })
  }

  const board = run?.mc.board
  const hist = useMemo(
    () => (board ? histogram(board, st.conv.k, colors) : null),
    [board, st.conv.k, colors]
  )

  if (items.length === 0)
    return (
      <ToolCard title='Tolerance' id='tolerance'>
        <Note>
          Add a ± tolerance on a block (Tolerance section in its card).
        </Note>
      </ToolCard>
    )

  const k = st.conv.k
  const stale = run !== null && run.key !== key
  const mc = run?.mc
  const worstCorner = mc
    ? mc.corners.reduce((a, c, i) => (c.worst < mc.corners[a].worst ? i : a), 0)
    : -1
  const label = (id: string, tk: string) => {
    const b = st.blocks.find((x) => x.id === id)
    return b ? `${b.name} ${tolLabel(b.type, tk)}` : `${id} ${tk}`
  }
  const wb = mc?.worstBoard
  const wbMargin = mc && wb ? mc.board[wb.index] : 0

  return (
    <ToolCard title='Tolerance' id='tolerance' hints>
      <div className='flex flex-wrap items-center gap-2 text-sm'>
        <label htmlFor='tol-n' className='text-xs text-muted-foreground'>
          Draws
        </label>
        <Input
          id='tol-n'
          type='number'
          min={100}
          max={10000}
          step={100}
          value={n}
          disabled={running}
          onChange={(e) => setN(Number(e.target.value))}
          className='h-8 w-24'
        />
        <Button id='tol-run' size='sm' onClick={start} disabled={running}>
          Run
        </Button>
        {running && (
          <Button id='tol-cancel' size='sm' variant='outline' onClick={stop}>
            Cancel
          </Button>
        )}
        {(running || total > 0) && (
          <span
            id='tol-progress'
            className='text-xs text-muted-foreground tabular-nums'
          >
            {done} / {total} draws
          </span>
        )}
      </div>
      <Note>
        {items.length} {items.length === 1 ? 'tolerance' : 'tolerances'}:{' '}
        {items.length > 8
          ? 'more than 8, Monte Carlo only'
          : `all ${2 ** items.length} extremes per corner`}
      </Note>
      {error && <p className='mt-1 text-xs text-destructive'>{error}</p>}
      {stale && (
        <p id='tol-stale' className='mt-1 text-xs text-status-open'>
          Stale: the design changed. Run again.
        </p>
      )}
      {run && mc && hist && wb && (
        <div className={cn('mt-2', stale && 'opacity-50')}>
          <div className='overflow-x-auto'>
            <table id='tol-table' className='w-full text-sm tabular-nums'>
              <thead>
                <tr className='border-b text-xs text-muted-foreground'>
                  <th className={th}>Corner</th>
                  <th className={th}>Nominal margin</th>
                  <th className={th}>Extremes worst margin</th>
                  <th className={th}>Q range</th>
                  <th className={th}>MC worst</th>
                  <th className={th}>MC P1</th>
                  <th className={th}>MC median</th>
                </tr>
              </thead>
              <tbody>
                {mc.corners.map((c, i) => {
                  const e = run.ext?.[i]
                  const nom = e?.nominal.margin
                  return (
                    <tr
                      key={i}
                      data-worst={i === worstCorner ? 'true' : undefined}
                      className={cn(
                        'border-b',
                        i === worstCorner &&
                          'border-l-2 border-l-status-open bg-muted/40'
                      )}
                    >
                      <td className={td}>{c.label}</td>
                      <td
                        className={cn(
                          td,
                          nom !== undefined && marginCls(nom, k)
                        )}
                      >
                        {nom === undefined ? '–' : dB(nom) + ' dB'}
                      </td>
                      <td className={cn(td, e && marginCls(e.worst.margin, k))}>
                        {e ? dB(e.worst.margin) + ' dB' : '–'}
                      </td>
                      <td className={td}>
                        {e && e.qMin !== null && e.qMax !== null
                          ? `${e.qMin.toFixed(2)} to ${e.qMax.toFixed(2)}`
                          : '–'}
                      </td>
                      <td className={cn(td, marginCls(c.worst, k))}>
                        {dB(c.worst)} dB
                      </td>
                      <td className={cn(td, marginCls(c.p1, k))}>
                        {dB(c.p1)} dB
                      </td>
                      <td className={cn(td, marginCls(c.median, k))}>
                        {dB(c.median)} dB
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p id='tol-worst' className='mt-2 text-xs'>
            Worst board: {dB(wbMargin)} dB.{' '}
            {mc.items
              .map(
                (it, i) =>
                  `${label(it.id, it.key)} ${wb.d[i] >= 0 ? '+' : '−'}${Math.abs(wb.d[i] * 100).toFixed(1)} %`
              )
              .join(', ')}
          </p>
          <PlotlyChart
            id='tol-hist'
            figure={hist}
            className='mt-2 h-[220px] w-full'
          />
        </div>
      )}
      <Hint>
        Uniform within ± tol, seed 1. One draw is one board: the same parts at
        every corner. Extremes are the ± limits of each tolerance, not a proof.
      </Hint>
    </ToolCard>
  )
}
