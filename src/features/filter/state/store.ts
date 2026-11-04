// Tuner state outside React, so it survives route changes (Tuner ↔ Notes).
// Components read it with useTuner().
import { useSyncExternalStore } from 'react'
import type { Design } from '../engine'
import { emptyHistory, type History, record, redo, undo } from './history'
import { initialDesign, saveLocal } from './persist'
import { type Action, reducer } from './reducer'

/** Frozen curves, drawn grey as a reference. Session only. */
export type Snapshot = {
  label: string
  f: number[]
  zout: number[]
  h: number[]
  s21: number[]
  zin: number[]
  tm: number[]
}

type TunerState = {
  st: Design
  snapshots: Snapshot[]
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
    state = { st, snapshots: [], hist: emptyHistory(), warning }
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

export function addSnapshot(snap: Snapshot) {
  const s = get()
  set({ ...s, snapshots: [...s.snapshots, snap] })
}

export function clearSnapshots() {
  set({ ...get(), snapshots: [] })
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
