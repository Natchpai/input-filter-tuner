import { cn } from '@/lib/utils'
import {
  CABLE_L_MAX,
  CABLE_R_MAX,
  type Design,
  type TranResult,
  type TranStatus,
} from '../engine'
import { fmtSI } from '../lib/si'
import { dispatch } from '../state/store'
import { Hint, ToolCard } from './tool-card'
import type { TranState } from './use-tran'
import { ValueRow } from './value-row'

const th =
  'px-1.5 py-1 text-right font-medium whitespace-nowrap first:text-left'
const td = 'px-1.5 py-1 text-right whitespace-nowrap first:text-left'

const STATUS_TEXT: Record<TranStatus, string> = {
  settled: 'settled',
  slow: 'not settled',
  unstable: 'unstable',
}

function Status({ s }: { s: TranStatus }) {
  return (
    <span
      className={cn(
        s === 'settled' && 'text-status-done',
        s === 'slow' && 'text-status-open',
        s === 'unstable' && 'text-destructive'
      )}
    >
      {STATUS_TEXT[s]}
    </span>
  )
}

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`

/**
 * Time domain card (M4). Off by default: then only the header with its
 * on/off checkbox and one line.
 */
export function Time({ st, tr }: { st: Design; tr: TranState }) {
  return (
    <ToolCard
      id='time'
      title='Time domain'
      collapse='time'
      summary={timeSummary(st, tr)}
      right={
        <label className='flex items-center gap-1 text-[11px] font-normal tracking-normal normal-case'>
          <input
            id='tran-on'
            type='checkbox'
            checked={st.tran.on}
            onChange={(ev) =>
              dispatch({ t: 'tran', patch: { on: ev.target.checked } })
            }
          />
          on
        </label>
      }
    >
      {st.tran.on ? (
        <TimeBody st={st} tr={tr} />
      ) : (
        <Hint>
          Hot-plug overshoot and inrush, load-step droop and the source ripple
          waveform. Off by default.
        </Hint>
      )}
    </ToolCard>
  )
}

function timeSummary(st: Design, tr: TranState) {
  const d = tr.data
  if (!st.tran.on) return 'off'
  if (!d) return 'running…'
  const h = d.hot[d.hotWorst]
  const s = d.step[d.stepWorst]
  const bad = d.step.some((r) => r.status === 'unstable')
  return (
    `hot-plug ${fmtSI(h.vPeak, 'V')} (${pct(h.overshoot)})` +
    (bad ? ', load step unstable' : `, dip ${fmtSI(s.droop, 'V')}`)
  )
}

function TimeBody({ st, tr }: { st: Design; tr: TranState }) {
  const set = (patch: Partial<Design['tran']>) => dispatch({ t: 'tran', patch })
  const d = tr.data
  return (
    <>
      <div className='grid gap-x-4 sm:grid-cols-2'>
        <ValueRow
          id='tran-lc'
          label='Cable L'
          unit='H'
          value={st.tran.lCable}
          onChange={(v) => set({ lCable: v })}
          min={1e-9}
          max={CABLE_L_MAX}
          zero
        />
        <ValueRow
          id='tran-rc'
          label='Cable R'
          unit='Ω'
          value={st.tran.rCable}
          onChange={(v) => set({ rCable: v })}
          min={1e-4}
          max={CABLE_R_MAX}
          zero
        />
      </div>
      {tr.error && <p className='my-2 text-sm text-destructive'>{tr.error}</p>}
      {!d ? (
        <p id='tran-summary' className='my-2 text-sm text-muted-foreground'>
          Running…
        </p>
      ) : (
        <TimeResult d={d} busy={tr.busy} />
      )}
      <Hint>
        Hot-plug: ideal step through Rsrc + Lsrc and the cable, converter off,
        C(V) at each Vin, L(I) at 0 A. Load step: constant power P/(η·V) from P
        light to P full and back, at each Vin with full-load L(I). No converter
        loop, no tolerances; linear C(V) and L(I).
      </Hint>
    </>
  )
}

function TimeResult({ d, busy }: { d: TranResult; busy: boolean }) {
  const h = d.hot[d.hotWorst]
  const s = d.step[d.stepWorst]
  const bad = d.step.find((r) => r.status === 'unstable')
  return (
    <div className={cn(busy && 'opacity-60')}>
      <p id='tran-summary' className='my-2 text-sm font-medium'>
        Hot-plug: V peak {fmtSI(h.vPeak, 'V')} ({pct(h.overshoot)}) at{' '}
        {fmtSI(h.vin, 'V')}
        {h.iPeak !== null
          ? `, inrush ${fmtSI(h.iPeak, 'A')}`
          : ', inrush not set (cable L is 0)'}
        .{' '}
        {bad ? (
          <span className='text-destructive'>
            Load step: unstable at {fmtSI(bad.vin, 'V')} (grows under constant
            power).
          </span>
        ) : (
          <>
            Load step: V min {fmtSI(s.vMin, 'V')} (dip {fmtSI(s.droop, 'V')}) at{' '}
            {fmtSI(s.vin, 'V')}.
          </>
        )}{' '}
        Source ripple {fmtSI(d.ripple.pp, 'A')} p-p.
        {busy && <span className='text-muted-foreground'> Updating…</span>}
      </p>
      <div id='tran-rows' className='overflow-x-auto'>
        <table className='w-full text-sm tabular-nums'>
          <thead>
            <tr className='border-b text-xs text-muted-foreground'>
              <th className={th}>Vin</th>
              <th className={th}>V peak</th>
              <th className={th}>Inrush</th>
              <th className={th}>I²t</th>
              <th className={th}>V min</th>
              <th className={th}>V max</th>
              <th className={th}>Settle</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {d.hot.map((r, i) => {
              const q = d.step[i]
              const worst = i === d.hotWorst || i === d.stepWorst
              const st: TranStatus =
                q.status === 'settled' ? r.status : q.status
              const ok = q.status !== 'unstable'
              return (
                <tr
                  key={i}
                  data-worst={worst ? 'true' : undefined}
                  className={cn(
                    'border-b',
                    worst && 'border-l-2 border-l-status-open bg-muted/40'
                  )}
                >
                  <td className={td}>{fmtSI(r.vin, 'V')}</td>
                  <td className={td}>
                    {fmtSI(r.vPeak, 'V')} ({pct(r.overshoot)})
                  </td>
                  <td className={td}>{fmtSI(r.iPeak, 'A')}</td>
                  <td className={td}>{fmtSI(r.i2t, 'A²s')}</td>
                  <td className={td}>{ok ? fmtSI(q.vMin, 'V') : '–'}</td>
                  <td className={td}>{ok ? fmtSI(q.vMax, 'V') : '–'}</td>
                  <td className={td}>
                    {ok && Number.isFinite(q.settleUp)
                      ? fmtSI(q.settleUp, 's')
                      : '–'}
                  </td>
                  <td className={td}>
                    <Status s={st} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {h.nodePeaks.length > 0 && (
        <p id='tran-nodes' className='mt-2 text-xs'>
          Peak V at each shunt part, hot-plug at {fmtSI(h.vin, 'V')}:{' '}
          {h.nodePeaks.map((p) => `${p.name} ${fmtSI(p.v, 'V')}`).join(' · ')}
        </p>
      )}
    </div>
  )
}
