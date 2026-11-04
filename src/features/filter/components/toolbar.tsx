import { useEffect, useRef } from 'react'
import {
  Camera,
  Download,
  FileUp,
  Link2,
  Redo2,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { abs, argd, db, type Design, type Metrics } from '../engine'
import { fmtSI } from '../lib/si'
import type { CurveSets } from '../plots/curves'
import { SNAPSHOT_TABS, snapshotOf } from '../plots/traces'
import { adopt } from '../state/adopt'
import { designLink, download, fileName } from '../state/persist'
import { PRESET_NAMES, buildPreset } from '../state/presets'
import {
  addSnapshot,
  clearSnapshots,
  dispatch,
  redoDesign,
  undoDesign,
} from '../state/store'
import { selectCls } from './styles'

export function Toolbar({
  S,
  sets,
  m,
  nSnap,
  canUndo,
  canRedo,
}: {
  S: Design
  sets: CurveSets | null
  m: Metrics | null
  nSnap: number
  canUndo: boolean
  canRedo: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextField(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) undoDesign()
      else if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey))
        redoDesign()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // No prompt(): some viewers block dialogs. The label carries the key result,
  // so snapshots can be told apart in the legend.
  const snapshot = () => {
    if (!sets || !m) return
    addSnapshot(
      snapshotOf(
        `S${nSnap + 1}: ${fmtSI(m.peak.v, 'Ω')} peak, ${m.margin.toFixed(1)} dB`,
        sets.nom
      )
    )
    if (!SNAPSHOT_TABS.includes(S.plot.tab))
      dispatch({ t: 'plot', patch: { tab: 'zout' } })
  }

  // Copy only; do not put the state in this page's URL, or a reload would
  // bring back this design over later edits.
  const copyLink = async () => {
    const url = designLink(S)
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied.')
    } catch {
      toast.error('Could not copy the link.', { description: url })
    }
  }

  const loadFile = async (file: File) => {
    try {
      dispatch({ t: 'replace', st: adopt(JSON.parse(await file.text())) })
    } catch (e) {
      toast.error('Could not load: ' + (e as Error).message)
    }
  }

  const exportCsv = () => {
    if (!sets) return
    const s = sets.nom
    const lines = [
      'f_Hz,Zout_mag_ohm,Zout_phase_deg,H_dB,H_phase_deg,Hopen_dB,S21_dB,S21_phase_deg,Zin_mag_ohm,Zin_phase_deg,Tm_re,Tm_im',
    ]
    for (let i = 0; i < s.f.length; i++) {
      lines.push(
        [
          s.f[i],
          abs(s.Zout[i]),
          argd(s.Zout[i]),
          db(abs(s.H[i])),
          argd(s.H[i]),
          db(abs(s.Hopen[i])),
          db(abs(s.S21[i])),
          argd(s.S21[i]),
          abs(s.Zin[i]),
          argd(s.Zin[i]),
          s.Tm[i].re,
          s.Tm[i].im,
        ]
          .map((v) => Number(v.toPrecision(6)))
          .join(',')
      )
    }
    download(fileName(S, 'csv'), lines.join('\n'), 'text/csv')
  }

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <select
        id='preset'
        aria-label='Load a preset'
        className={selectCls + ' max-w-full'}
        value=''
        onChange={(e) => {
          if (e.target.value !== '')
            dispatch({ t: 'replace', st: buildPreset(+e.target.value) })
        }}
      >
        <option value=''>Presets…</option>
        {PRESET_NAMES.map((n, i) => (
          <option key={i} value={i}>
            {n}
          </option>
        ))}
      </select>
      <Button
        id='bUndo'
        size='icon'
        className='size-8'
        variant='secondary'
        title='Undo (Ctrl+Z)'
        aria-label='Undo'
        disabled={!canUndo}
        onClick={undoDesign}
      >
        <Undo2 />
      </Button>
      <Button
        id='bRedo'
        size='icon'
        className='size-8'
        variant='secondary'
        title='Redo (Ctrl+Shift+Z or Ctrl+Y)'
        aria-label='Redo'
        disabled={!canRedo}
        onClick={redoDesign}
      >
        <Redo2 />
      </Button>
      <Button
        id='bSnap'
        size='sm'
        variant='secondary'
        title='Freeze the current curves as a grey reference'
        onClick={snapshot}
      >
        <Camera />
        {nSnap ? `Snapshot (${nSnap})` : 'Snapshot'}
      </Button>
      <Button
        id='bClrSnap'
        size='sm'
        variant='secondary'
        onClick={clearSnapshots}
      >
        <Trash2 />
        Clear snapshots
      </Button>
      <span className='flex-1' />
      <Button
        id='bLink'
        size='sm'
        variant='secondary'
        title='Copy a link that holds the whole design'
        onClick={copyLink}
      >
        <Link2 />
        Copy link
      </Button>
      <Button
        id='bSave'
        size='sm'
        variant='secondary'
        onClick={() =>
          download(
            fileName(S, 'json'),
            JSON.stringify(S, null, 2),
            'application/json'
          )
        }
      >
        <Save />
        Save JSON
      </Button>
      <Button
        id='bLoad'
        size='sm'
        variant='secondary'
        onClick={() => fileRef.current?.click()}
      >
        <FileUp />
        Load JSON
      </Button>
      <Button id='bCsv' size='sm' variant='secondary' onClick={exportCsv}>
        <Download />
        Export CSV
      </Button>
      <input
        ref={fileRef}
        id='fileIn'
        type='file'
        accept='.json,application/json'
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) loadFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** Fields where Ctrl+Z belongs to the browser's own text undo. */
function isTextField(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable) return true
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement)
    return true
  return (
    t instanceof HTMLInputElement &&
    !['range', 'checkbox', 'radio', 'button'].includes(t.type)
  )
}
