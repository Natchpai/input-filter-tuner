import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Ellipsis,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  MAX_BLOCK_NAME,
  MAX_TOL,
  type Metrics,
  optimizeParam,
  rdForQ,
  sectionOf,
  TOL_KEYS,
  tolLabel,
  type TolKey,
  TYPES,
} from '../engine'
import { formatCurve, parseCurve } from '../lib/curve-text'
import { closedFormFor, dampSources } from '../lib/damping'
import { fmtIn, fmtSI, parseSI } from '../lib/si'
import { newId } from '../state/defaults'
import { dispatch } from '../state/store'
import { blockSummary } from './block-summary'
import { useHintScope } from './hint-scope'
import { inputCls, LINEAR, selectCls } from './styles'
import {
  Hint,
  HintButton,
  HintScope,
  Note,
  SourceLine,
  SourceMark,
} from './tool-card'
import { setOpen, useUi } from './ui-store'
import { ValueRow } from './value-row'

const iconBtn = 'size-6'
const badge =
  'shrink-0 rounded bg-secondary px-1.5 text-xs text-secondary-foreground'

function DampHelpers({ S, b }: { S: Design; b: Block }) {
  const key = dampKey(b)
  const isRc = b.type === 'rc'
  const [q, setQ] = useState(String(b._q || 0.707))
  const [qErr, setQErr] = useState(false)
  const [src, setSrc] = useState<number | null>(null)
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

  // One short line: the closed-form target, and a Cd warning when Cd is
  // below 10/(2π·f0·Rd). The rest is in the block's hint (InfoLines).
  const cf = closedFormFor(S, b)
  const sec = sectionOf(S, b.id)
  const rTot = isRc ? b.rd + b.esr : 0
  const cdMin =
    isRc && sec && rTot > 0 ? 10 / (2 * Math.PI * sec.f0 * rTot) : null
  const cdLow = isRc && cdMin !== null && b.cd < cdMin * (1 - 1e-6)
  // Source marks: ¹ closed form, ² the Cd rule. One line open at a time.
  const srcText = dampSources(S, b)
  const marks = [srcText.cf, cdLow ? srcText.cd : null]
  const srcId = (n: number) => `src-${b.id}-${n}`
  const mark = (n: number) => (
    <SourceMark
      n={n}
      id={srcId(n)}
      open={src === n}
      text={marks[n - 1]!}
      onToggle={() => setSrc(src === n ? null : n)}
    />
  )
  const openText = src !== null ? marks[src - 1] : null

  return (
    <div className='my-1.5'>
      <div className='flex flex-wrap items-center gap-1.5'>
        {isRc && (
          <>
            <label
              htmlFor={`qv-${b.id}`}
              className='text-sm text-muted-foreground'
            >
              Q
            </label>
            <input
              id={`qv-${b.id}`}
              data-h='qv'
              aria-label='Target Q'
              className={cn(
                inputCls,
                'w-14 text-right',
                qErr && 'border-destructive ring-1 ring-destructive'
              )}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !off && forQ()}
            />
            <Button
              size='sm'
              variant='secondary'
              data-h='q'
              disabled={off}
              title={title('Rd for this Q, from Rd = Z0²/(Z0/Q − rL)')}
              onClick={forQ}
            >
              Set Rd for Q
            </Button>
          </>
        )}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              size='sm'
              variant='secondary'
              data-h='menu'
              disabled={off}
              title={title(isRc ? 'Other ways to set Rd' : 'Set Rd')}
              aria-label={isRc ? 'Other ways to set Rd' : undefined}
            >
              {isRc ? (
                <Ellipsis />
              ) : (
                <>
                  Set Rd
                  <ChevronDown />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            <DropdownMenuItem
              data-h='opt'
              title='Search Rd for the lowest peak |Zout|, all parasitics included'
              onSelect={optimum}
            >
              Optimum (numeric)
            </DropdownMenuItem>
            <DropdownMenuItem
              data-h='cf'
              disabled={!cf?.rd}
              title={`The closed-form optimum for this ${isRc ? 'Cd/C' : 'Ld/L'}`}
              onSelect={closed}
            >
              Closed form
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {cf?.rd ? (
        <Note>
          closed-form Rd {fmtSI(cf.rd, 'Ω')} · peak {fmtSI(cf.peak!, 'Ω')}
          {marks[0] && mark(1)}
          {cdLow && (
            <span className='text-status-open'>
              {' '}
              · Cd ≥ {fmtSI(cdMin!, 'F')}
            </span>
          )}
          {cdLow && marks[1] && mark(2)}
        </Note>
      ) : null}
      {cf?.rd && openText ? (
        <SourceLine n={src!} id={srcId(src!)}>
          {openText}
        </SourceLine>
      ) : null}
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
      <Hint className='mt-0'>
        Lb = X/(2πf) at low f, Rp = |Z|(f<sub>SRF</sub>) − Rs, Cb = 1/((2πf
        <sub>SRF</sub>)²·Lb). Leave f<sub>SRF</sub> empty for Cb = 0.
      </Hint>
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

/** Tolerance keys shown for a block. Ind damping values only when in use. */
function shownTolKeys(b: Block): TolKey[] {
  const keys = [...TOL_KEYS[b.type]] as TolKey[]
  if (b.type !== 'ind') return keys
  return keys.filter(
    (k) =>
      k === 'L' ||
      (k === 'dR' && b.dmode !== 'none') ||
      (k === 'dL' && (b.dmode === 'RLpar' || b.dmode === 'RLser'))
  )
}

function ToleranceEditor({ b }: { b: Block }) {
  const keys = shownTolKeys(b)
  const tol = (b.tol ?? {}) as Record<string, number>
  const set = keys.filter((k) => tol[k] > 0).length
  return (
    <Collapsible className='mt-1.5'>
      <CollapsibleTrigger
        id={`tol-btn-${b.id}`}
        className='group flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
      >
        <ChevronRight className='size-4 transition-transform group-data-[state=open]:rotate-90' />
        Tolerance
        {set > 0 && (
          <span className='rounded bg-secondary px-1.5 text-xs text-secondary-foreground'>
            {set} tol
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {keys.map((k) => (
          <ValueRow
            key={k}
            id={`tol-${b.id}-${k}`}
            label={`${tolLabel(b.type, k)} ±%`}
            unit='%'
            value={tol[k] ?? 0}
            onChange={(v) => dispatch({ t: 'tol', id: b.id, k, v })}
            min={0}
            max={MAX_TOL}
            linear
          />
        ))}
        <Hint>
          ± % on each value, 0 for none. The Tolerance tab uses them; uniform in
          Monte Carlo.
        </Hint>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Hint lines under a block: effective C, SRF, its LC section, losses. Hidden
 * unless the block's hints show. */
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
  if (parts.length === 0) return null
  return (
    <Hint id={'info-' + b.id}>
      {parts.map((p, i) => (
        <span key={i} className='block'>
          {p}
        </span>
      ))}
    </Hint>
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
  const hints = useHintScope()
  const open = useUi().open.has(b.id)
  const last = S.blocks.length - 1
  const fold = () => setOpen(b.id)
  // Folded: the badges the open card shows in its Curve and Tolerance rows.
  const nTol = shownTolKeys(b).filter(
    (k) => ((b.tol ?? {}) as Record<string, number>)[k] > 0
  ).length
  const kind = curveKind(b)
  const nPts = kind
    ? ((b as { cv?: Curve; li?: Curve })[kind.key]?.length ?? 0)
    : 0
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
      <div className={cn('flex items-center gap-1.5', open && 'mb-1.5')}>
        <Button
          size='icon'
          variant='ghost'
          className={cn(iconBtn, '-ml-1 text-muted-foreground')}
          data-a='fold'
          aria-expanded={open}
          title={open ? 'Fold the card' : 'Open the card'}
          aria-label={`${open ? 'Fold' : 'Open'} ${b.name}`}
          onClick={fold}
        >
          <ChevronRight
            className={cn('transition-transform', open && 'rotate-90')}
          />
        </Button>
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
          className={cn(inputCls, 'name w-16 font-semibold')}
          aria-label='Name'
          maxLength={MAX_BLOCK_NAME}
          value={name ?? b.name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name !== null && name.trim())
              dispatch({ t: 'patch', id: b.id, patch: { name: name.trim() } })
            setName(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <button
          type='button'
          className='summary min-w-0 flex-1 truncate text-left text-xs text-muted-foreground hover:text-foreground'
          title={`${T.kind} · ${T.label}: ${blockSummary(b)}`}
          onClick={fold}
        >
          {open ? `${T.kind} · ${T.label}` : blockSummary(b)}
        </button>
        {!open && nPts > 0 && <span className={badge}>{nPts} pts</span>}
        {!open && nTol > 0 && <span className={badge}>{nTol} tol</span>}
        {open && <HintButton scope={hints} />}
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
          onClick={() => {
            const id = newId()
            dispatch({ t: 'dup', id: b.id, newId: id })
            setOpen(id, true)
          }}
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
      {open && (
        <HintScope show={hints.show}>
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
                  onChange={(v) =>
                    dispatch({ t: 'param', id: b.id, k: 'dR', v })
                  }
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
                  onChange={(v) =>
                    dispatch({ t: 'param', id: b.id, k: 'dL', v })
                  }
                  min={1e-9}
                  max={10e-3}
                />
              )}
            </>
          )}
          <CurveEditor S={S} b={b} />
          <ToleranceEditor b={b} />
          <DampHelpers S={S} b={b} />
          {b.type === 'bead4' && (
            <BeadHelper key={[b.rs, b.lb, b.rp, b.cb].join()} b={b} />
          )}
          {m && <InfoLines S={S} b={b} m={m} />}
        </HintScope>
      )}
    </Card>
  )
}
