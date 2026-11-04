import { useEffect, useRef, useState } from 'react'
import type { Figure } from './traces'

type PlotlyModule = typeof import('plotly.js-basic-dist-min').default

let plotlyPromise: Promise<PlotlyModule> | null = null
/** Plotly is about 1 MB, so it loads after the first render. */
const loadPlotly = () =>
  (plotlyPromise ??= import('plotly.js-basic-dist-min').then((m) => m.default))

const CONFIG = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
}

/** One Plotly chart. `id` stays stable so tests can read the div's data. */
export function PlotlyChart({
  id,
  figure,
  className,
  onError,
}: {
  id: string
  figure: Figure
  className?: string
  onError?: (msg: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [plotly, setPlotly] = useState<PlotlyModule | null>(null)

  useEffect(() => {
    let live = true
    loadPlotly().then(
      (p) => live && setPlotly(() => p),
      (e: Error) => onError?.('Plotly did not load: ' + e.message)
    )
    return () => {
      live = false
    }
  }, [onError])

  useEffect(() => {
    if (!plotly || !ref.current) return
    plotly.react(
      ref.current,
      figure.traces as Plotly.Data[],
      figure.layout as Partial<Plotly.Layout>,
      CONFIG as Partial<Plotly.Config>
    )
  }, [plotly, figure])

  // `responsive` only follows window resizes. The sidebar toggle and the
  // grid change the card width without one, so watch the div itself.
  useEffect(() => {
    const el = ref.current
    if (!plotly || !el) return
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Returns a promise at runtime (typed void), which rejects while the
        // div is hidden or not plotted yet: nothing to do then.
        Promise.resolve(plotly.Plots.resize(el) as unknown).catch(() => {})
      })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [plotly])

  useEffect(() => {
    const el = ref.current
    return () => {
      if (el && plotly) plotly.purge(el)
    }
  }, [plotly])

  return <div id={id} ref={ref} className={className} />
}
