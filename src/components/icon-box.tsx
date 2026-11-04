import { cn } from '@/lib/utils'

/** Tinted square with an icon, in one accent colour (a CSS colour or var). */
export function IconBox({
  icon: Icon,
  color,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  color: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex size-8 items-center justify-center rounded-lg',
        className
      )}
      style={{
        color,
        background: `color-mix(in oklab, ${color} 15%, transparent)`,
      }}
    >
      <Icon className='size-4' />
    </span>
  )
}
