import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { type Design, type Metrics, tabOf, type TranResult } from '../engine'
import type { CurveSets } from '../plots/curves'
import { PlotlyChart } from '../plots/plotly-chart'
import type { PlotColors } from '../plots/theme-colors'
import { buildPlot, type Snapshot, TABS, TRAN_VIEWS } from '../plots/traces'
import { dispatch } from '../state/store'
import { ImageDialog } from './image-dialog'
import { ToolCard } from './tool-card'

const plotCls = 'h-[420px] w-full sm:h-[520px]'

export function PlotCard({
  S,
  sets,
  m,
  snapshots,
  colors,
  tran,
}: {
  S: Design
  sets: CurveSets
  m: Metrics
  snapshots: Snapshot[]
  colors: PlotColors
  /** Time-domain result from the worker; null until the first run ends. */
  tran: TranResult | null
}) {
  const [loadError, setLoadError] = useState<string | null>(null)
  const tab = tabOf(S)
  const plot = useMemo(
    () => buildPlot(S, sets, m, snapshots, colors, tran),
    [S, sets, m, snapshots, colors, tran]
  )
  return (
    <ToolCard>
      <div className='mb-2 flex flex-wrap gap-1'>
        <div id='tabs' role='tablist' className='flex flex-wrap gap-1'>
          {TABS.filter(([k]) => tabOf(S, k) === k).map(([k, l]) => (
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
        {tab === 'time' && (
          <div id='tviews' className='flex flex-wrap gap-1'>
            {TRAN_VIEWS.map(([k, l]) => (
              <Button
                key={k}
                size='sm'
                data-v={k}
                aria-pressed={S.plot.tview === k}
                variant={S.plot.tview === k ? 'default' : 'outline'}
                onClick={() => dispatch({ t: 'plot', patch: { tview: k } })}
              >
                {l}
              </Button>
            ))}
          </div>
        )}
        <span className='flex-1' />
        <ImageDialog
          S={S}
          sets={sets}
          m={m}
          snapshots={snapshots}
          tran={tran}
          tab={tab}
        />
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
