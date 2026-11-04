// Undo and redo. Pure: the clock comes in with each call, so tests are exact.
import type { Design, PlotSettings } from '../engine'
import type { Action } from './reducer'

export type History = {
  past: Design[]
  future: Design[]
  /** Key of the last recorded action, for grouping. */
  lastKey: string | null
  lastAt: number
}

export const MAX_STEPS = 100
/** Same-key actions closer than this join one undo step. */
export const GROUP_MS = 800

export const emptyHistory = (): History => ({
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,
})

/** View-only plot fields: never recorded, and kept as they are on undo. */
const VIEW_KEYS: (keyof PlotSettings)[] = ['tab', 'sweepId']

const viewOnly = (patch: Partial<PlotSettings>) =>
  Object.keys(patch).every((k) => VIEW_KEYS.includes(k as keyof PlotSettings))

/**
 * Grouping key of an action. Actions with the same key in a row (a slider
 * drag, a run of arrow keys) join one step. null never groups.
 */
function keyOf(a: Action): string | null {
  switch (a.t) {
    case 'conv':
    case 'source':
      return `${a.t}:${a.k}`
    case 'param':
      return `param:${a.id}:${a.k}`
    case 'tol':
      return `tol:${a.id}:${a.k}`
    case 'patch':
      return `patch:${a.id}:${Object.keys(a.patch).sort().join(',')}`
    case 'plot':
      return `plot:${Object.keys(a.patch).sort().join(',')}`
    default:
      return null
  }
}

/** History after `a` turned `prev` into `next` at time `now` (ms). */
export function record(
  h: History,
  prev: Design,
  next: Design,
  a: Action,
  now: number
): History {
  if (next === prev) return h
  if (a.t === 'plot' && viewOnly(a.patch)) return h
  const key = keyOf(a)
  if (key !== null && key === h.lastKey && now - h.lastAt <= GROUP_MS)
    return { ...h, future: [], lastAt: now }
  const past = [...h.past, prev]
  if (past.length > MAX_STEPS) past.splice(0, past.length - MAX_STEPS)
  return { past, future: [], lastKey: key, lastAt: now }
}

/** `st` with the view fields of `cur`, so undo does not switch tabs. */
const keepView = (st: Design, cur: Design): Design => ({
  ...st,
  plot: { ...st.plot, tab: cur.plot.tab, sweepId: cur.plot.sweepId },
})

export function undo(h: History, cur: Design) {
  if (!h.past.length) return null
  return {
    st: keepView(h.past[h.past.length - 1], cur),
    hist: {
      past: h.past.slice(0, -1),
      future: [cur, ...h.future],
      lastKey: null,
      lastAt: 0,
    },
  }
}

export function redo(h: History, cur: Design) {
  if (!h.future.length) return null
  return {
    st: keepView(h.future[0], cur),
    hist: {
      past: [...h.past, cur],
      future: h.future.slice(1),
      lastKey: null,
      lastAt: 0,
    },
  }
}
