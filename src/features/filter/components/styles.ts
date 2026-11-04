import { cn } from '@/lib/utils'

export const inputCls =
  'h-7 rounded-md border border-input bg-background px-1.5 text-sm text-foreground tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'

export const selectCls = cn(inputCls, 'px-1')

/** Fields with a linear slider and plain-number text. */
export const LINEAR = new Set(['eta', 'phases', 'k', 'n', 'derate'])
