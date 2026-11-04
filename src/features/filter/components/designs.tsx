import { type ReactNode, useState } from 'react'
import { Camera, FolderOpen, Pencil, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { type Design, MAX_NOTES, type Metrics } from '../engine'
import { compareRows, metricsOf } from '../lib/compare'
import { fmtSI } from '../lib/si'
import { SNAPSHOT_TABS } from '../plots/traces'
import { MAX_NAME, type SavedDesign } from '../state/library'
import {
  clearSnapshots,
  deleteSaved,
  dispatch,
  loadSaved,
  renameSaved,
  saveDesign,
  toggleOverlay,
} from '../state/store'
import { saveToast } from './save-toast'
import { inputCls, selectCls } from './styles'
import { ToolCard } from './tool-card'

const fmtDate = (t: number) =>
  t
    ? new Date(t).toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : ''

const summary = (m: Metrics | null) =>
  m ? `${fmtSI(m.peak.v, 'Ω')} peak · ${m.margin.toFixed(1)} dB` : 'no result'

export function DesignsCard({
  S,
  m,
  library,
  nSnap,
}: {
  S: Design
  m: Metrics | null
  library: SavedDesign[]
  /** Saved designs drawn as overlays. */
  nSnap: number
}) {
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [cmpId, setCmpId] = useState('')
  const cmp = library.find((x) => x.id === cmpId)

  const save = () => {
    const r = saveDesign(name || S.name, false)
    if (r !== 'ok') return saveToast(r)
    setName('')
    toast.success('Design saved.')
  }
  const guard = (ok: boolean) => ok || saveToast('storage')

  // No prompt(): some viewers block dialogs. The label carries the key result,
  // so snapshots can be told apart in the legend. A snapshot is a saved
  // design with its overlay on, so it survives a reload.
  const snapshot = () => {
    if (!m) return
    const nAuto = library.filter((x) => x.auto).length
    const r = saveDesign(
      `S${nAuto + 1}: ${fmtSI(m.peak.v, 'Ω')} peak, ${m.margin.toFixed(1)} dB`,
      true
    )
    if (r !== 'ok') return saveToast(r)
    if (!SNAPSHOT_TABS.includes(S.plot.tab))
      dispatch({ t: 'plot', patch: { tab: 'zout' } })
  }

  return (
    <ToolCard
      id='designs'
      title='Designs'
      collapse='designs'
      summary={`${library.length} saved, ${nSnap} drawn`}
      right={
        <span className='flex gap-1 tracking-normal normal-case'>
          <Button
            id='bSnap'
            size='sm'
            variant='secondary'
            className='h-7'
            title='Freeze the current curves as a grey reference'
            onClick={snapshot}
          >
            <Camera />
            {nSnap ? `Snapshot (${nSnap})` : 'Snapshot'}
          </Button>
          <Button
            id='bClrSnap'
            size='sm'
            variant='ghost'
            className='h-7'
            title='Delete the snapshots and hide all overlays'
            onClick={() => clearSnapshots() || saveToast('storage')}
          >
            <Trash2 />
            Clear
          </Button>
        </span>
      }
    >
      <div className='flex flex-wrap items-center gap-1.5'>
        <input
          id='saveName'
          aria-label='Name for the saved design'
          className={cn(inputCls, 'min-w-0 flex-1 basis-40')}
          maxLength={MAX_NAME}
          placeholder={S.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <Button id='bSaveAs' size='sm' variant='secondary' onClick={save}>
          <Save />
          Save as
        </Button>
      </div>

      <label htmlFor='notes' className='mt-2.5 block text-xs'>
        Design notes (saved with the design and copied into the report)
      </label>
      <textarea
        // Remount when the notes change from outside (undo, load).
        key={S.notes ?? ''}
        id='notes'
        className={cn(inputCls, 'mt-1 h-auto min-h-16 w-full py-1')}
        maxLength={MAX_NOTES}
        defaultValue={S.notes ?? ''}
        onBlur={(e) => {
          if (e.target.value !== (S.notes ?? ''))
            dispatch({ t: 'notes', v: e.target.value })
        }}
      />

      {library.length > 0 && (
        <ul id='savedList' className='mt-2.5 divide-y border-y text-sm'>
          {library.map((x) => (
            <li
              key={x.id}
              className='flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5'
            >
              <label
                className='flex items-center'
                title='Draw as a grey reference curve'
              >
                <input
                  type='checkbox'
                  className='size-4 accent-primary'
                  aria-label={`Overlay ${x.name}`}
                  checked={x.overlay}
                  onChange={() => guard(toggleOverlay(x.id))}
                />
              </label>
              <div className='min-w-0 flex-1 basis-48'>
                {editing === x.id ? (
                  <input
                    autoFocus
                    aria-label='New name'
                    className={cn(inputCls, 'w-full')}
                    maxLength={MAX_NAME}
                    defaultValue={x.name}
                    onBlur={(e) => {
                      guard(renameSaved(x.id, e.target.value))
                      setEditing(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                ) : (
                  <div className='truncate font-medium' title={x.name}>
                    {x.name}
                  </div>
                )}
                <div className='text-xs text-muted-foreground tabular-nums'>
                  {summary(metricsOf(x.design))} · {fmtDate(x.savedAt)}
                  {x.design.notes ? ' · ' + x.design.notes.slice(0, 60) : ''}
                </div>
              </div>
              <div className='flex gap-1'>
                <IconBtn label='Load' onClick={() => loadSaved(x.id)}>
                  <FolderOpen />
                </IconBtn>
                <IconBtn label='Rename' onClick={() => setEditing(x.id)}>
                  <Pencil />
                </IconBtn>
                <IconBtn
                  label='Delete'
                  onClick={() => guard(deleteSaved(x.id))}
                >
                  <Trash2 />
                </IconBtn>
              </div>
            </li>
          ))}
        </ul>
      )}

      {library.length > 0 && (
        <div className='mt-2.5'>
          <label className='flex flex-wrap items-center gap-1.5 text-sm'>
            Compare with
            <select
              id='cmpSel'
              className={cn(selectCls, 'max-w-full min-w-0')}
              value={cmp ? cmpId : ''}
              onChange={(e) => setCmpId(e.target.value)}
            >
              <option value=''>(none)</option>
              {library.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          {cmp && <Compare S={S} m={m} saved={cmp} />}
        </div>
      )}
    </ToolCard>
  )
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      size='icon'
      variant='ghost'
      className='size-7'
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function Compare({
  S,
  m,
  saved,
}: {
  S: Design
  m: Metrics | null
  saved: SavedDesign
}) {
  const rows = compareRows(S, m, saved.design, metricsOf(saved.design))
  return (
    <table id='cmpTab' className='mt-2 w-full text-sm tabular-nums'>
      <thead>
        <tr className='border-b text-xs text-muted-foreground'>
          <th className='px-1.5 py-1 text-left font-normal'></th>
          <th className='px-1.5 py-1 text-right font-normal'>Current</th>
          <th className='max-w-32 truncate px-1.5 py-1 text-right font-normal'>
            {saved.name}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, x, y], i) => (
          <tr key={i} className={cn('border-b', i === 6 && 'border-b-2')}>
            <td className='px-1.5 py-1'>{k}</td>
            <td className='px-1.5 py-1 text-right'>{x}</td>
            <td className='px-1.5 py-1 text-right'>{y}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
