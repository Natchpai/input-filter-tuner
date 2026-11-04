// Runs the tolerance checks off the main thread (M1b).
import { type Design, extremes, monteCarlo } from '../engine'

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ st: Design; n: number }>) => void) | null
  postMessage(msg: unknown, transfer?: Transferable[]): void
}

ctx.onmessage = (e) => {
  try {
    const { st, n } = e.data
    const ext = extremes(st)
    const mc = monteCarlo(st, n, 1, (done) =>
      ctx.postMessage({ type: 'progress', done })
    )
    ctx.postMessage({ type: 'done', ext, mc }, [mc.board.buffer])
  } catch (err) {
    ctx.postMessage({ type: 'error', message: (err as Error).message })
  }
}
