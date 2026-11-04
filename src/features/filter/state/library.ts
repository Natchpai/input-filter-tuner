// Saved designs in localStorage. Snapshots are saved designs too (auto: true)
// with the overlay on. Every design read back goes through adopt().
import type { Design } from '../engine'
import { adopt } from './adopt'

export type SavedDesign = {
  id: string
  name: string
  savedAt: number
  /** Drawn as a grey reference curve. */
  overlay: boolean
  /** Made by the Snapshot button; "Clear snapshots" deletes it. */
  auto: boolean
  design: Design
}

const KEY = 'input-filter-tuner-designs-v1'
export const MAX_ITEMS = 30
export const MAX_NAME = 80

type Obj = Record<string, unknown>
const isObj = (o: unknown): o is Obj => !!o && typeof o === 'object'

let uid = 0
export const newSavedId = () => 'd' + Date.now().toString(36) + '_' + uid++

export const cleanName = (s: unknown) =>
  String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, MAX_NAME)

/** Saved list from untrusted data. Bad items are dropped, never thrown. */
export function parseLibrary(raw: unknown): SavedDesign[] {
  if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.items)) return []
  const out: SavedDesign[] = []
  const ids = new Set<string>()
  for (const it of raw.items) {
    if (out.length >= MAX_ITEMS) break
    if (!isObj(it)) continue
    let design: Design
    try {
      design = adopt(it.design)
    } catch {
      continue
    }
    let id = typeof it.id === 'string' ? it.id.slice(0, 40) : ''
    if (!id || ids.has(id)) id = newSavedId()
    ids.add(id)
    const t = Number(it.savedAt)
    out.push({
      id,
      name: cleanName(it.name) || design.name,
      savedAt: Number.isFinite(t) ? t : 0,
      overlay: it.overlay === true,
      auto: it.auto === true,
      design,
    })
  }
  return out
}

export function loadLibrary(): SavedDesign[] {
  try {
    const s = localStorage.getItem(KEY)
    return s ? parseLibrary(JSON.parse(s)) : []
  } catch {
    return []
  }
}

/** False when the browser refused (quota, blocked storage). */
export function saveLibrary(items: SavedDesign[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, items }))
    return true
  } catch {
    return false
  }
}

/**
 * List with `item` added. When full, the oldest snapshot makes room; with no
 * snapshot to drop, returns null.
 */
export function withItem(
  items: SavedDesign[],
  item: SavedDesign
): SavedDesign[] | null {
  let list = items
  if (list.length >= MAX_ITEMS) {
    const i = list.findIndex((x) => x.auto)
    if (i < 0) return null
    list = list.filter((_, j) => j !== i)
  }
  return [...list, item]
}
