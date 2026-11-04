import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Design } from '../engine'
import { reportZip } from '../export/report-zip'
import { designLink, download } from '../state/persist'
import { inputCls } from './styles'

/** The author is remembered for this browser only. */
const AUTHOR_KEY = 'input-filter-tuner-author'

function readAuthor() {
  try {
    return localStorage.getItem(AUTHOR_KEY)?.slice(0, 80) ?? ''
  } catch {
    return ''
  }
}

const today = () =>
  new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const FIELDS = [
  ['author', 'Author'],
  ['docNo', 'Doc no'],
  ['date', 'Date'],
  ['revision', 'Revision'],
] as const

type Form = Record<(typeof FIELDS)[number][0], string>

/** Opened from the Export menu; the menu item carries the #bReport id. */
export function ReportDialog({
  S,
  open,
  onOpenChange: setOpen,
}: {
  S: Design
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState<Form>({
    author: '',
    docNo: '',
    date: '',
    revision: '0.1',
  })
  // Fill the author and today's date each time the dialog opens.
  const [shown, setShown] = useState(false)
  if (open !== shown) {
    setShown(open)
    if (open)
      setF((x) => ({ ...x, author: x.author || readAuthor(), date: today() }))
  }

  const make = async () => {
    const el = document.querySelector<SVGSVGElement>('#sch svg')
    if (!el) return toast.error('The schematic is not on the page.')
    setBusy(true)
    try {
      try {
        localStorage.setItem(AUTHOR_KEY, f.author)
      } catch {
        /* storage blocked: the author is just not remembered */
      }
      const zip = await reportZip(
        S,
        {
          ...f,
          link: designLink(S),
          toolUrl: location.href.split('#')[0],
        },
        el
      )
      download(zip.name, zip.data, 'application/zip')
      setOpen(false)
    } catch (e) {
      toast.error('Could not make the report: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>Design report</DialogTitle>
          <DialogDescription>
            A zip with report.md and the SVG figures (schematic, Zout, transfer,
            Zin, and EMI when it is on) for the report archive.
          </DialogDescription>
        </DialogHeader>
        <div className='grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-sm'>
          {FIELDS.map(([k, label]) => (
            <label key={k} className='contents'>
              {label}
              <input
                id={'rp-' + k}
                className={inputCls}
                maxLength={80}
                value={f[k]}
                onChange={(e) => setF({ ...f, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button id='bReportGo' disabled={busy} onClick={make}>
            {busy ? 'Making…' : 'Download zip'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
