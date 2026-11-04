import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Main } from '@/components/layout/main'
import { SiteHeader } from '@/components/layout/site-header'
import { BlockCard } from './components/block-card'
import { Corners } from './components/corners'
import { DesignsCard } from './components/designs'
import { PlotCard } from './components/plot-card'
import { Results } from './components/results'
import { Schematic } from './components/schematic'
import {
  AddBlockCard,
  ConverterCard,
  PlotSettingsCard,
  SourceCard,
} from './components/settings'
import { Tolerance } from './components/tolerance'
import { ToolCard } from './components/tool-card'
import { Toolbar } from './components/toolbar'
import { cornerMetrics, metrics } from './engine'
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

export function Tuner() {
  const { st, library, hist } = useTuner()
  const snapshots = useMemo(() => overlaysOf(library), [library])
  // Inputs follow st at once; sweeps and metrics follow a deferred copy so
  // slider drags stay smooth.
  const dst = useDeferredValue(st)
  const colors = useThemeColors()
  const calc = useMemo(() => {
    try {
      const corners = cornerMetrics(dst)
      return {
        sets: curveSets(dst, corners.rows[corners.worst]),
        m: metrics(dst),
        corners,
        error: null,
      }
    } catch (e) {
      return { sets: null, m: null, corners: null, error: (e as Error).message }
    }
  }, [dst])

  useEffect(() => {
    const w = takeWarning()
    if (w) toast.warning(w)
  }, [])

  return (
    <>
      <SiteHeader title='Tuner' />
      <Main fluid className='space-y-3 px-3 py-3 sm:px-4'>
        <Toolbar
          S={st}
          sets={calc.sets}
          m={calc.m}
          nSnap={snapshots.length}
          nAuto={library.filter((x) => x.auto).length}
          canUndo={hist.past.length > 0}
          canRedo={hist.future.length > 0}
        />
        <div className='grid gap-3 @5xl/content:grid-cols-[400px_minmax(0,1fr)]'>
          <aside className='min-w-0 space-y-2.5'>
            <ConverterCard S={st} />
            <SourceCard S={st} />
            <div id='blocks' className='space-y-2.5'>
              {st.blocks.map((b, i) => (
                <BlockCard key={b.id} S={st} b={b} m={calc.m} index={i} />
              ))}
            </div>
            <AddBlockCard S={st} />
            <PlotSettingsCard S={st} />
          </aside>
          <div className='min-w-0 space-y-2.5'>
            <ToolCard
              title='Circuit'
              right={
                <span className='text-[11px] font-normal tracking-normal normal-case'>
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
              <>
                <ToolCard title='Results'>
                  <Results S={dst} m={calc.m} nom={calc.sets.nom} />
                </ToolCard>
                {calc.corners && <Corners data={calc.corners} />}
                <Tolerance st={dst} colors={colors} />
                <PlotCard
                  S={dst}
                  sets={calc.sets}
                  m={calc.m}
                  snapshots={snapshots}
                  colors={colors}
                />
              </>
            )}
            <DesignsCard S={st} m={calc.m} library={library} />
          </div>
        </div>
      </Main>
    </>
  )
}
