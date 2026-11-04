import { cn } from '@/lib/utils'
import {
  type Design,
  EMI_STDS,
  type EmiBand,
  type EmiResult,
  type EmiStd,
  type Lim,
} from '../engine'
import { fmtSI } from '../lib/si'
import { dispatch } from '../state/store'
import { selectCls } from './styles'
import { Hint, ToolCard } from './tool-card'
import { ValueRow } from './value-row'

const th =
  'px-1.5 py-1 text-right font-medium whitespace-nowrap first:text-left'
const td = 'px-1.5 py-1 text-right whitespace-nowrap first:text-left'

const dB = (v: number) => v.toFixed(1)
const lim = (l: Lim | undefined) =>
  l === undefined ? '–' : typeof l === 'number' ? String(l) : `${l[0]}→${l[1]}`
const bandText = (b: EmiBand) => `${fmtSI(b.fLo, 'Hz')} – ${fmtSI(b.fHi, 'Hz')}`

/** Conducted EMI settings, verdict and per-band table. */
export function Emi({ st, data }: { st: Design; data: EmiResult }) {
  const e = st.emi
  const info = EMI_STDS[e.std]
  const set = (patch: Partial<Design['emi']>) => dispatch({ t: 'emi', patch })
  const row = 'my-1.5 flex flex-wrap items-center gap-1.5 text-sm'
  const w = data.worst >= 0 ? data.rows[data.worst] : null
  return (
    <ToolCard id='emi' title='Conducted EMI'>
      <div className={row}>
        <label htmlFor='emi-std'>Standard</label>
        <select
          id='emi-std'
          className={selectCls}
          value={e.std}
          onChange={(ev) => {
            const std = ev.target.value as EmiStd
            const cl = EMI_STDS[std].classes
            set({ std, cls: cl[cl.length - 1] })
          }}
        >
          {(Object.keys(EMI_STDS) as EmiStd[]).map((k) => (
            <option key={k} value={k}>
              {EMI_STDS[k].label}
            </option>
          ))}
        </select>
        <label htmlFor='emi-cls'>Class</label>
        <select
          id='emi-cls'
          className={selectCls}
          value={e.cls}
          onChange={(ev) => set({ cls: ev.target.value })}
        >
          {info.classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label htmlFor='emi-lines'>Lines</label>
        <select
          id='emi-lines'
          className={selectCls}
          value={e.lines}
          onChange={(ev) => set({ lines: ev.target.value === '2' ? 2 : 1 })}
        >
          <option value='1'>1 AN (local return)</option>
          <option value='2'>2 ANs (+ and −)</option>
        </select>
      </div>
      <div className='grid gap-x-4 sm:grid-cols-2'>
        <ValueRow
          id='emi-tr'
          label='Edge time tr'
          unit='s'
          value={e.tr}
          onChange={(v) => set({ tr: v })}
          min={0.1e-9}
          max={1e-6}
          zero
        />
        <ValueRow
          id='emi-margin'
          label='EMI margin'
          unit='dB'
          value={e.margin}
          onChange={(v) => set({ margin: v })}
          min={0}
          max={40}
          linear
        />
      </div>
      <p
        id='emi-verdict'
        data-pass={data.pass ? 'true' : 'false'}
        className={cn(
          'my-2 text-sm font-medium',
          data.pass ? 'text-status-done' : 'text-destructive'
        )}
      >
        {w
          ? `${data.pass ? 'PASS' : 'FAIL'}: worst ${w.band.name} at ${fmtSI(w.f!, 'Hz')}, ` +
            `margin ${dB(w.margin!)} dB (${w.corner})`
          : 'No harmonic falls inside a limit band.'}
      </p>
      <div id='emi-bands' className='overflow-x-auto'>
        <table className='w-full text-sm tabular-nums'>
          <thead>
            <tr className='border-b text-xs text-muted-foreground'>
              <th className={th}>Band</th>
              <th className={th}>Range</th>
              <th className={th}>Pk / QP / AV</th>
              <th className={th}>Worst f</th>
              <th className={th}>Predicted</th>
              <th className={th}>Margin</th>
              <th className={th}>Needed</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => {
              const ok = r.margin === null || r.margin >= 0
              return (
                <tr
                  key={i}
                  data-worst={i === data.worst ? 'true' : undefined}
                  className={cn(
                    'border-b',
                    i === data.worst &&
                      'border-l-2 border-l-status-open bg-muted/40'
                  )}
                >
                  <td className={td}>{r.band.name}</td>
                  <td className={td}>{bandText(r.band)}</td>
                  <td className={td}>
                    {lim(r.band.pk)} / {lim(r.band.qp)} / {lim(r.band.av)}
                  </td>
                  <td className={td}>
                    {r.f === null ? '–' : fmtSI(r.f, 'Hz')}
                  </td>
                  <td className={td}>
                    {r.pred === null ? '–' : `${dB(r.pred)} dBµV`}
                  </td>
                  <td
                    className={cn(
                      td,
                      r.margin !== null &&
                        (ok ? 'text-status-done' : 'text-destructive')
                    )}
                  >
                    {r.margin === null
                      ? 'no harmonic'
                      : `${dB(r.margin)} dB ${ok ? 'pass' : 'fail'}`}
                  </td>
                  <td className={td}>
                    {r.aReq === null ? '–' : `${dB(Math.max(0, r.aReq))} dB`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Hint>
        {data.f0Max === null
          ? 'No filter attenuation needed. '
          : `A 2nd-order LC needs f0 ≤ ${fmtSI(data.f0Max, 'Hz')} (40 dB/dec). `}
        {info.lisn.name}, which replaces Rsrc and Lsrc. Every full-load Vin
        corner; fixed fsw, so the prediction is compared with every detector
        limit. Needed = attenuation versus no filter at all.
        {data.rbwSum &&
          ' Harmonics closer than RBW/2 are added in amplitude.'}{' '}
        Limit values are ASSUMED until checked against the standard
        (references/emi-limits.md).
      </Hint>
    </ToolCard>
  )
}
