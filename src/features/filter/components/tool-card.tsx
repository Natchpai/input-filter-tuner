import { type ReactNode, useContext, useState } from 'react'
import { ChevronRight, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { HintContext, useHintScope } from './hint-scope'
import { useUi } from './ui-store'

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
 * while closed the header shows `summary`. With `info` (a note under the
 * body) or `hints` (the body has <Hint>s), an (i) button shows them.
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
  hints,
}: {
  title?: ReactNode
  right?: ReactNode
  className?: string
  children: ReactNode
  id?: string
  collapse?: string
  summary?: ReactNode
  info?: ReactNode
  hints?: boolean
}) {
  const [open, setOpen] = useState(
    () => !collapse || !readClosed().includes(collapse)
  )
  const scope = useHintScope()
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
          {(info !== undefined || hints) && <HintButton scope={scope} />}
          {right}
        </h2>
      )}
      <HintScope show={scope.show}>
        {open && children}
        {open && info !== undefined && <Hint>{info}</Hint>}
      </HintScope>
    </Card>
  )
}

/** Gives the <Hint>s inside one card that card's hint state. */
export function HintScope({
  show,
  children,
}: {
  show: boolean
  children: ReactNode
}) {
  return <HintContext value={show}>{children}</HintContext>
}

export function HintButton({
  scope,
}: {
  scope: ReturnType<typeof useHintScope>
}) {
  return (
    <button
      type='button'
      className={cn(
        'rounded-sm p-0.5 text-muted-foreground hover:text-foreground',
        scope.show && 'text-foreground'
      )}
      title='About this card'
      aria-label='About this card'
      aria-pressed={scope.show}
      onClick={scope.toggle}
    >
      <Info className='size-3.5' />
    </button>
  )
}

/** Help text: hidden unless hints are on (toolbar switch or the card's (i)). */
export function Hint({
  children,
  id,
  className,
}: {
  children: ReactNode
  id?: string
  className?: string
}) {
  const scoped = useContext(HintContext)
  const { hints } = useUi()
  if (!(scoped ?? hints)) return null
  return (
    <p id={id} className={cn('mt-1 text-xs text-muted-foreground', className)}>
      {children}
    </p>
  )
}

/** Status or computed text: always shown. */
export function Note({ children }: { children: ReactNode }) {
  return <p className='mt-1 text-xs text-muted-foreground'>{children}</p>
}

const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']

/**
 * A superscript mark after a computed value. It opens a SourceLine with the
 * formula and its source; hover shows the same text.
 */
export function SourceMark({
  n,
  id,
  open,
  text,
  onToggle,
}: {
  n: number
  id: string
  open: boolean
  text: string
  onToggle: () => void
}) {
  return (
    <button
      type='button'
      data-src={n}
      className={cn(
        '-my-1 rounded-sm px-0.5 py-1 align-baseline text-muted-foreground hover:text-foreground',
        open && 'text-foreground'
      )}
      title={text}
      aria-label={`Source ${n}`}
      aria-expanded={open}
      aria-controls={id}
      onClick={onToggle}
    >
      {SUP[n] ?? `(${n})`}
    </button>
  )
}

/** The line a SourceMark opens: same look as a Note. */
export function SourceLine({
  n,
  id,
  children,
}: {
  n: number
  id: string
  children: ReactNode
}) {
  return (
    <p id={id} className='mt-0.5 text-xs text-muted-foreground'>
      {SUP[n] ?? `(${n})`} {children}
    </p>
  )
}
