import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AREAS, type Panel, PANELS, setArea, setPanel, useUi } from './ui-store'

/** Tab row in the same style as the plot tabs (`plot-card.tsx`). */
function TabRow<K extends string>({
  id,
  items,
  active,
  dim,
  onPick,
  className,
}: {
  id: string
  items: readonly (readonly [K, string])[]
  active: K
  dim?: (k: K) => boolean
  onPick: (k: K) => void
  className?: string
}) {
  return (
    <div
      id={id}
      role='tablist'
      className={cn('flex flex-wrap gap-1', className)}
    >
      {items.map(([k, l]) => (
        <Button
          key={k}
          size='sm'
          role='tab'
          aria-selected={active === k}
          data-t={k}
          variant={active === k ? 'default' : 'secondary'}
          className={cn(active !== k && dim?.(k) && 'text-muted-foreground')}
          onClick={() => onPick(k)}
        >
          {l}
        </Button>
      ))}
    </div>
  )
}

/**
 * The analysis sections in tabs under the plot. Every panel stays mounted
 * (hidden with the `hidden` attribute), so a tolerance run or an assistant
 * proposal survives a tab change.
 */
export function AnalysisTabs({
  panels,
  off,
}: {
  panels: Partial<Record<Panel, ReactNode>>
  /** Optional checks that are off: their tab is dimmed. */
  off: (k: Panel) => boolean
}) {
  const { panel } = useUi()
  return (
    // At least one pane high, so a chip click can always bring the tab bar
    // up under the strip.
    <div id='analysis' className='mt-1 min-h-[calc(100%-var(--strip-h,0px))]'>
      <div
        id='atabs-bar'
        className='sticky top-[var(--strip-h,0px)] z-30 -mx-0.5 bg-background/90 px-0.5 py-1.5 backdrop-blur'
      >
        <TabRow
          id='atabs'
          items={PANELS}
          active={panel}
          dim={off}
          onPick={setPanel}
        />
      </div>
      {PANELS.map(([k]) => (
        <div
          key={k}
          id={'panel-' + k}
          role='tabpanel'
          hidden={panel !== k}
          className='space-y-2.5'
        >
          {panels[k]}
        </div>
      ))}
    </div>
  )
}

/** Narrow screens: one pane at a time. */
export function AreaTabs({ className }: { className?: string }) {
  const { area } = useUi()
  return (
    <TabRow
      id='areas'
      items={AREAS}
      active={area}
      onPick={setArea}
      className={className}
    />
  )
}
