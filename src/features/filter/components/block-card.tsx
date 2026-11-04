import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Copy, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import {
  type Block,
  type Bead4Block,
  beadFromDatasheet,
  corners,
  type Curve,
  DAMP,
  type DampMode,
  dampKey,
  type Design,
  effC,
  getParam,
  interp,
  type Metrics,
  optimizeParam,
  rdForQ,
  sectionOf,
  TYPES,
} from '../engine'
import { formatCurve, parseCurve } from '../lib/curve-text'
import { closedFormFor } from '../lib/damping'
import { fmtIn, fmtSI, parseSI } from '../lib/si'
import { newId } from '../state/defaults'
import { dispatch } from '../state/store'
import { inputCls, LINEAR, selectCls } from './styles'
import { ValueRow } from './value-row'

const iconBtn = 'size-7'

function DampHelpers({ S, b }: { S: Design; b: Block }) {
  const key = dampKey(b)
  const isRc = b.type === 'rc'
  const [q, setQ] = useState(String(b._q || 0.707))
  const [qErr, setQErr] = useState(false)
  if (!key) return null
  const set = (v: number) => dispatch({ t: 'param', id: b.id, k: key, v })
  // A disabled block does not change the result, so its helpers would return nonsense.
  const off = !b.on
  const title = (t: string) => (off ? 'Enable the block first' : t)
  const esr = b.type === 'rc' ? b.esr : 0

  const optimum = () => {
    const r = optimizeParam(S, b.id, key, 1e-3, 1e4)
    set(Number(r.val.toPrecision(3)))
  }
  const closed = () => {
    const cf = closedFormFor(S, b)
    if (!cf || !cf.rd) return
    // For an Rd-Cd leg the damping R is Rd + Cd ESR, so subtract the ESR.
    const rd = isRc ? Math.max(0, cf.rd - esr) : cf.rd
    set(Number(rd.toPrecision(3)))
  }
  const forQ = () => {
    const qv = parseFloat(q),
      p = sectionOf(S, b.id)
    if (!p || !(qv > 0)) return setQErr(true)
    setQErr(false)
    dispatch({ t: 'patch', id: b.id, patch: { _q: qv } })
    const rd = rdForQ(p.Z0, qv, p.rL)
    if (!Number.isFinite(rd)) {
      toast.info(`rL alone already gives Q ≤ ${qv}. No Rd needed.`)
      return
    }
    set(Math.max(0, Number((rd - esr).toPrecision(3))))
  }

  return (
    <div className='my-1.5 flex flex-wrap items-center gap-1.5'>
      <Button
        size='sm'
        variant='secondary'
        data-h='opt'
        disabled={off}
        title={title(
          'Search Rd for the lowest peak |Zout|, all parasitics included'
        )}
        onClick={optimum}
      >
        Optimum Rd
      </Button>
      {isRc && (
        <>
          <Button
            size='sm'
            variant='secondary'
            data-h='q'
            disabled={off}
            title={title('Rd for this Q, from Rd = Z0²/(Z0/Q − rL)')}
            onClick={forQ}
          >
            Rd for Q =
          </Button>
          <input
            data-h='qv'
            aria-label='Target Q'
            className={cn(
              inputCls,
              'w-14 text-right',
              qErr && 'border-destructive ring-1 ring-destructive'
            )}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </>
      )}
      <Button
        size='sm'
        variant='secondary'
        data-h='cf'
        disabled={off}
        title={title(
          `Set Rd to the closed-form optimum for this ${isRc ? 'Cd/C' : 'Ld/L'}`
        )}
        onClick={closed}
      >
        Closed-form Rd
      </Button>
    </div>
  )
}

function BeadHelper({ b }: { b: Bead4Block }) {
  const [v, setV] = useState(() => ({
    rdc: fmtIn(b.rs),
    fx: '1M',
    x: fmtIn(2 * Math.PI * 1e6 * b.lb),
    fsrf: b.cb > 0 ? fmtIn(1 / (2 * Math.PI * Math.sqrt(b.lb * b.cb))) : '',
    zmax: fmtIn(b.rs + b.rp),
  }))
  const [bad, setBad] = useState<Record<string, boolean>>({})
  type K = keyof typeof v
  const field = (k: K, w = 'w-16', placeholder?: string) => (
    <input
      data-k={k}
      className={cn(
        inputCls,
        w,
        'text-right',
        bad[k] && 'border-destructive ring-1 ring-destructive'
      )}
      placeholder={placeholder}
      value={v[k]}
      onChange={(e) => setV({ ...v, [k]: e.target.value })}
    />
  )
  const apply = () => {
    const n = {
      rdc: parseSI(v.rdc),
      fx: parseSI(v.fx),
      x: parseSI(v.x),
      fsrf: v.fsrf.trim() === '' ? 0 : parseSI(v.fsrf),
      zmax: parseSI(v.zmax),
    }
    // Rdc may be 0; fx, X and |Z| must be > 0; f_SRF is 0 (none) or above fx; |Z| above Rdc.
    const b2 = {
      rdc: !(n.rdc >= 0),
      fx: !(n.fx > 0),
      x: !(n.x > 0),
      zmax: !(n.zmax > n.rdc),
      fsrf: !(n.fsrf === 0 || n.fsrf > n.fx),
    }
    setBad(b2)
    if (Object.values(b2).some(Boolean)) return
    dispatch({ t: 'patch', id: b.id, patch: beadFromDatasheet(n) })
  }
  return (
    <details className='mt-1 text-sm'>
      <summary className='cursor-pointer text-muted-foreground'>
        Fill from datasheet points (NP-DR-26004)
      </summary>
      <div className='my-1.5 flex flex-wrap items-center gap-1.5'>
        <span>Rdc</span>
        {field('rdc')}
        <span>X at</span>
        {field('fx')}
        <span>=</span>
        {field('x')}Ω
      </div>
      <div className='my-1.5 flex flex-wrap items-center gap-1.5'>
        <span>
          f<sub>SRF</sub>
        </span>
        {field('fsrf', 'w-16', 'none')}
        <span>|Z| at SRF</span>
        {field('zmax')}Ω
        <Button size='sm' variant='secondary' onClick={apply}>
          Apply
        </Button>
      </div>
      <p className='text-xs text-muted-foreground'>
        Lb = X/(2πf) at low f, Rp = |Z|(f<sub>SRF</sub>) − Rs, Cb = 1/((2πf
        <sub>SRF</sub>)²·Lb). Leave f<sub>SRF</sub> empty for Cb = 0.
      </p>
    </details>
  )
}

/** Which curve a block can carry: C against DC bias, or L against DC current. */
function curveKind(b: Block) {
  if (b.type === 'cap')
    return { key: 'cv', title: 'C vs DC bias', x: 'V', y: 'F' } as const
  if (b.type === 'ind' || b.type === 'bead2' || b.type === 'bead4')
    return { key: 'li', title: 'L vs DC current', x: 'A', y: 'H' } as const
  return null
}

function CurveEditor({ S, b }: { S: Design; b: Block }) {
  const kind = curveKind(b)
  const [text, setText] = useState<string | null>(null)
  if (!kind) return null
  const stored = (b as { cv?: Curve; li?: Curve })[kind.key]
  const shown = text ?? (stored ? formatCurve(stored, kind.x, kind.y) : '')
  const { errors } = parseCurve(shown)

  const commit = () => {
    if (text === null) return
    const r = parseCurve(text)
    if (r.points.length > 0) {
      dispatch({ t: 'patch', id: b.id, patch: { [kind.key]: r.points } })
    } else if (r.errors.length === 0) {
      // Empty text removes the curve. Build a copy without the key, so no
      // own key with value undefined is left in the design.
      if (stored) {
        const nb = { ...b } as Record<string, unknown>
        delete nb[kind.key]
        dispatch({
          t: 'replace',
          st: {
            ...S,
            blocks: S.blocks.map((x) => (x.id === b.id ? (nb as Block) : x)),
          },
        })
      }
    } else return // only bad lines: keep the draft and the old curve
    if (r.errors.length === 0) setText(null)
  }

  const rows: string[] = []
  if (stored) {
    const cs = corners(S)
    if (kind.key === 'cv') {
      for (const vin of new Set(cs.map((c) => c.vin)))
        rows.push(`${fmtSI(vin, 'V')}: ${fmtSI(interp(stored, vin), 'F')}`)
    } else {
      for (const c of cs)
        rows.push(
          `${c.label} (${fmtSI(c.i, 'A')}): ${fmtSI(interp(stored, c.i), 'H')}`
        )
    }
  }

  return (
    <Collapsible className='mt-1.5'>
      <CollapsibleTrigger
        id={`curve-btn-${b.id}`}
        className='group flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
      >
        <ChevronRight className='size-4 transition-transform group-data-[state=open]:rotate-90' />
        {kind.title}
        {stored && (
          <span className='rounded bg-secondary px-1.5 text-xs text-secondary-foreground'>
            {stored.length} pts
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Textarea
          id={`curve-${b.id}`}
          aria-label={kind.title}
          spellCheck={false}
          rows={5}
          placeholder={`One point per line: ${kind.x === 'V' ? '12 V, 3.96 µF' : '1.5 A, 2.2 µH'}`}
          aria-invalid={errors.length > 0 || undefined}
          className='mt-1.5 max-h-48 min-h-20 px-2 py-1 font-mono text-xs md:text-xs'
          value={shown}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />
        <div className='mt-1 text-xs text-muted-foreground'>
          {stored && (
            <>
              <p>{stored.length} points. Value at each corner:</p>
              <ul className='ml-4 list-disc break-words'>
                {rows.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}
          {errors.length > 0 && (
            <ul className='mt-1 ml-4 list-disc break-words text-destructive'>
              {errors.map((e) => (
                <li key={e.line}>
                  Line {e.line}: {e.msg}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Hint lines under a block: effective C, SRF, its LC section, losses. */
function InfoLines({ S, b, m }: { S: Design; b: Block; m: Metrics }) {
  const parts: React.ReactNode[] = []
  if (b.type === 'cap') {
    const ce = effC(b)
    parts.push(
      `C eff total ${fmtSI(ce * b.n, 'F')}, SRF ${b.esl > 0 ? fmtSI(1 / (2 * Math.PI * Math.sqrt(b.esl * ce)), 'Hz') : '–'}`
    )
  }
  if (b.type === 'bead4')
    parts.push(
      `SRF ${b.cb > 0 ? fmtSI(1 / (2 * Math.PI * Math.sqrt(b.lb * b.cb)), 'Hz') : '–'}, |Z|max ≈ ${fmtSI(b.rs + b.rp, 'Ω')}`
    )
  const key = dampKey(b)
  const sec = key ? sectionOf(S, b.id) : null // the LC section this damping belongs to
  if (sec) {
    const cf = closedFormFor(S, b)
    if (cf && cf.rd)
      parts.push(
        <>
          {sec.block.name} section · {cf.nLabel} n = {cf.n.toFixed(2)} ·
          closed-form (lossless) Rd <b>{fmtSI(cf.rd, 'Ω')}</b>, peak{' '}
          {fmtSI(cf.peak, 'Ω')}
        </>
      )
    if (b.type === 'rc') {
      const rTot = b.rd + b.esr
      parts.push(
        `Rd total ${fmtSI(rTot, 'Ω')} · Cd ≥ 10/(2πf0·Rd) = ${rTot > 0 ? fmtSI(10 / (2 * Math.PI * sec.f0 * rTot), 'F') : '–'}`
      )
    }
  }
  const ac = m.ripple.perBlock[b.id]
  if (b.on && ac > 0 && (b.type === 'rc' || key))
    parts.push(`AC loss ${fmtSI(ac, 'W')}`)
  return (
    <p id={'info-' + b.id} className='mt-1 text-xs text-muted-foreground'>
      {parts.map((p, i) => (
        <span key={i} className='block'>
          {p}
        </span>
      ))}
    </p>
  )
}

export function BlockCard({
  S,
  b,
  m,
  index,
}: {
  S: Design
  b: Block
  m: Metrics | null
  index: number
}) {
  const T = TYPES[b.type]
  const [name, setName] = useState<string | null>(null)
  const last = S.blocks.length - 1
  return (
    <Card
      id={'card-' + b.id}
      data-kind={T.kind}
      className={cn(
        'blk gap-0 border-l-4 px-3 py-2.5',
        T.kind === 'series' ? 'border-l-chart-1' : 'shunt border-l-chart-2',
        !b.on && 'off opacity-55'
      )}
    >
      <div className='mb-1.5 flex items-center gap-1.5'>
        <input
          type='checkbox'
          title='Enable'
          aria-label={`Enable ${b.name}`}
          className='size-4 accent-primary'
          checked={b.on}
          onChange={(e) =>
            dispatch({ t: 'patch', id: b.id, patch: { on: e.target.checked } })
          }
        />
        <input
          className={cn(inputCls, 'name w-20 font-semibold')}
          aria-label='Name'
          value={name ?? b.name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name !== null && name.trim())
              dispatch({ t: 'patch', id: b.id, patch: { name: name.trim() } })
            setName(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className='min-w-0 flex-1 truncate text-xs text-muted-foreground'>
          {T.kind} · {T.label}
        </span>
        <Button
          size='icon'
          variant='ghost'
          className={iconBtn}
          title='Move toward source'
          data-a='up'
          disabled={index === 0}
          onClick={() => dispatch({ t: 'move', id: b.id, dir: -1 })}
        >
          <ArrowUp />
        </Button>
        <Button
          size='icon'
          variant='ghost'
          className={iconBtn}
          title='Move toward converter'
          data-a='dn'
          disabled={index === last}
          onClick={() => dispatch({ t: 'move', id: b.id, dir: 1 })}
        >
          <ArrowDown />
        </Button>
        <Button
          size='icon'
          variant='ghost'
          className={iconBtn}
          title='Duplicate'
          data-a='dup'
          onClick={() => dispatch({ t: 'dup', id: b.id, newId: newId() })}
        >
          <Copy />
        </Button>
        <Button
          size='icon'
          variant='ghost'
          className={iconBtn}
          title='Remove'
          data-a='rm'
          onClick={() => dispatch({ t: 'remove', id: b.id })}
        >
          <X />
        </Button>
      </div>
      {T.p.map((p) => (
        <ValueRow
          key={p.key}
          id={`in-${b.id}-${p.key}`}
          label={p.label}
          unit={p.unit}
          value={getParam(b, p.key)}
          onChange={(v) => dispatch({ t: 'param', id: b.id, k: p.key, v })}
          min={p.min}
          max={p.max}
          zero={p.allowZero}
          linear={LINEAR.has(p.key)}
          int={p.key === 'n'}
        />
      ))}
      {b.type === 'ind' && (
        <>
          <div className='my-1.5 flex flex-wrap items-center gap-1.5 text-sm'>
            <label htmlFor={`dm-${b.id}`} className='text-muted-foreground'>
              Damping
            </label>
            <select
              id={`dm-${b.id}`}
              className={cn(selectCls, 'min-w-0 flex-1')}
              value={b.dmode}
              onChange={(e) =>
                dispatch({
                  t: 'patch',
                  id: b.id,
                  patch: { dmode: e.target.value as DampMode },
                })
              }
            >
              {Object.entries(DAMP).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {b.dmode !== 'none' && (
            <ValueRow
              id={`in-${b.id}-dR`}
              label='Rd'
              unit='Ω'
              value={b.dR}
              onChange={(v) => dispatch({ t: 'param', id: b.id, k: 'dR', v })}
              min={1e-3}
              max={1e4}
            />
          )}
          {(b.dmode === 'RLpar' || b.dmode === 'RLser') && (
            <ValueRow
              id={`in-${b.id}-dL`}
              label='Ld'
              unit='H'
              value={b.dL}
              onChange={(v) => dispatch({ t: 'param', id: b.id, k: 'dL', v })}
              min={1e-9}
              max={10e-3}
            />
          )}
        </>
      )}
      <CurveEditor S={S} b={b} />
      <DampHelpers S={S} b={b} />
      {b.type === 'bead4' && (
        <BeadHelper key={[b.rs, b.lb, b.rp, b.cb].join()} b={b} />
      )}
      {m && <InfoLines S={S} b={b} m={m} />}
    </Card>
  )
}
