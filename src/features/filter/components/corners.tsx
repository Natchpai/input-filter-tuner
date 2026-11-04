import { cn } from '@/lib/utils'
import type { cornerMetrics } from '../engine'
import { fmtSI } from '../lib/si'
import { Hint, ToolCard } from './tool-card'

const th =
  'px-1.5 py-1 text-right font-medium whitespace-nowrap first:text-left'
const td = 'px-1.5 py-1 text-right whitespace-nowrap first:text-left'

export function Corners({ data }: { data: ReturnType<typeof cornerMetrics> }) {
  const { rows, worst } = data
  return (
    <ToolCard id='cornersCard' title='Corners'>
      <div id='corners' className='overflow-x-auto'>
        <table className='w-full text-sm tabular-nums'>
          <thead>
            <tr className='border-b text-xs text-muted-foreground'>
              <th className={th}>Corner</th>
              <th className={th}>I</th>
              <th className={th}>Peak |Zout|</th>
              <th className={th}>|Rn|</th>
              <th className={th}>Margin</th>
              <th className={th}>Q</th>
              <th className={th}>Att. at fsw</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                data-worst={i === worst ? 'true' : undefined}
                className={cn(
                  'border-b',
                  i === worst && 'border-l-2 border-l-status-open bg-muted/40'
                )}
              >
                <td className={cn(td, 'whitespace-nowrap')}>{r.label}</td>
                <td className={td}>{fmtSI(r.i, 'A')}</td>
                <td className={td}>{fmtSI(r.peak, 'Ω')}</td>
                <td className={td}>{fmtSI(r.rn, 'Ω')}</td>
                <td
                  className={cn(
                    td,
                    'whitespace-nowrap',
                    r.pass ? 'text-status-done' : 'text-destructive'
                  )}
                >
                  {r.margin.toFixed(1)} dB {r.pass ? 'pass' : 'fail'}
                </td>
                <td className={td}>{r.q === null ? '–' : r.q.toFixed(2)}</td>
                <td className={td}>{r.attFsw.toFixed(1)} dB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Hint>
        |Rn| at full power at each Vin. L from the load current, C from Vin.
      </Hint>
    </ToolCard>
  )
}
