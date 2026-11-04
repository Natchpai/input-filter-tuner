import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Main } from '@/components/layout/main'
import { SiteHeader } from '@/components/layout/site-header'
import { BlockCard } from './components/block-card'
import { PlotCard } from './components/plot-card'
import { Results } from './components/results'
import { Schematic } from './components/schematic'
import {
  AddBlockCard,
  ConverterCard,
  PlotSettingsCard,
  SourceCard,
} from './components/settings'
import { ToolCard } from './components/tool-card'
import { Toolbar } from './components/toolbar'
import { metrics } from './engine'
import { curveSets } from './plots/curves'
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
  const { st, snapshots } = useTuner()
  // Inputs follow st at once; sweeps and metrics follow a deferred copy so
  // slider drags stay smooth.
  const dst = useDeferredValue(st)
  const colors = useThemeColors()
  const calc = useMemo(() => {
    try {
      return { sets: curveSets(dst), m: metrics(dst), error: null }
    } catch (e) {
      return { sets: null, m: null, error: (e as Error).message }
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
        <Toolbar S={st} sets={calc.sets} m={calc.m} nSnap={snapshots.length} />
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
                <PlotCard
                  S={dst}
                  sets={calc.sets}
                  m={calc.m}
                  snapshots={snapshots}
                  colors={colors}
                />
              </>
            )}
          </div>
        </div>
      </Main>
    </>
  )
}
