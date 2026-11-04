import { type ReactNode, useState } from 'react'
import { ChevronRight, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

/** Closed cards, per browser only. View state: not in the design or links. */
const CLOSED_KEY = 'input-filter-tuner-closed'

function readClosed(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeClosed(name: string, closed: boolean) {
  try {
    const set = new Set(readClosed())
    if (closed) set.add(name)
    else set.delete(name)
    localStorage.setItem(CLOSED_KEY, JSON.stringify([...set]))
  } catch {
    /* storage blocked: the card just opens again after a reload */
  }
}

/**
 * Compact card for the tool: small uppercase title, optional right side.
 * With `collapse` (a name for storage), the title opens and closes the card;
 * while closed the header shows `summary`. With `info`, an (i) button shows
 * the note under the card body.
 */
export function ToolCard({
  title,
  right,
  className,
  children,
  id,
  collapse,
  summary,
  info,
}: {
  title?: ReactNode
  right?: ReactNode
  className?: string
  children: ReactNode
  id?: string
  collapse?: string
  summary?: ReactNode
  info?: ReactNode
}) {
  const [open, setOpen] = useState(
    () => !collapse || !readClosed().includes(collapse)
  )
  const [note, setNote] = useState(false)
  const toggle = () => {
    if (!collapse) return
    writeClosed(collapse, open)
    setOpen(!open)
  }
  return (
    <Card
      id={id}
      data-open={collapse ? String(open) : undefined}
      className={cn('gap-0 px-3 py-2.5', className)}
    >
      {title !== undefined && (
        <h2
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase',
            open && 'mb-2'
          )}
        >
          {collapse ? (
            <button
              type='button'
              className='flex min-w-0 flex-1 items-center gap-1 text-left uppercase hover:text-foreground'
              aria-expanded={open}
              onClick={toggle}
            >
              <ChevronRight
                className={cn(
                  'size-3.5 shrink-0 transition-transform',
                  open && 'rotate-90'
                )}
              />
              <span className='shrink-0'>{title}</span>
              {!open && summary !== undefined && (
                <span className='summary ml-1.5 truncate font-normal tracking-normal normal-case'>
                  {summary}
                </span>
              )}
            </button>
          ) : (
            <span className='flex-1'>{title}</span>
          )}
          {info !== undefined && (
            <button
              type='button'
              className={cn(
                'rounded-sm p-0.5 hover:text-foreground',
                note && 'text-foreground'
              )}
              title='About this card'
              aria-label='About this card'
              aria-pressed={note}
              onClick={() => setNote(!note)}
            >
              <Info className='size-3.5' />
            </button>
          )}
          {right}
        </h2>
      )}
      {open && children}
      {open && note && <Hint>{info}</Hint>}
    </Card>
  )
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className='mt-1 text-xs text-muted-foreground'>{children}</p>
}
