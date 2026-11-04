import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { Design, Metrics } from '../engine'
import type { CurveSets } from '../plots/curves'
import { PlotlyChart } from '../plots/plotly-chart'
import type { PlotColors } from '../plots/theme-colors'
import { buildPlot, TABS } from '../plots/traces'
import { dispatch, type Snapshot } from '../state/store'
import { ToolCard } from './tool-card'

const plotCls = 'h-[420px] w-full sm:h-[520px]'

export function PlotCard({
  S,
  sets,
  m,
  snapshots,
  colors,
}: {
  S: Design
  sets: CurveSets
  m: Metrics
  snapshots: Snapshot[]
  colors: PlotColors
}) {
  const [loadError, setLoadError] = useState<string | null>(null)
  const plot = useMemo(
    () => buildPlot(S, sets, m, snapshots, colors),
    [S, sets, m, snapshots, colors]
  )
  return (
    <ToolCard>
      <div id='tabs' role='tablist' className='mb-2 flex flex-wrap gap-1'>
        {TABS.map(([k, l]) => (
          <Button
            key={k}
            size='sm'
            role='tab'
            aria-selected={S.plot.tab === k}
            data-t={k}
            variant={S.plot.tab === k ? 'default' : 'secondary'}
            className={cn(S.plot.tab === k && 'on')}
            onClick={() => dispatch({ t: 'plot', patch: { tab: k } })}
          >
            {l}
          </Button>
        ))}
      </div>
      {plot.side ? (
        <div className='grid gap-2 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'>
          <PlotlyChart
            id='pl1'
            figure={plot.main}
            className={plotCls}
            onError={setLoadError}
          />
          <PlotlyChart
            id='pl2'
            figure={plot.side}
            className={plotCls}
            onError={setLoadError}
          />
        </div>
      ) : (
        <PlotlyChart
          key='one'
          id='pl1'
          figure={plot.main}
          className={plotCls}
          onError={setLoadError}
        />
      )}
      <p id='plotnote' className='mt-1 text-xs text-muted-foreground'>
        {loadError
          ? loadError + ' Results and schematic still work.'
          : plot.note}
        {plot.sweep && (
          <>
            {' '}
            Pick another block:{' '}
            {plot.sweep.choices.map((c) => (
              <Button
                key={c.id}
                size='sm'
                variant={c.id === plot.sweep!.current ? 'default' : 'outline'}
                className='mx-0.5 h-6 px-2 text-xs'
                data-sw={c.id}
                onClick={() =>
                  dispatch({ t: 'plot', patch: { sweepId: c.id } })
                }
              >
                {c.name}
              </Button>
            ))}
          </>
        )}
      </p>
    </ToolCard>
  )
}
