// Runs the time-domain checks off the main thread (M4).
import { type Design, tranResult } from '../engine'

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ st: Design }>) => void) | null
  postMessage(msg: unknown): void
}

ctx.onmessage = (e) => {
  try {
    ctx.postMessage({ type: 'done', r: tranResult(e.data.st) })
  } catch (err) {
    ctx.postMessage({ type: 'error', message: (err as Error).message })
  }
}
