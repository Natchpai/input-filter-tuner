import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  Download,
  FileCode,
  FileText,
  FileUp,
  Link2,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { abs, argd, db, type Design } from '../engine'
import { spiceNetlist } from '../export/netlist'
import type { CurveSets } from '../plots/curves'
import { adopt } from '../state/adopt'
import { designLink, download, fileName } from '../state/persist'
import { PRESET_NAMES, buildPreset } from '../state/presets'
import { dispatch, redoDesign, undoDesign } from '../state/store'
import { ReportDialog } from './report-dialog'
import { selectCls } from './styles'

export function Toolbar({
  S,
  sets,
  canUndo,
  canRedo,
}: {
  S: Design
  sets: CurveSets | null
  canUndo: boolean
  canRedo: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [report, setReport] = useState(false)

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

  const saveJson = () =>
    download(
      fileName(S, 'json'),
      JSON.stringify(S, null, 2),
      'application/json'
    )
  const exportSpice = () =>
    download(
      fileName(S, 'cir'),
      spiceNetlist(S, {
        date: new Date().toISOString().slice(0, 10),
        link: designLink(S),
      }),
      'text/plain'
    )

  // Narrow screens: icons only, so the row fits in one line at 390 px.
  const lbl = 'max-sm:sr-only'
  return (
    <div className='flex items-center gap-1.5'>
      <select
        id='preset'
        aria-label='Load a preset'
        className={selectCls + ' min-w-0 flex-1 sm:w-40 sm:flex-none'}
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
      <span className='hidden flex-1 sm:block' />
      <Button
        id='bLink'
        size='sm'
        variant='secondary'
        title='Copy a link that holds the whole design'
        onClick={copyLink}
      >
        <Link2 />
        <span className={lbl}>Copy link</span>
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            id='bFile'
            size='sm'
            variant='secondary'
            title='Save or load a JSON file'
          >
            <Save />
            <span className={lbl}>File</span>
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem id='bSave' onSelect={saveJson}>
            <Save />
            Save JSON
          </DropdownMenuItem>
          <DropdownMenuItem
            id='bLoad'
            onSelect={() => fileRef.current?.click()}
          >
            <FileUp />
            Load JSON
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            id='bExport'
            size='sm'
            variant='secondary'
            title='Report, CSV and SPICE'
          >
            <Download />
            <span className={lbl}>Export</span>
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            id='bReport'
            title='Design report: report.md and SVG figures in a zip'
            onSelect={() => setReport(true)}
          >
            <FileText />
            Report…
          </DropdownMenuItem>
          <DropdownMenuItem id='bCsv' onSelect={exportCsv}>
            <Download />
            CSV (curves)
          </DropdownMenuItem>
          <DropdownMenuItem
            id='bSpice'
            title='SPICE netlist (.cir) with H and Zout copies of the filter'
            onSelect={exportSpice}
          >
            <FileCode />
            SPICE netlist
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportDialog S={S} open={report} onOpenChange={setReport} />
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
