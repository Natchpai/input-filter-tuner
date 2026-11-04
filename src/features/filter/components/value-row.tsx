import { useState } from 'react'
import { cn } from '@/lib/utils'
import { fmtIn, parseSI } from '../lib/si'
import { inputCls } from './styles'

function sliderPos(v: number, min: number, max: number, zero: boolean) {
  if (zero && v <= 0) return 0
  const lo = Math.log(min),
    hi = Math.log(max)
  const t = (Math.log(Math.min(Math.max(v, min), max)) - lo) / (hi - lo)
  return Math.round((zero ? 20 : 0) + t * (zero ? 980 : 1000))
}
function sliderVal(pos: number, min: number, max: number, zero: boolean) {
  if (zero && pos <= 10) return 0
  const t = zero ? (pos - 20) / 980 : pos / 1000
  const v = Math.exp(
    Math.log(min) + Math.max(0, t) * (Math.log(max) - Math.log(min))
  )
  return Number(v.toPrecision(3))
}

type Props = {
  id: string
  label: string
  unit: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  /** 0 is allowed (the part is left out). */
  zero?: boolean
  linear?: boolean
  int?: boolean
  /** Text box only (no label, slider or unit); label becomes aria-label. */
  bare?: boolean
}

/**
 * One numeric parameter: label, SI text box, slider, unit. Text commits on
 * Enter or blur; arrow keys step ×1.05 (Shift ×1.25), or 1 % of the range on
 * linear fields.
 */
export function ValueRow({
  id,
  label,
  unit,
  value,
  onChange,
  min,
  max,
  zero = false,
  linear = false,
  int = false,
  bare = false,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  const show = (v: number) => (linear ? String(v) : fmtIn(v))
  const toPos = (v: number) =>
    linear
      ? Math.round((1000 * (v - min)) / (max - min))
      : sliderPos(v, min, max, zero)
  const fromPos = (p: number) => {
    if (!linear) return sliderVal(p, min, max, zero)
    const v = min + ((max - min) * p) / 1000
    return int ? Math.round(v) : Number(v.toPrecision(3))
  }

  const commit = (raw: number) => {
    let v = raw
    if (!Number.isFinite(v)) return setErr(true)
    if (linear)
      v = Math.min(max, Math.max(min, v)) // linear fields have hard limits
    else if (v < 0 || (!zero && v === 0)) return setErr(true)
    if (int) v = Math.round(v)
    setErr(false)
    setDraft(null)
    onChange(v)
  }
  const commitText = (s: string) => commit(linear ? parseFloat(s) : parseSI(s))

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const up = e.key === 'ArrowUp'
      let v = value
      if (linear) {
        const st = int ? 1 : ((max - min) / 100) * (e.shiftKey ? 5 : 1)
        v = Math.min(max, Math.max(min, v + (up ? st : -st)))
      } else {
        const f = e.shiftKey ? 1.25 : 1.05
        v = v === 0 ? min : v * (up ? f : 1 / f)
        v = Number(v.toPrecision(4))
      }
      commit(v)
    }
  }

  const box = (
    <input
      id={id}
      type='text'
      spellCheck={false}
      autoComplete='off'
      aria-label={bare ? label : undefined}
      aria-invalid={err || undefined}
      className={cn(
        inputCls,
        'w-full text-right',
        err && 'border-destructive ring-1 ring-destructive'
      )}
      value={draft ?? show(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== null && commitText(draft)}
      onKeyDown={onKeyDown}
    />
  )
  if (bare) return box

  return (
    <div className='my-1 grid grid-cols-[minmax(0,88px)_88px_minmax(0,1fr)_22px] items-center gap-1.5'>
      <label
        htmlFor={id}
        title={label}
        className='truncate text-sm text-muted-foreground'
      >
        {label}
      </label>
      {box}
      <input
        type='range'
        min={0}
        max={1000}
        step={1}
        aria-label={label + ' slider'}
        className='w-full accent-primary'
        value={toPos(value)}
        onChange={(e) => {
          setDraft(null)
          setErr(false)
          onChange(fromPos(+e.target.value))
        }}
      />
      <span className='text-xs text-muted-foreground'>{unit}</span>
    </div>
  )
}
