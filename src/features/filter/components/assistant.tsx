import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  ASST_LIM,
  applyProposal,
  type AsstSettings,
  type Check,
  DAMP_FORM_LABEL,
  DAMP_FORMS,
  type DampForm,
  type Design,
  E_SERIES,
  type ESeries,
  faOf,
  propose,
  type Proposal,
  type StageIn,
  type StageOut,
  type StageVals,
  TYPES,
} from '../engine'
import { fmtSI } from '../lib/si'
import { newId } from '../state/defaults'
import { dispatch } from '../state/store'
import { selectCls } from './styles'
import { Hint, ToolCard } from './tool-card'
import { ValueRow } from './value-row'

const th =
  'px-1.5 py-1 text-right font-medium whitespace-nowrap first:text-left'
const td = 'px-1.5 py-1 text-right whitespace-nowrap first:text-left'
const dB = (v: number) => v.toFixed(1)
const set = (patch: Partial<AsstSettings>) => dispatch({ t: 'asst', patch })

/** What a proposal depends on; a change marks the shown proposal as old. */
const keyOf = (st: Design) =>
  JSON.stringify({
    conv: st.conv,
    loads: st.loads,
    source: st.source,
    blocks: st.blocks,
    asst: { ...st.asst, on: true },
    emi: st.emi,
    fmin: st.plot.fmin,
    n: st.plot.n,
  })

/**
 * Design assistant card (M3). Off by default: then only the header with
 * its on/off checkbox and one line. Propose runs on click only.
 */
export function Assistant({ st }: { st: Design }) {
  return (
    <ToolCard
      id='asst'
      title='Design assistant'
      right={
        <label className='flex items-center gap-1 text-[11px] font-normal tracking-normal normal-case'>
          <input
            id='asst-on'
            type='checkbox'
            checked={st.asst.on}
            onChange={(ev) => set({ on: ev.target.checked })}
          />
          on
        </label>
      }
    >
      {st.asst.on ? (
        <AsstBody st={st} />
      ) : (
        <Hint>
          Proposes L, C and the damping parts from an attenuation or EMI target
          and margin k, on E-series values. Off by default.
        </Hint>
      )}
    </ToolCard>
  )
}

const row = 'my-1.5 flex flex-wrap items-center gap-1.5 text-sm'

function AsstBody({ st }: { st: Design }) {
  const a = st.asst
  const [res, setRes] = useState<{ key: string; p: Proposal } | null>(null)
  const key = keyOf(st)
  const run = () => {
    try {
      setRes({ key, p: propose(st) })
    } catch (e) {
      toast.error(`Propose failed: ${(e as Error).message}`)
    }
  }
  const apply = (p: Proposal) => {
    dispatch({ t: 'replace', st: applyProposal(st, p, newId) })
    setRes(null)
    toast.success('Proposal applied. Undo brings the old parts back.')
  }
  return (
    <>
      <div className={row}>
        <label htmlFor='asst-target'>Target</label>
        <select
          id='asst-target'
          className={selectCls}
          value={a.target}
          onChange={(ev) =>
            set({ target: ev.target.value === 'emi' ? 'emi' : 'db' })
          }
        >
          <option value='db'>Attenuation at a frequency</option>
          <option value='emi'>EMI limits (EMI card)</option>
        </select>
        <label htmlFor='asst-stages'>Stages</label>
        <select
          id='asst-stages'
          className={selectCls}
          value={a.stages}
          onChange={(ev) => set({ stages: ev.target.value === '2' ? 2 : 1 })}
        >
          <option value='1'>1</option>
          <option value='2'>2</option>
        </select>
        <label htmlFor='asst-rule'>Damping size</label>
        <select
          id='asst-rule'
          className={selectCls}
          value={a.rule}
          onChange={(ev) =>
            set({ rule: ev.target.value === 'leastCd' ? 'leastCd' : 'q' })
          }
        >
          <option value='q'>Target Q (reports)</option>
          <option value='leastCd'>Just meet margin k (Erickson)</option>
        </select>
      </div>
      {a.target === 'db' && a.fa === 0 && (
        <Hint>
          f = 0 uses the lowest N·fsw on the bus: {fmtSI(faOf(st), 'Hz')}.
        </Hint>
      )}
      {a.target === 'emi' && !st.emi.on && (
        <p className='my-1 text-xs text-status-open'>
          Turn on the EMI card to see the limits used here.
        </p>
      )}
      <div className='grid gap-x-4 sm:grid-cols-2'>
        {a.target === 'db' && (
          <>
            <ValueRow
              id='asst-adb'
              label='Attenuation'
              unit='dB'
              value={a.aDb}
              onChange={(v) => set({ aDb: v })}
              min={ASST_LIM.aDb[0]}
              max={ASST_LIM.aDb[1]}
              linear
            />
            <ValueRow
              id='asst-fa'
              label='at f'
              unit='Hz'
              value={a.fa}
              onChange={(v) => set({ fa: v })}
              min={1e3}
              max={ASST_LIM.fa[1]}
              zero
            />
          </>
        )}
        {a.stages === 2 && (
          <ValueRow
            id='asst-split'
            label='dB split'
            unit='%'
            value={a.split}
            onChange={(v) => set({ split: v })}
            min={ASST_LIM.split[0]}
            max={ASST_LIM.split[1]}
            linear
          />
        )}
        {a.rule === 'q' && (
          <ValueRow
            id='asst-q'
            label='Target Q'
            unit=''
            value={a.q}
            onChange={(v) => set({ q: v })}
            min={ASST_LIM.q[0]}
            max={ASST_LIM.q[1]}
            linear
          />
        )}
      </div>
      {a.st.slice(0, a.stages).map((s, i) => (
        <StageRow key={i} a={a} i={i} s={s} />
      ))}
      <div className={row}>
        <span>E-series</span>
        {(['L', 'C', 'R'] as const).map((k) => (
          <label key={k} className='flex items-center gap-1'>
            {k === 'R' ? 'R' : k}
            <select
              id={`asst-ser-${k}`}
              className={selectCls}
              value={a.ser[k]}
              onChange={(ev) =>
                set({ ser: { ...a.ser, [k]: ev.target.value as ESeries } })
              }
            >
              {E_SERIES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
        ))}
        <Button id='asst-propose' size='sm' className='ml-auto' onClick={run}>
          Propose
        </Button>
      </div>
      {res && (
        <Result
          st={st}
          p={res.p}
          old={res.key !== key}
          onApply={() => apply(res.p)}
        />
      )}
    </>
  )
}

function StageRow({ a, i, s }: { a: AsstSettings; i: number; s: StageIn }) {
  const setStage = (patch: Partial<StageIn>) => {
    const next = [...a.st] as AsstSettings['st']
    next[i] = { ...s, ...patch }
    // Switching L ↔ C starts from that part's default value.
    if (patch.fix && patch.fix !== s.fix)
      next[i].val = patch.fix === 'L' ? TYPES.ind.p[0].def : TYPES.cap.p[0].def
    set({ st: next })
  }
  const spec = s.fix === 'L' ? TYPES.ind.p[0] : TYPES.cap.p[0]
  const name =
    a.stages === 1
      ? 'Stage'
      : i === 0
        ? `Stage 1 (source side), ${a.split} % of the dB`
        : `Stage 2, ${100 - a.split} % of the dB`
  return (
    <div
      className='my-1 flex flex-wrap items-center gap-1.5 text-sm'
      data-stage={i + 1}
    >
      <span className='w-full text-xs text-muted-foreground sm:w-48'>
        {name}
      </span>
      <label htmlFor={`asst-fix-${i}`} className='sr-only'>
        Fixed part
      </label>
      <select
        id={`asst-fix-${i}`}
        className={selectCls}
        value={s.fix}
        onChange={(ev) =>
          setStage({ fix: ev.target.value === 'L' ? 'L' : 'C' })
        }
      >
        <option value='C'>C fixed</option>
        <option value='L'>L fixed</option>
      </select>
      <div className='w-full sm:w-auto sm:min-w-[180px] sm:flex-1'>
        <ValueRow
          id={`asst-val-${i}`}
          label={s.fix}
          unit={s.fix === 'L' ? 'H' : 'F'}
          value={s.val}
          onChange={(v) => setStage({ val: v })}
          min={spec.min}
          max={spec.max}
        />
      </div>
      <label htmlFor={`asst-damp-${i}`} className='sr-only'>
        Damping
      </label>
      <select
        id={`asst-damp-${i}`}
        className={selectCls}
        value={s.damp}
        onChange={(ev) => setStage({ damp: ev.target.value as DampForm })}
      >
        {DAMP_FORMS.map((f) => (
          <option key={f} value={f}>
            {DAMP_FORM_LABEL[f]}
          </option>
        ))}
      </select>
    </div>
  )
}

type Part = {
  label: string
  unit: string
  get: (s: StageVals) => number | null
}

/** Rd is shown as the total damping R (part + Cd ESR). */
const PARTS: Part[] = [
  { label: 'L', unit: 'H', get: (s) => s.L },
  { label: 'C', unit: 'F', get: (s) => s.C },
  { label: 'Rd', unit: 'Ω', get: (s) => s.rd },
  { label: 'Cd', unit: 'F', get: (s) => s.cd },
  { label: 'Ld', unit: 'H', get: (s) => s.ld },
]

function Result({
  st,
  p,
  old,
  onApply,
}: {
  st: Design
  p: Proposal
  old: boolean
  onApply: () => void
}) {
  const many = p.exact.stages.length > 1
  const emi = st.asst.target === 'emi'
  return (
    <div id='asst-result' data-old={old ? 'true' : 'false'}>
      {old && (
        <p className='my-1 text-xs text-status-open'>
          The inputs changed since this proposal. Propose again to update it.
        </p>
      )}
      <div className='overflow-x-auto'>
        <table id='asst-parts' className='w-full text-sm tabular-nums'>
          <thead>
            <tr className='border-b text-xs text-muted-foreground'>
              <th className={th}>Part</th>
              <th className={th}>Exact</th>
              <th className={th}>E-series</th>
            </tr>
          </thead>
          <tbody>
            {p.exact.stages.map((s, i) =>
              PARTS.filter((pt) => pt.get(s) !== null).map((pt) => {
                const tag = many ? String(i + 1) : ''
                const moved = p.rounded.moved.includes(pt.label + tag)
                return (
                  <tr key={`${i}-${pt.label}`} className='border-b'>
                    <td className={td}>{pt.label + tag}</td>
                    <td className={td}>{fmtSI(pt.get(s), pt.unit)}</td>
                    <td
                      className={cn(td, 'font-medium')}
                      title={moved ? 'moved off the nearest value' : undefined}
                    >
                      {fmtSI(pt.get(p.rounded.stages[i]), pt.unit)}
                      {moved && ' *'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {p.exact.stages.map((s, i) => (
        <Hint key={i}>{stageLine(s, many ? i + 1 : null)}</Hint>
      ))}
      <div className='mt-2 grid gap-1.5 sm:grid-cols-2'>
        <Verdict
          id='asst-v-exact'
          title='Exact values'
          c={p.exact.check}
          st={st}
          p={p}
          emi={emi}
        />
        <Verdict
          id='asst-v-rounded'
          title='E-series values'
          c={p.rounded.check}
          st={st}
          p={p}
          emi={emi}
        />
      </div>
      {p.corner && (
        <p
          id='asst-corner'
          data-pass={p.corner.pass ? 'true' : 'false'}
          className={cn(
            'my-1.5 text-sm',
            p.corner.pass ? 'text-status-done' : 'text-status-open'
          )}
        >
          Worst corner ({p.corner.label}): margin {dB(p.corner.margin)} dB
          {p.corner.pass ? '' : ': below k, see the Corners card.'}
        </p>
      )}
      {p.rounded.moved.length > 0 && (
        <Hint>
          * Moved off the nearest E-series value to meet the targets:{' '}
          {p.rounded.moved.join(', ')}.
        </Hint>
      )}
      {p.warnings.length > 0 && (
        <ul
          id='asst-warn'
          className='my-1.5 list-disc pl-5 text-xs text-status-open'
        >
          {p.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <div className='mt-2 flex flex-wrap items-center gap-2'>
        <Button id='asst-apply' size='sm' onClick={onApply} disabled={old}>
          Apply E-series values
        </Button>
        <span className='text-xs text-muted-foreground'>
          Replaces every filter block (one undo step).
        </span>
      </div>
      <Hint>
        Nominal values: corners and tolerances are not part of the design.
        Parasitics (DCR, ESR, ESL) come from the old parts in the same place,
        else defaults; C(V) and L(I) curves are dropped.
      </Hint>
    </div>
  )
}

function stageLine(s: StageOut, n: number | null) {
  const nm = n === null ? '' : `Stage ${n}: `
  const ratio =
    s.n === null
      ? ''
      : `, n = ${s.form === 'rc' ? 'Cd/C' : 'Ld/L'} = ${s.n.toPrecision(3)}`
  return (
    `${nm}${DAMP_FORM_LABEL[s.form]}; f0 ${fmtSI(s.f0, 'Hz')}, ` +
    `Z0 ${fmtSI(s.Z0, 'Ω')}, peak target ${s.r.toPrecision(3)}·Z0, ` +
    `Qstab ${s.qStab.toPrecision(3)}${ratio}.`
  )
}

function Verdict({
  id,
  title,
  c,
  st,
  p,
  emi,
}: {
  id: string
  title: string
  c: Check
  st: Design
  p: Proposal
  emi: boolean
}) {
  return (
    <div
      id={id}
      data-pass={c.pass ? 'true' : 'false'}
      className='rounded-md border px-2 py-1.5 text-sm'
    >
      <div className='flex items-center justify-between text-xs text-muted-foreground'>
        <span>{title}</span>
        <span
          className={cn(
            'font-semibold',
            c.pass ? 'text-status-done' : 'text-destructive'
          )}
        >
          {c.pass ? 'PASS' : 'FAIL'}
        </span>
      </div>
      <div className='tabular-nums'>
        {emi
          ? `EMI margin ${c.emi === null ? '–' : dB(c.emi) + ' dB'} (≥ 0)`
          : `${dB(c.att)} dB at ${fmtSI(p.fa, 'Hz')} (≥ ${dB(st.asst.aDb)})`}
      </div>
      <div className='tabular-nums'>
        Margin {dB(c.margin)} dB (≥ {dB(st.conv.k)})
        {c.unstableAt !== null &&
          `, Nyquist fails at ${fmtSI(c.unstableAt, 'Hz')}`}
      </div>
    </div>
  )
}
