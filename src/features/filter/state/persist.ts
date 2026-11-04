// Saving and loading: localStorage, share links and JSON files. Everything
// read back goes through adopt().
import type { Design } from '../engine'
import { adopt } from './adopt'
import { buildPreset } from './presets'

const LS_KEY = 'input-filter-tuner-v1'

export function saveLocal(st: Design) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(st))
  } catch {
    /* storage blocked or full: ignore */
  }
}

/** UTF-8 JSON as base64 (same text as the old btoa(unescape(...)) form). */
export function encodeState(st: Design): string {
  const bytes = new TextEncoder().encode(JSON.stringify(st))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function decodeState(s: string): unknown {
  const bin = atob(s)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

let pendingLink: string | null = null

/**
 * Read a `#d=<base64>` design link and clear it from the URL. Call before the
 * router starts: hash history would read the link as a route. Clearing it
 * means later edits (saved locally) win on reload.
 */
export function takeLinkFromHash() {
  const m = location.hash.match(/^#d=(.+)$/)
  if (!m) return
  pendingLink = m[1]
  history.replaceState(null, '', location.pathname + location.search)
}

/** A link that holds the whole design. */
export const designLink = (st: Design) =>
  location.href.split('#')[0] + '#d=' + encodeState(st)

/** First design: from a link, else localStorage, else preset 1. */
export function initialDesign(): { st: Design; warning?: string } {
  let warning: string | undefined
  if (pendingLink) {
    const link = pendingLink
    pendingLink = null
    try {
      return { st: adopt(decodeState(link)) }
    } catch (e) {
      warning = 'Could not read the design link: ' + (e as Error).message
    }
  }
  try {
    const s = localStorage.getItem(LS_KEY)
    if (s) return { st: adopt(JSON.parse(s)), warning }
  } catch {
    /* fall through to the preset */
  }
  return { st: buildPreset(1), warning }
}

/** Offer text as a file download. */
export function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 500)
}

export const fileName = (st: Design, ext: string) =>
  (st.name || 'filter').replace(/[^\w.-]+/g, '_') + '.' + ext
