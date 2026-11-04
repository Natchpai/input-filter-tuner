// Tuner state outside React, so it survives route changes (Tuner ↔ Notes).
// Components read it with useTuner().
import { useSyncExternalStore } from 'react'
import type { Design } from '../engine'
import { emptyHistory, type History, record, redo, undo } from './history'
import {
  cleanName,
  loadLibrary,
  newSavedId,
  type SavedDesign,
  saveLibrary,
  withItem,
} from './library'
import { initialDesign, saveLocal } from './persist'
import { type Action, reducer } from './reducer'

type TunerState = {
  st: Design
  /** Saved designs and snapshots, kept in localStorage. */
  library: SavedDesign[]
  /** Undo history, in memory only. */
  hist: History
  /** Message for the first render, e.g. a broken link. */
  warning?: string
}

let state: TunerState | null = null
const listeners = new Set<() => void>()

function get(): TunerState {
  if (!state) {
    const { st, warning } = initialDesign()
    state = { st, library: loadLibrary(), hist: emptyHistory(), warning }
  }
  return state
}

function set(next: TunerState) {
  const designChanged = next.st !== get().st
  state = next
  if (designChanged) saveLocal(next.st)
  listeners.forEach((l) => l())
}

export function dispatch(a: Action) {
  const s = get()
  const st = reducer(s.st, a)
  set({ ...s, st, hist: record(s.hist, s.st, st, a, Date.now()) })
}

export function undoDesign() {
  const s = get()
  const r = undo(s.hist, s.st)
  if (r) set({ ...s, ...r })
}

export function redoDesign() {
  const s = get()
  const r = redo(s.hist, s.st)
  if (r) set({ ...s, ...r })
}

/** Store the new list; false (and no change) when the browser refused. */
function setLibrary(library: SavedDesign[]) {
  if (!saveLibrary(library)) return false
  set({ ...get(), library })
  return true
}

export type SaveResult = 'ok' | 'full' | 'storage'

/** Save the current design. Snapshots (auto) start with the overlay on. */
export function saveDesign(name: string, auto: boolean): SaveResult {
  const s = get()
  const list = withItem(s.library, {
    id: newSavedId(),
    name: cleanName(name) || s.st.name,
    savedAt: Date.now(),
    overlay: auto,
    auto,
    design: s.st,
  })
  if (!list) return 'full'
  return setLibrary(list) ? 'ok' : 'storage'
}

const mapSaved = (id: string, fn: (x: SavedDesign) => SavedDesign) =>
  setLibrary(get().library.map((x) => (x.id === id ? fn(x) : x)))

export const renameSaved = (id: string, name: string) =>
  mapSaved(id, (x) => ({ ...x, name: cleanName(name) || x.name }))

export const toggleOverlay = (id: string) =>
  mapSaved(id, (x) => ({ ...x, overlay: !x.overlay }))

export const deleteSaved = (id: string) =>
  setLibrary(get().library.filter((x) => x.id !== id))

/** Delete the snapshots and hide every overlay. */
export const clearSnapshots = () =>
  setLibrary(
    get()
      .library.filter((x) => !x.auto)
      .map((x) => (x.overlay ? { ...x, overlay: false } : x))
  )

/** Load a saved design as one undoable step. */
export function loadSaved(id: string) {
  const x = get().library.find((y) => y.id === id)
  if (x) dispatch({ t: 'replace', st: x.design })
}

/** Returns the start-up warning once. */
export function takeWarning() {
  const w = get().warning
  if (w) state = { ...get(), warning: undefined }
  return w
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useTuner() {
  return useSyncExternalStore(subscribe, get)
}
