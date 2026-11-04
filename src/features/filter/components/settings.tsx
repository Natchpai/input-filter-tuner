import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  BLOCK_TYPES,
  type BlockType,
  type Conv,
  type Design,
  MAX_LOADS,
  type PlotSettings,
  type Source,
  TYPES,
} from '../engine'
import { fmtSI } from '../lib/si'
import { mk, mkLoad } from '../state/defaults'
import { dispatch } from '../state/store'
import { CONV_FIELDS, ZERO_OK } from './fields'
import { LINEAR, selectCls } from './styles'
import { ToolCard } from './tool-card'
import { setOpen } from './ui-store'
import { ValueRow } from './value-row'

/** Vin min, nom and max share one row of text boxes, no sliders. */
const VIN_FIELDS: [keyof Conv, string][] = [
  ['vinMin', 'min'],
  ['vinNom', 'nom'],
  ['vinMax', 'max'],
]
const SRC_FIELDS: [keyof Source, string, string, number, number][] = [
  ['R', 'Rsrc', 'Ω', 1e-4, 100],
  ['L', 'Lsrc', 'H', 1e-9, 100e-6],
]

/** Adds a converter on the bus (M5): a copy of converter 1's own fields. */
function addConv(S: Design) {
  const names = new Set(S.loads.map((l) => l.name))
  let n = S.loads.length + 2
  while (names.has(`Conv ${n}`)) n++
  const l = mkLoad(S.conv, `Conv ${n}`)
  dispatch({ t: 'loadAdd', load: l })
  setOpen(l.id, true)
  requestAnimationFrame(() =>
    document
      .getElementById('conv-' + l.id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  )
}

export function ConverterCard({ S }: { S: Design }) {
  const many = S.loads.length > 0
  return (
    <ToolCard
      title={many ? 'Conv 1 (load) and bus' : 'Converter (load)'}
      info={
        <>
          Several converters on one bus: Vin and k here are bus fields; each
          converter has its own power, efficiency, fsw, phases and f check.
          Below its f check a converter counts in the parallel |R<sub>n</sub>|,
          above it it drops out, so the check range splits into bands. Converter
          input is modelled as a negative resistance R<sub>n</sub> = −V
          <sub>in</sub>²·η/P, valid below the converter loop crossover. Margin
          is checked at V<sub>in,min</sub> up to f<sub>check</sub>. Light load
          only sets the DC current for L-vs-I curves. |R
          <sub>n</sub>| always uses full power. The three Vin fields need not be
          in order.
        </>
      }
    >
      <div className='my-1 grid grid-cols-[minmax(0,88px)_repeat(3,minmax(0,1fr))_22px] items-center gap-1.5'>
        <label htmlFor='cv-vinMin' className='text-sm text-muted-foreground'>
          Vin
        </label>
        {VIN_FIELDS.map(([k, l]) => (
          <div key={k} className='relative'>
            <span className='pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[10px] text-muted-foreground'>
              {l}
            </span>
            <ValueRow
              bare
              id={'cv-' + k}
              label={'Vin ' + l}
              unit='V'
              value={S.conv[k]}
              onChange={(v) => dispatch({ t: 'conv', k, v })}
              min={1}
              max={1000}
            />
          </div>
        ))}
        <span className='text-xs text-muted-foreground'>V</span>
      </div>
      {CONV_FIELDS.map(([k, l, u, mn, mx]) => (
        <ValueRow
          key={k}
          id={'cv-' + k}
          label={l}
          unit={u}
          value={S.conv[k]}
          onChange={(v) => dispatch({ t: 'conv', k, v })}
          min={mn}
          max={mx}
          zero={ZERO_OK.has(k)}
          linear={LINEAR.has(k)}
          int={k === 'phases'}
        />
      ))}
      <Button
        id='bAddConv'
        size='sm'
        variant='secondary'
        className='mt-1.5'
        disabled={S.loads.length >= MAX_LOADS}
        title='Add a converter on the same bus'
        onClick={() => addConv(S)}
      >
        + Converter
      </Button>
    </ToolCard>
  )
}

export function SourceCard({ S }: { S: Design }) {
  return (
    <ToolCard
      title='Source'
      info={
        <>
          Ideal source when both are 0. Z<sub>out</sub> is seen from the
          converter with the source voltage shorted, so R<sub>src</sub> and L
          <sub>src</sub> stay in the path.
        </>
      }
    >
      {SRC_FIELDS.map(([k, l, u, mn, mx]) => (
        <ValueRow
          key={k}
          id={'src-' + k}
          label={l}
          unit={u}
          value={S.source[k]}
          onChange={(v) => dispatch({ t: 'source', k, v })}
          min={mn}
          max={mx}
          zero
        />
      ))}
    </ToolCard>
  )
}

const ADD_LABELS: Record<BlockType, string> = {
  ind: '+ Inductor',
  bead2: '+ Bead (2-el)',
  bead4: '+ Bead (4-el)',
  res: '+ Series R',
  cap: '+ Capacitor',
  rc: '+ Rd-Cd leg',
}

export function AddBlockCard({ S }: { S: Design }) {
  const add = (t: BlockType) => {
    const T = TYPES[t]
    const count =
      S.blocks.filter((b) => TYPES[b.type].prefix === T.prefix).length + 1
    const b = mk(t, T.prefix + count)
    dispatch({ t: 'add', block: b })
    setOpen(b.id, true)
    requestAnimationFrame(() =>
      document
        .getElementById('card-' + b.id)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    )
  }
  return (
    <ToolCard title='Add block (added next to the converter)'>
      <div className='flex flex-wrap gap-1.5'>
        {BLOCK_TYPES.map((t) => (
          <Button
            key={t}
            size='sm'
            variant='secondary'
            data-add={t}
            onClick={() => add(t)}
          >
            {ADD_LABELS[t]}
          </Button>
        ))}
      </div>
    </ToolCard>
  )
}

export function PlotSettingsCard({ S }: { S: Design }) {
  const pl = S.plot
  const set = (patch: Partial<PlotSettings>) => dispatch({ t: 'plot', patch })
  const row = 'my-1.5 flex flex-wrap items-center gap-1.5 text-sm'
  return (
    <ToolCard
      title='Plot settings'
      collapse='plot'
      summary={`${pl.xfer === 'H' ? 'H' : 'S21'}, ${fmtSI(pl.fmin, 'Hz')} to ${fmtSI(pl.fmax, 'Hz')}, ${pl.n} points`}
    >
      <div className={row}>
        <label htmlFor='ps-xfer'>Transfer plot</label>
        <select
          id='ps-xfer'
          className={selectCls}
          value={pl.xfer}
          onChange={(e) =>
            set({ xfer: e.target.value as PlotSettings['xfer'] })
          }
        >
          <option value='H'>H = Vout/Vsrc</option>
          <option value='S21'>S21 (50 Ω ports)</option>
        </select>
        <label htmlFor='ps-load'>H load</label>
        <select
          id='ps-load'
          className={selectCls}
          value={pl.load}
          onChange={(e) =>
            set({ load: e.target.value as PlotSettings['load'] })
          }
        >
          <option value='open'>Open</option>
          <option value='conv'>Converter Rn (Vin nom)</option>
          <option value='res'>Resistor</option>
        </select>
      </div>
      <div className={cn(row, 'gap-4')}>
        <label className='flex items-center gap-1.5'>
          <input
            type='checkbox'
            id='ps-und'
            className='size-4 accent-primary'
            checked={pl.undamped}
            onChange={(e) => set({ undamped: e.target.checked })}
          />
          Show undamped curve
        </label>
        <label className='flex items-center gap-1.5'>
          <input
            type='checkbox'
            id='ps-tol'
            className='size-4 accent-primary'
            checked={pl.tol}
            onChange={(e) => set({ tol: e.target.checked })}
          />
          Tolerance curves
        </label>
      </div>
      <ValueRow
        id='ps-rload'
        label='R load (H)'
        unit='Ω'
        value={pl.rload}
        onChange={(v) => set({ rload: v })}
        min={0.01}
        max={1e4}
      />
      <ValueRow
        id='ps-z0'
        label='S21 port Z0'
        unit='Ω'
        value={pl.z0}
        onChange={(v) => set({ z0: v })}
        min={1}
        max={1000}
      />
      <ValueRow
        id='ps-dL'
        label='Tol. ΔL'
        unit='%'
        value={pl.dL}
        onChange={(v) => set({ dL: v })}
        min={-90}
        max={90}
        zero
        linear
      />
      <ValueRow
        id='ps-dC'
        label='Tol. ΔC'
        unit='%'
        value={pl.dC}
        onChange={(v) => set({ dC: v })}
        min={-90}
        max={90}
        zero
        linear
      />
      <ValueRow
        id='ps-fmin'
        label='f min'
        unit='Hz'
        value={pl.fmin}
        onChange={(v) => set({ fmin: Math.min(v, pl.fmax / 10) })}
        min={0.1}
        max={1e6}
      />
      <ValueRow
        id='ps-fmax'
        label='f max'
        unit='Hz'
        value={pl.fmax}
        onChange={(v) => set({ fmax: Math.max(v, pl.fmin * 10) })}
        min={1e3}
        max={10e9}
      />
      <ValueRow
        id='ps-n'
        label='Points'
        unit=''
        value={pl.n}
        onChange={(v) => set({ n: Math.round(v) })}
        min={100}
        max={4000}
        linear
        int
      />
    </ToolCard>
  )
}
