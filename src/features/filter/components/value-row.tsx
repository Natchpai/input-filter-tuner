import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { stepE } from '../engine'
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

/** Decades the log slider covers around its value (×/÷ 10). */
const SPAN = 100

/**
 * The log slider's range: SPAN wide around `at`, inside [min, max]. A value
 * of 0 (a `zero` field) gets the full range.
 */
function sliderWindow(at: number, min: number, max: number): [number, number] {
  if (!(at > 0) || max / min <= SPAN) return [min, max]
  const lo = Math.min(Math.max(at / Math.sqrt(SPAN), min), max / SPAN)
  return [lo, lo * SPAN]
}

/** Pixel wheel delta for one step (a mouse notch is about 100 px). */
const WHEEL_PX = 50

/** Parts that step by E-series values. */
const E_UNITS = new Set(['H', 'F', 'Ω'])

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
  /** Text box only (no label or slider); label becomes aria-label. */
  bare?: boolean
}

/**
 * One numeric parameter: label, SI text box with the unit inside, slider.
 * Text commits on Enter or blur; Escape puts the value back. Up/Down (and
 * the wheel while the box has focus) step L, C and R by one E24 value
 * (Shift: E6), other log fields ×1.05 (Shift ×1.25), linear fields 1 % of
 * the range (Shift 5 %). The log slider covers ÷10 to ×10 around the value
 * and re-centres when a drag ends.
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
  // The slider window follows the value, but not during a drag.
  const [drag, setDrag] = useState(false)
  const [anchor, setAnchor] = useState(value)
  if (!drag && anchor !== value) setAnchor(value)
  const [lo, hi] = linear ? [min, max] : sliderWindow(anchor, min, max)

  const show = (v: number) => (linear ? String(v) : fmtIn(v))
  const toPos = (v: number) =>
    linear
      ? Math.round((1000 * (v - min)) / (max - min))
      : sliderPos(v, lo, hi, zero)
  const fromPos = (p: number) => {
    if (!linear) return sliderVal(p, lo, hi, zero)
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

  const step = (up: boolean, big: boolean) => {
    // Step from the typed text when there is valid text, so it is not lost.
    const typed =
      draft === null ? NaN : linear ? parseFloat(draft) : parseSI(draft)
    let v = Number.isFinite(typed) && typed >= 0 ? typed : value
    if (linear) {
      const st = int ? 1 : ((max - min) / 100) * (big ? 5 : 1)
      // toPrecision drops the float noise of the sum (6 + 3 × 0.2).
      v = Math.min(max, Math.max(min, v + (up ? st : -st)))
      v = Number(v.toPrecision(12))
    } else if (v === 0) {
      v = up ? min : 0
    } else if (E_UNITS.has(unit)) {
      v = stepE(v, big ? 'E6' : 'E24', up ? 1 : -1)
    } else {
      const f = big ? 1.25 : 1.05
      v = Number((v * (up ? f : 1 / f)).toPrecision(4))
    }
    commit(v)
  }
  // The wheel listener must not be passive, so the pane does not scroll too.
  const stepRef = useRef(step)
  useEffect(() => {
    stepRef.current = step
  })
  const boxRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    // A touchpad sends many small pixel deltas: add them up and step once per
    // WHEEL_PX, about one mouse notch. Line or page deltas step once each.
    let acc = 0
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== el) return
      // Shift+wheel scrolls sideways in Windows browsers (deltaY 0).
      const d = e.deltaY || e.deltaX
      if (d === 0) return
      e.preventDefault()
      if (e.deltaMode === 0) {
        acc = Math.sign(acc) === Math.sign(d) ? acc + d : d
        if (Math.abs(acc) < WHEEL_PX) return
      }
      acc = 0
      stepRef.current(d < 0, e.shiftKey)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      setDraft(null)
      setErr(false)
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      step(e.key === 'ArrowUp', e.shiftKey)
    }
  }

  const pad = unit.length > 1 ? 'pr-7' : unit ? 'pr-5' : ''
  const box = (
    <div className='relative min-w-0'>
      <input
        ref={boxRef}
        id={id}
        type='text'
        spellCheck={false}
        autoComplete='off'
        aria-label={bare ? label : undefined}
        aria-invalid={err || undefined}
        className={cn(
          inputCls,
          'w-full text-right',
          pad,
          err && 'border-destructive ring-1 ring-destructive'
        )}
        value={draft ?? show(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== null && commitText(draft)}
        onKeyDown={onKeyDown}
      />
      {unit && (
        <span className='pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-xs text-muted-foreground'>
          {unit}
        </span>
      )}
    </div>
  )
  if (bare) return box

  const endDrag = () => setDrag(false)
  return (
    <div className='my-1 grid grid-cols-[minmax(0,88px)_112px_minmax(0,1fr)] items-center gap-1.5'>
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
        onPointerDown={() => setDrag(true)}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={() => setDrag(true)}
        onKeyUp={endDrag}
        onBlur={endDrag}
        onChange={(e) => {
          setDraft(null)
          setErr(false)
          onChange(fromPos(+e.target.value))
        }}
      />
    </div>
  )
}
