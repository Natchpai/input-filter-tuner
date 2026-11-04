import {
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Main } from '@/components/layout/main'
import { SiteHeader } from '@/components/layout/site-header'
import { AnalysisTabs, AreaTabs } from './components/analysis-tabs'
import { Assistant } from './components/assistant'
import { BlockCard } from './components/block-card'
import { ConvCard } from './components/conv-card'
import { Corners } from './components/corners'
import { DesignsCard } from './components/designs'
import { Emi } from './components/emi'
import { PlotCard } from './components/plot-card'
import { Results } from './components/results'
import { Schematic } from './components/schematic'
import { Sensitivity } from './components/sensitivity'
import {
  AddBlockCard,
  ConverterCard,
  PlotSettingsCard,
  SourceCard,
} from './components/settings'
import { StatusStrip } from './components/status-strip'
import { Time } from './components/time'
import { Tolerance } from './components/tolerance'
import { ToolCard } from './components/tool-card'
import { Toolbar } from './components/toolbar'
import { type Panel, useUi } from './components/ui-store'
import { useTran } from './components/use-tran'
import { cornerMetrics, emiResult, metrics } from './engine'
import { curveSets, overlaysOf } from './plots/curves'
import { readColors } from './plots/theme-colors'
import { takeWarning, useTuner } from './state/store'

/** Theme colours, re-read whenever the theme class on <html> changes. */
function useThemeColors() {
  const [colors, setColors] = useState(readColors)
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(readColors()))
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => obs.disconnect()
  }, [])
  return colors
}

/**
 * Keep `--strip-h` on the right pane equal to the status strip height, so
 * the analysis tab bar sticks just under the strip.
 */
function useStripHeight(hasStrip: boolean) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const pane = ref.current
    const strip = pane?.querySelector<HTMLElement>('#strip')
    if (!pane || !strip) return
    const obs = new ResizeObserver(() =>
      pane.style.setProperty('--strip-h', strip.offsetHeight + 'px')
    )
    obs.observe(strip)
    return () => obs.disconnect()
  }, [hasStrip])
  return ref
}

export function Tuner() {
  const { st, library, hist } = useTuner()
  const snapshots = useMemo(() => overlaysOf(library), [library])
  // Inputs follow st at once; sweeps and metrics follow a deferred copy so
  // slider drags stay smooth.
  const dst = useDeferredValue(st)
  const colors = useThemeColors()
  const tran = useTran(dst)
  const { area } = useUi()
  const calc = useMemo(() => {
    try {
      const corners = cornerMetrics(dst)
      return {
        sets: curveSets(dst, corners.rows[corners.worst]),
        m: metrics(dst),
        corners,
        emi: dst.emi.on ? emiResult(dst) : null,
        error: null,
      }
    } catch (e) {
      return {
        sets: null,
        m: null,
        corners: null,
        emi: null,
        error: (e as Error).message,
      }
    }
  }, [dst])

  useEffect(() => {
    const w = takeWarning()
    if (w) toast.warning(w)
  }, [])

  const rightRef = useStripHeight(calc.m !== null)
  const off = (k: Panel) =>
    (k === 'emi' && !st.emi.on) ||
    (k === 'time' && !st.tran.on) ||
    (k === 'asst' && !st.asst.on)
  const ok = calc.m && calc.sets
  const panels: Partial<Record<Panel, ReactNode>> = {
    results: ok && (
      <ToolCard title='Results'>
        <Results S={dst} m={calc.m!} nom={calc.sets!.nom} />
      </ToolCard>
    ),
    corners: ok && calc.corners && <Corners data={calc.corners} />,
    tolerance: ok && <Tolerance st={dst} colors={colors} />,
    sens: ok && <Sensitivity st={dst} />,
    emi: ok && <Emi st={st} data={calc.emi} />,
    time: ok && <Time st={st} tr={tran} />,
    asst: ok && <Assistant st={st} />,
    designs: (
      <DesignsCard
        S={st}
        m={calc.m}
        library={library}
        nSnap={snapshots.length}
      />
    ),
  }
  // Narrow screens show one area at a time; wide screens show both panes.
  const narrowHide = '@max-5xl/content:hidden'

  return (
    <>
      <SiteHeader title='Tuner' />
      <Main fluid fixed className='gap-2 px-3 py-2 sm:px-4'>
        <Toolbar
          S={st}
          sets={calc.sets}
          canUndo={hist.past.length > 0}
          canRedo={hist.future.length > 0}
        />
        <AreaTabs className='@5xl/content:hidden' />
        {/* Two panes that scroll on their own: inputs on the left; strip,
            circuit, plot and the analysis tabs on the right. */}
        <div className='grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-3 @5xl/content:grid-cols-[400px_minmax(0,1fr)]'>
          <aside
            id='inputs'
            className={cn(
              'min-h-0 min-w-0 space-y-2.5 overflow-y-auto overscroll-contain p-0.5',
              area !== 'inputs' && narrowHide
            )}
          >
            <ConverterCard S={st} />
            {st.loads.length > 0 && (
              <div id='convs' className='space-y-2.5'>
                {st.loads.map((l, i) => (
                  <ConvCard
                    key={l.id}
                    l={l}
                    index={i}
                    count={st.loads.length}
                  />
                ))}
              </div>
            )}
            <SourceCard S={st} />
            <div id='blocks' className='space-y-2.5'>
              {st.blocks.map((b, i) => (
                <BlockCard key={b.id} S={st} b={b} m={calc.m} index={i} />
              ))}
            </div>
            <AddBlockCard S={st} />
            <PlotSettingsCard S={st} />
          </aside>
          <section
            id='right'
            ref={rightRef}
            className={cn(
              'relative min-h-0 min-w-0 overflow-y-auto overscroll-contain px-0.5 pb-0.5',
              area === 'inputs' && narrowHide
            )}
          >
            {calc.m && (
              <StatusStrip
                S={dst}
                m={calc.m}
                corners={calc.corners}
                emi={calc.emi}
                tran={tran}
              />
            )}
            <div
              id='top'
              className={cn(
                'mt-2.5 space-y-2.5',
                area === 'analysis' && narrowHide
              )}
            >
              <ToolCard
                title='Circuit'
                right={
                  <span className='text-[11px] font-normal tracking-normal normal-case max-sm:hidden'>
                    click a part to edit it
                  </span>
                }
              >
                <Schematic S={st} />
              </ToolCard>
              {calc.error && (
                <ToolCard title='Error'>
                  <p className='text-sm text-destructive'>{calc.error}</p>
                </ToolCard>
              )}
              {calc.m && calc.sets && (
                <PlotCard
                  S={dst}
                  sets={calc.sets}
                  m={calc.m}
                  snapshots={snapshots}
                  colors={colors}
                  tran={tran.data}
                />
              )}
            </div>
            <AnalysisTabs panels={panels} off={off} />
          </section>
        </div>
      </Main>
    </>
  )
}
