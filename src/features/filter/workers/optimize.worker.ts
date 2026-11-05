// Runs the design optimizer off the main thread (M3b).
import { type Design, optimize } from '../engine'

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ st: Design }>) => void) | null
  postMessage(msg: unknown): void
}

ctx.onmessage = (e) => {
  try {
    let last = -1
    const r = optimize(e.data.st, (x) => {
      // At most one message per percent.
      const pct = Math.floor(100 * x)
      if (pct > last) {
        last = pct
        ctx.postMessage({ type: 'progress', pct })
      }
    })
    ctx.postMessage({ type: 'done', r })
  } catch (err) {
    ctx.postMessage({ type: 'error', message: (err as Error).message })
  }
}
