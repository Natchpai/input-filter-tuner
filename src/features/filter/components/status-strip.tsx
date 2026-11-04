import { cn } from '@/lib/utils'
import {
  type cornerMetrics,
  db,
  type Design,
  type EmiResult,
  type Metrics,
} from '../engine'
import { fmtSI } from '../lib/si'
import { marginTone, type Tone, toneText } from './tone'
import type { TranState } from './use-tran'

type Chip = { id: string; k: string; v: string; tone?: Tone; to: string }

const go = (id: string) =>
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })

/**
 * The key numbers in one row that stays at the top of the window, so the
 * verdict is in view while a slider moves. Same values as the cards below;
 * a click scrolls to the card.
 */
export function StatusStrip({
  S,
  m,
  corners,
  emi,
  tran,
}: {
  S: Design
  m: Metrics
  corners: ReturnType<typeof cornerMetrics> | null
  emi: EmiResult | null
  tran: TranState
}) {
  const chips: Chip[] = [
    {
      id: 'margin',
      k: 'Margin',
      v: m.unstableAt ? 'unstable' : `${m.margin.toFixed(1)} dB`,
      tone: marginTone(m),
      to: 'kpis',
    },
  ]
  if (corners && corners.rows.length > 1) {
    const w = corners.rows[corners.worst]
    chips.push({
      id: 'corner',
      k: `Worst corner (${w.label})`,
      v: `${w.margin.toFixed(1)} dB`,
      tone: w.pass ? 'good' : 'bad',
      to: 'cornersCard',
    })
  }
  chips.push({
    id: 'peak',
    k: 'Peak |Zout|',
    v: `${fmtSI(m.peak.v, 'Ω')} @ ${fmtSI(m.peak.f, 'Hz')}`,
    to: 'kpis',
  })
  if (m.qSeries !== undefined && m.qSeries !== null)
    chips.push({ id: 'q', k: 'Q', v: m.qSeries.toFixed(2), to: 'kpis' })
  chips.push({
    id: 'att',
    k: `Atten @ ${fmtSI(m.ripple.fr, 'Hz')}`,
    v: `${(-db(m.ripple.hfr)).toFixed(1)} dB`,
    to: 'kpis',
  })
  if (S.emi.on && emi) {
    const w = emi.worst >= 0 ? emi.rows[emi.worst] : null
    chips.push({
      id: 'emi',
      k: 'EMI margin',
      v: w ? `${w.margin!.toFixed(1)} dB` : 'no harmonic',
      tone: emi.pass ? 'good' : 'bad',
      to: 'emi',
    })
  }
  if (S.tran.on) {
    const d = tran.data
    const h = d?.hot[d.hotWorst]
    const bad = d?.step.some((r) => r.status === 'unstable')
    chips.push({
      id: 'hot',
      k: 'Hot-plug peak',
      v: h
        ? `${fmtSI(h.vPeak, 'V')} (${h.overshoot >= 0 ? '+' : ''}${h.overshoot.toFixed(1)} %)`
        : 'running…',
      tone: bad ? 'bad' : '',
      to: 'time',
    })
  }

  return (
    <div
      id='strip'
      className='sticky top-0 z-40 -mx-3 border-b bg-background/90 px-3 py-1.5 backdrop-blur sm:-mx-4 sm:px-4'
    >
      <div className='flex gap-1.5 overflow-x-auto'>
        {chips.map((c) => (
          <button
            key={c.id}
            type='button'
            data-chip={c.id}
            data-tone={c.tone || undefined}
            title={`${c.k}: go to the card`}
            onClick={() => go(c.to)}
            className='flex shrink-0 items-baseline gap-1.5 rounded-md border bg-card px-2 py-0.5 text-sm whitespace-nowrap hover:bg-muted'
          >
            <span className='text-xs text-muted-foreground'>{c.k}</span>
            <span
              className={cn(
                'font-semibold tabular-nums',
                toneText[c.tone ?? '']
              )}
            >
              {c.v}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
