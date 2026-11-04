import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

/** Compact card for the tool: small uppercase title, optional right side. */
export function ToolCard({
  title,
  right,
  className,
  children,
  id,
}: {
  title?: ReactNode
  right?: ReactNode
  className?: string
  children: ReactNode
  id?: string
}) {
  return (
    <Card id={id} className={cn('gap-0 px-3 py-2.5', className)}>
      {title !== undefined && (
        <h2 className='mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
          <span className='flex-1'>{title}</span>
          {right}
        </h2>
      )}
      {children}
    </Card>
  )
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className='mt-1 text-xs text-muted-foreground'>{children}</p>
}
