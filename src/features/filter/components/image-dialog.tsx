import { useState } from 'react'
import { ImageDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { Design, Metrics, TranResult } from '../engine'
import {
  BASE_FONT,
  IMG_LIMITS,
  IMG_PRESETS,
  type ImgFormat,
  type ImgOpts,
  type ImgPreset,
  presetSize,
  readImgOpts,
  scaleFigure,
} from '../export/image-size'
import { dataUrlBytes, plotImage, readLightColors } from '../export/svg'
import type { CurveSets } from '../plots/curves'
import { buildPlot, type Snapshot } from '../plots/traces'
import { download, fileName } from '../state/persist'
import { inputCls, selectCls } from './styles'

/** The last choice, for this browser only. View state: not in the design. */
const IMG_KEY = 'input-filter-tuner-image'

function readSaved(): ImgOpts {
  try {
    return readImgOpts(JSON.parse(localStorage.getItem(IMG_KEY) ?? 'null'))
  } catch {
    return readImgOpts(null)
  }
}

/** Size of the main plot on the page, inside the image limits. */
function screenSize(): [number, number] {
  const el = document.getElementById('pl1')
  const o = readImgOpts({ w: el?.clientWidth, h: el?.clientHeight })
  return [o.w, o.h]
}

type Form = Omit<ImgOpts, 'w' | 'h' | 'font'> & {
  w: string
  h: string
  font: string
}

const toForm = (o: ImgOpts): Form => ({
  ...o,
  w: String(o.w),
  h: String(o.h),
  font: String(o.font),
})

/**
 * Save the current plot as SVG or PNG: size preset or custom size, PNG
 * scale and font size.
 */
export function ImageDialog({
  S,
  sets,
  m,
  snapshots,
  tran,
  tab,
}: {
  S: Design
  sets: CurveSets
  m: Metrics
  snapshots: Snapshot[]
  tran: TranResult | null
  /** Plot tab, for the file name. */
  tab: string
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState<Form>(() => toForm(readSaved()))

  const onOpen = (o: boolean) => {
    if (o) {
      const s = readSaved()
      if (s.preset === 'screen') [s.w, s.h] = screenSize()
      setF(toForm(s))
    }
    setOpen(o)
  }

  const pickPreset = (p: ImgPreset) => {
    const size = p === 'screen' ? screenSize() : presetSize(p)
    setF((x) =>
      size
        ? { ...x, preset: p, w: String(size[0]), h: String(size[1]) }
        : { ...x, preset: p }
    )
  }

  const o = readImgOpts(f)
  const px = o.fmt === 'png' ? o.scale : 1

  const save = async () => {
    setBusy(true)
    try {
      try {
        localStorage.setItem(IMG_KEY, JSON.stringify(o))
      } catch {
        /* storage blocked: the choice is just not remembered */
      }
      // Saved figures always use the light palette, whatever the page theme.
      const light = buildPlot(S, sets, m, snapshots, readLightColors(), tran)
      const fig = scaleFigure(light.main, o.font / BASE_FONT)
      const url = await plotImage(fig, o.fmt, o.w, o.h, o.scale)
      download(
        fileName(S, `${tab}.${o.fmt}`),
        dataUrlBytes(url),
        o.fmt === 'svg' ? 'image/svg+xml' : 'image/png'
      )
      setOpen(false)
    } catch (e) {
      toast.error('Could not export the plot: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const num = (k: 'w' | 'h' | 'font', label: string, unit: string) => {
    const [lo, hi] = IMG_LIMITS[k]
    return (
      <label className='contents'>
        {label}
        <span className='flex items-center gap-1.5'>
          <input
            id={'img-' + k}
            type='number'
            min={lo}
            max={hi}
            className={inputCls + ' w-24 text-right'}
            value={f[k]}
            onChange={(e) =>
              setF({
                ...f,
                [k]: e.target.value,
                ...(k !== 'font' && { preset: 'custom' as const }),
              })
            }
          />
          <span className='text-xs text-muted-foreground'>{unit}</span>
        </span>
      </label>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogTrigger asChild>
        <Button
          id='bPlotImg'
          size='sm'
          variant='outline'
          title='Save this plot as SVG or PNG (light colours)'
        >
          <ImageDown />
          Image
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>Save plot image</DialogTitle>
          <DialogDescription>
            Light colours. Fonts and margins scale with the font size.
          </DialogDescription>
        </DialogHeader>
        <div className='grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-sm'>
          <label className='contents'>
            Size
            <select
              id='img-preset'
              className={selectCls}
              value={f.preset}
              onChange={(e) => pickPreset(e.target.value as ImgPreset)}
            >
              {IMG_PRESETS.map(([id, label, w, h]) => (
                <option key={id} value={id}>
                  {w ? `${label} (${w} × ${h})` : label}
                </option>
              ))}
            </select>
          </label>
          {num('w', 'Width', 'px')}
          {num('h', 'Height', 'px')}
          <label className='contents'>
            Format
            <select
              id='img-fmt'
              className={selectCls}
              value={f.fmt}
              onChange={(e) => setF({ ...f, fmt: e.target.value as ImgFormat })}
            >
              <option value='svg'>SVG (vector)</option>
              <option value='png'>PNG</option>
            </select>
          </label>
          {f.fmt === 'png' && (
            <label className='contents'>
              PNG scale
              <select
                id='img-scale'
                className={selectCls}
                value={f.scale}
                onChange={(e) => setF({ ...f, scale: Number(e.target.value) })}
              >
                {[1, 2, 3, 4].map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
          )}
          {num('font', 'Font size', `px (plot uses ${BASE_FONT})`)}
        </div>
        <p id='img-out' className='text-xs text-muted-foreground'>
          Output: {o.w * px} × {o.h * px} px{o.fmt === 'svg' ? ' (vector)' : ''}
          , font {o.font} px.
        </p>
        <DialogFooter>
          <Button id='bImgGo' disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
