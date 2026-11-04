import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { abs, db, type Design, type Metrics, type Sweep } from '../engine'
import { fmtSI } from '../lib/si'
import { marginTone, type Tone } from './tone'

const toneCls: Record<Tone, string> = {
  good: 'border-status-done [&_.v]:text-status-done',
  bad: 'border-destructive [&_.v]:text-destructive',
  warn: 'border-status-open',
  '': '',
}

function Kpi({
  k,
  v,
  s,
  tone = '',
}: {
  k: string
  v: string
  s: string
  tone?: Tone
}) {
  return (
    <div className={cn('kpi rounded-lg border px-2.5 py-1.5', toneCls[tone])}>
      <div className='text-xs text-muted-foreground'>{k}</div>
      <div className='v text-lg font-semibold tabular-nums'>{v}</div>
      <div className='text-xs text-muted-foreground'>{s}</div>
    </div>
  )
}

function Pill({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full bg-muted px-2 text-xs',
        ok ? 'text-status-done' : 'text-destructive'
      )}
    >
      {children}
    </span>
  )
}

export function Results({ S, m, nom }: { S: Design; m: Metrics; nom: Sweep }) {
  const cv = S.conv,
    p = m.prim
  const mTone = marginTone(m)
  const hPk = Math.max(...nom.Hopen.map((z) => db(abs(z))))
  const iRms = m.ripple.isrc / Math.SQRT2
  const fr = fmtSI(m.ripple.fr, 'Hz')

  const rows: [ReactNode, ReactNode][] = [
    [
      'Rn at Vin min / nom / max',
      `${fmtSI(m.rn.min, 'Ω')} / ${fmtSI(m.rn.nom, 'Ω')} / ${fmtSI(m.rn.max, 'Ω')}`,
    ],
    [
      'Peak |Zout| search range',
      `${fmtSI(m.fLo, 'Hz')} to ${fmtSI(m.fHi, 'Hz')}`,
    ],
    [
      '|Rn| / k (limit line)',
      fmtSI(Math.abs(m.rn.min) / 10 ** (cv.k / 20), 'Ω'),
    ],
    [
      'Nyquist (Tm = Zout/Rn, Vin min)',
      m.unstableAt ? (
        <Pill ok={false}>encircles −1 at {fmtSI(m.unstableAt, 'Hz')}</Pill>
      ) : (
        <Pill ok>no encirclement</Pill>
      ),
    ],
  ]
  if (p) {
    rows.push(
      ['Primary L / C', `${fmtSI(p.L, 'H')} / ${fmtSI(p.C, 'F')}`],
      ['rL (DC) of primary', fmtSI(p.rL, 'Ω')],
      ['Q from rL only = Z0/rL', (p.Z0 / Math.max(p.rL, 1e-12)).toFixed(1)],
      [
        'Qstab = |Rn|/(k·Z0)',
        (Math.abs(m.rn.min) / (10 ** (cv.k / 20) * p.Z0)).toFixed(2),
      ]
    )
  }
  rows.push(
    ['DC series R (incl. source)', fmtSI(m.dc.r, 'Ω')],
    ['DC input current (Vin min)', fmtSI(m.dc.iin, 'A')],
    [
      'Duty D (Vin nom) / Io',
      `${m.ripple.D.toFixed(3)} / ${fmtSI(m.ripple.io, 'A')}`,
    ],
    [
      'Converter input ripple Iac (rms, all harmonics)',
      fmtSI(m.ripple.iacRms, 'A'),
    ],
    [`Converter current harmonic @ ${fr} (peak)`, fmtSI(m.ripple.ih, 'A')],
    ['Ripple voltage at converter pins (peak)', fmtSI(m.ripple.vout, 'V')],
    [`S21 @ ${fr} (${S.plot.z0} Ω)`, `${db(m.ripple.s21fr).toFixed(1)} dB`]
  )
  for (const b of S.blocks) {
    if (!b.on) continue
    const ac = m.ripple.perBlock[b.id],
      dc = m.dc.perBlock[b.id]
    if ((ac || 0) + (dc || 0) <= 0) continue
    rows.push([
      `Loss in ${b.name}: DC + AC @ ${fr}`,
      `${fmtSI(dc || 0, 'W')} + ${fmtSI(ac || 0, 'W')}`,
    ])
  }

  return (
    <>
      <div
        id='kpis'
        className='grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2'
      >
        <Kpi
          k='Peak |Zout|'
          v={fmtSI(m.peak.v, 'Ω')}
          s={`at ${fmtSI(m.peak.f, 'Hz')}${m.peakIsEdge ? ' (range edge)' : ''}`}
        />
        <Kpi
          k='Middlebrook margin'
          v={`${m.margin.toFixed(1)} dB`}
          s={
            m.unstableAt
              ? `UNSTABLE: Nyquist at ${fmtSI(m.unstableAt, 'Hz')}`
              : `need ≥ ${cv.k} dB · |Rn| ${fmtSI(Math.abs(m.rn.min), 'Ω')}`
          }
          tone={mTone}
        />
        {p && (
          <>
            <Kpi
              k='Z0 · f0'
              v={fmtSI(p.Z0, 'Ω')}
              s={`f0 ${fmtSI(p.f0, 'Hz')} · ${p.block.name} with ${fmtSI(p.C, 'F')}`}
            />
            <Kpi
              k='Q = Z0/r (series form)'
              v={m.qSeries!.toFixed(2)}
              s={`peak/Z0 = ${m.qeff!.toFixed(2)} · H peak ${hPk > 0.05 ? '+' + hPk.toFixed(1) + ' dB' : 'none'}`}
            />
          </>
        )}
        <Kpi
          k={`Attenuation @ ${fr}`}
          v={`${(-db(m.ripple.hfr)).toFixed(1)} dB`}
          s={`|H| open at fsw ${db(m.ripple.hfsw).toFixed(1)} dB`}
        />
        <Kpi
          k='Source ripple current'
          v={fmtSI(iRms, 'A')}
          s={`rms @ ${fr} · ${db(iRms / 1e-6).toFixed(1)} dBµA`}
        />
        <Kpi
          k='DC loss (Vin min)'
          v={fmtSI(m.dc.loss, 'W')}
          s={`${m.dc.pct.toFixed(2)} % of P · drop ${fmtSI(m.dc.drop, 'V')}`}
        />
      </div>
      <Collapsible className='mt-2'>
        <CollapsibleTrigger className='group flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'>
          <ChevronRight className='size-4 transition-transform group-data-[state=open]:rotate-90' />
          All numbers
        </CollapsibleTrigger>
        <CollapsibleContent>
          <table id='restab' className='mt-2 w-full text-sm tabular-nums'>
            <tbody>
              {rows.map(([k, v], i) => (
                <tr key={i} className='border-b'>
                  <td className='px-1.5 py-1'>{k}</td>
                  <td className='px-1.5 py-1 text-right'>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}
