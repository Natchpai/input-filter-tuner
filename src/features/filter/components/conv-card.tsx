import { useState } from 'react'
import { ArrowDown, ArrowUp, Copy, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { type BusConv, LOAD_KEYS, MAX_BLOCK_NAME, MAX_LOADS } from '../engine'
import { newId } from '../state/defaults'
import { dispatch } from '../state/store'
import { CONV_FIELDS, ZERO_OK } from './fields'
import { inputCls, LINEAR } from './styles'
import { ValueRow } from './value-row'

const iconBtn = 'size-7'
const FIELDS = CONV_FIELDS.filter(([k]) =>
  (LOAD_KEYS as readonly string[]).includes(k)
)

/** One extra converter on the bus (M5). Its Vin and k are the bus fields. */
export function ConvCard({
  l,
  index,
  count,
}: {
  l: BusConv
  index: number
  count: number
}) {
  const [name, setName] = useState<string | null>(null)
  const set = (patch: Partial<Omit<BusConv, 'id'>>) =>
    dispatch({ t: 'loadSet', id: l.id, patch })
  return (
    <Card
      id={'conv-' + l.id}
      className={cn(
        'conv gap-0 border-l-4 border-l-chart-3 px-3 py-2.5',
        !l.on && 'off opacity-55'
      )}
    >
      <div className='mb-1.5 flex items-center gap-1.5'>
        <input
          type='checkbox'
          title='Enable'
          aria-label={`Enable ${l.name}`}
          className='size-4 accent-primary'
          checked={l.on}
          onChange={(e) => set({ on: e.target.checked })}
        />
        <input
          className={cn(inputCls, 'name w-24 font-semibold')}
          aria-label='Converter name'
          maxLength={MAX_BLOCK_NAME}
          value={name ?? l.name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name !== null && name.trim()) set({ name: name.trim() })
            setName(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className='min-w-0 flex-1 truncate text-xs text-muted-foreground'>
          on the bus
        </span>
        <Button
          size='icon'
          variant='ghost'
          className={iconBtn}
          title='Move up'
          disabled={index === 0}
          onClick={() => dispatch({ t: 'loadMove', id: l.id, dir: -1 })}
        >
          <ArrowUp />
        </Button>
        <Button
          size='icon'
          variant='ghost'
          className={iconBtn}
          title='Move down'
          disabled={index === count - 1}
          onClick={() => dispatch({ t: 'loadMove', id: l.id, dir: 1 })}
        >
          <ArrowDown />
        </Button>
        <Button
          size='icon'
          variant='ghost'
          className={iconBtn}
          title='Duplicate'
          disabled={count >= MAX_LOADS}
          onClick={() => dispatch({ t: 'loadDup', id: l.id, newId: newId() })}
        >
          <Copy />
        </Button>
        <Button
          size='icon'
          variant='ghost'
          className={iconBtn}
          title='Remove'
          data-a='rm'
          onClick={() => dispatch({ t: 'loadDel', id: l.id })}
        >
          <X />
        </Button>
      </div>
      {FIELDS.map(([k, label, u, mn, mx]) => (
        <ValueRow
          key={k}
          id={`ld-${l.id}-${k}`}
          label={label}
          unit={u}
          value={l[k as keyof BusConv] as number}
          onChange={(v) => set({ [k]: v })}
          min={mn}
          max={mx}
          zero={ZERO_OK.has(k)}
          linear={LINEAR.has(k)}
          int={k === 'phases'}
        />
      ))}
    </Card>
  )
}
