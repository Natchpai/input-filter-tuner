import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { type Design, sensitivity, type TolKey } from '../engine'
import { fmtSI } from '../lib/si'
import { Hint, ToolCard } from './tool-card'

const th =
  'px-1.5 py-1 text-right font-medium whitespace-nowrap first:text-left'
const td = 'px-1.5 py-1 text-right whitespace-nowrap first:text-left'

const UNIT: Partial<Record<TolKey, string>> = {
  L: 'H',
  lb: 'H',
  dL: 'H',
  c: 'F',
  cd: 'F',
}
const signed = (v: number) =>
  (Math.abs(v) < 0.005
    ? '0.00'
    : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2)) + ' dB'

/** Sensitivity card (M3): +10 % in one part at a time. */
export function Sensitivity({ st }: { st: Design }) {
  return (
    <ToolCard id='sens' title='Sensitivity'>
      <SensBody st={st} />
    </ToolCard>
  )
}

/** Only mounted while the card is open, so a closed card costs nothing. */
function SensBody({ st }: { st: Design }) {
  const s = useMemo(() => sensitivity(st), [st])
  if (s.rows.length === 0) return <Hint>No part values to vary.</Hint>
  return (
    <>
      <div className='overflow-x-auto'>
        <table id='sens-table' className='w-full text-sm tabular-nums'>
          <thead>
            <tr className='border-b text-xs text-muted-foreground'>
              <th className={th}>Part</th>
              <th className={th}>Value</th>
              <th className={th}>Δ margin</th>
              <th className={th}>Δ attenuation</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r, i) => (
              <tr key={`${r.id}-${r.key}`} className='border-b'>
                <td className={cn(td, i === 0 && 'font-medium')}>{r.label}</td>
                <td className={td}>{fmtSI(r.value, UNIT[r.key] ?? 'Ω')}</td>
                <td
                  className={cn(td, r.dMargin < -0.005 && 'text-status-open')}
                >
                  {signed(r.dMargin)}
                </td>
                <td className={cn(td, r.dAtt < -0.005 && 'text-status-open')}>
                  {signed(r.dAtt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Hint>
        Each part +10 % on its own, largest margin change first. Margin at Vin
        min, full load ({s.margin.toFixed(1)} dB); attenuation at{' '}
        {fmtSI(s.fr, 'Hz')}, the ripple of the converter with the least
        attenuation ({s.att.toFixed(1)} dB). Positive: better.
      </Hint>
    </>
  )
}
