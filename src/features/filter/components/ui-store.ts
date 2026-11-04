// View state of the Tuner page: analysis tab, narrow-screen area, hints and
// open block cards. Not part of the design: never saved in it, linked,
// undone or read through adopt().
import { useSyncExternalStore } from 'react'

export const PANELS = [
  ['results', 'Results'],
  ['corners', 'Corners'],
  ['tolerance', 'Tolerance'],
  ['sens', 'Sensitivity'],
  ['emi', 'EMI'],
  ['time', 'Time'],
  ['asst', 'Assistant'],
  ['designs', 'Designs'],
] as const
export type Panel = (typeof PANELS)[number][0]

export const AREAS = [
  ['inputs', 'Inputs'],
  ['plot', 'Plot'],
  ['analysis', 'Analysis'],
] as const
export type Area = (typeof AREAS)[number][0]

type Ui = {
  panel: Panel
  /** Narrow screens only: which pane is shown. */
  area: Area
  /** Show every hint (the toolbar switch). */
  hints: boolean
  /** Block and converter cards that are unfolded. Memory only. */
  open: ReadonlySet<string>
}

const PANEL_KEY = 'input-filter-tuner-panel'
const HINTS_KEY = 'input-filter-tuner-hints'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* storage blocked: the choice lasts until a reload */
  }
}

function initial(): Ui {
  const p = read(PANEL_KEY)
  return {
    panel: PANELS.find(([k]) => k === p)?.[0] ?? 'results',
    area: 'plot',
    hints: read(HINTS_KEY) === '1',
    open: new Set(),
  }
}

let ui: Ui | null = null
const listeners = new Set<() => void>()

function get(): Ui {
  if (!ui) ui = initial()
  return ui
}

function set(patch: Partial<Ui>) {
  ui = { ...get(), ...patch }
  listeners.forEach((l) => l())
}

export function setPanel(panel: Panel) {
  write(PANEL_KEY, panel)
  set({ panel })
}

export const setArea = (area: Area) => set({ area })

export function setHints(hints: boolean) {
  write(HINTS_KEY, hints ? '1' : '0')
  set({ hints })
}

/**
 * Show one analysis panel and scroll the right pane so its tab bar sits
 * under the status strip. Used by the status strip chips.
 */
export function goPanel(p: Panel) {
  setPanel(p)
  if (get().area === 'inputs') setArea('plot')
  requestAnimationFrame(() => {
    const pane = document.getElementById('right')
    const bar = document.getElementById('analysis')
    if (!pane || !bar) return
    const strip = document.getElementById('strip')?.offsetHeight ?? 0
    const top =
      bar.getBoundingClientRect().top -
      pane.getBoundingClientRect().top +
      pane.scrollTop -
      strip
    pane.scrollTo({ top, behavior: 'smooth' })
  })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useUi() {
  return useSyncExternalStore(subscribe, get)
}
