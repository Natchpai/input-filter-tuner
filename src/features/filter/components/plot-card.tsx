import { useMemo, useState } from 'react'
import { ImageDown } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { Design, Metrics } from '../engine'
import { dataUrlBytes, plotImage, readLightColors } from '../export/svg'
import type { CurveSets } from '../plots/curves'
import { PlotlyChart } from '../plots/plotly-chart'
import type { PlotColors } from '../plots/theme-colors'
import { buildPlot, type Snapshot, TABS } from '../plots/traces'
import { download, fileName } from '../state/persist'
import { dispatch } from '../state/store'
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
  // Saved figures always use the light palette, whatever the page theme.
  const savePlot = async (format: 'svg' | 'png') => {
    try {
      const fig = buildPlot(S, sets, m, snapshots, readLightColors()).main
      const url = await plotImage(fig, format, 1000, 560)
      download(
        fileName(S, `${S.plot.tab}.${format}`),
        dataUrlBytes(url),
        format === 'svg' ? 'image/svg+xml' : 'image/png'
      )
    } catch (e) {
      toast.error('Could not export the plot: ' + (e as Error).message)
    }
  }
  return (
    <ToolCard>
      <div className='mb-2 flex flex-wrap gap-1'>
        <div id='tabs' role='tablist' className='flex flex-wrap gap-1'>
          {TABS.filter(([k]) => k !== 'emi' || S.emi.on).map(([k, l]) => (
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
        <span className='flex-1' />
        {(['svg', 'png'] as const).map((f) => (
          <Button
            key={f}
            id={f === 'svg' ? 'bPlotSvg' : 'bPlotPng'}
            size='sm'
            variant='outline'
            title={`Save this plot as ${f.toUpperCase()} (light colours)`}
            onClick={() => savePlot(f)}
          >
            <ImageDown />
            {f.toUpperCase()}
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
