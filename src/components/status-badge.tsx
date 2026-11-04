import { cn } from '@/lib/utils'

export type Status = 'done' | 'open' | 'candidate'

const info: Record<Status, { label: string; hint: string; tone: string }> = {
  done: {
    label: 'Done',
    hint: 'Finished or decided',
    tone: 'border-status-done/50 bg-status-done/10 text-status-done',
  },
  open: {
    label: 'Open',
    hint: 'Still needs work or a decision',
    tone: 'border-status-open/50 bg-status-open/10 text-status-open',
  },
  candidate: {
    label: 'Candidate',
    hint: 'Proposed, not decided',
    tone: 'border-status-candidate/50 bg-status-candidate/10 text-status-candidate border-dashed',
  },
}

export function StatusBadge({
  status,
  className,
}: {
  status: Status
  className?: string
}) {
  return (
    <span
      title={info[status].hint}
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        info[status].tone,
        className
      )}
    >
      {info[status].label}
    </span>
  )
}
