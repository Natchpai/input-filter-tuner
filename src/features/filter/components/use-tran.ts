// Runs the time-domain checks (M4) in a worker for the Time card and tab.
import { useEffect, useMemo, useState } from 'react'
import type { Design, TranResult } from '../engine'
import { baseState } from '../state/defaults'
import TranWorker from '../workers/transient.worker?worker&inline'

export type TranState = {
  /** Last finished result; kept while a newer run is busy, dropped on an error. */
  data: TranResult | null
  busy: boolean
  error: string | null
}

/**
 * Runs tranResult() in a worker whenever a value it reads changes. View
 * settings (plot, tab) are left out of the key, so they never restart it.
 */
export function useTran(st: Design): TranState {
  const key = useMemo(
    () =>
      st.tran.on
        ? JSON.stringify({
            conv: st.conv,
            loads: st.loads,
            source: st.source,
            blocks: st.blocks,
            tran: st.tran,
            emi: st.emi,
          })
        : null,
    [st.tran, st.conv, st.loads, st.source, st.blocks, st.emi]
  )
  const [res, setRes] = useState<{
    key: string | null
    data: TranResult | null
    error: string | null
  }>({ key: null, data: null, error: null })
  useEffect(() => {
    if (key === null) return
    const w = new TranWorker()
    w.onmessage = (e: MessageEvent) => {
      const d = e.data
      // An error drops the old result: it belongs to another design.
      if (d.type === 'done') setRes({ key, data: d.r, error: null })
      else setRes({ key, data: null, error: d.message })
      w.terminate()
    }
    // A failure outside the worker's try/catch would leave "Running…" forever.
    w.onerror = (e: ErrorEvent) => {
      setRes({
        key,
        data: null,
        error: e.message || 'The time-domain run failed.',
      })
      w.terminate()
    }
    // The worker gets a whole design; plot settings do not change the result.
    const st: Design = { ...baseState('', {}, {}, []), ...JSON.parse(key) }
    w.postMessage({ st })
    return () => w.terminate()
  }, [key])
  if (key === null) return { data: null, busy: false, error: null }
  return { data: res.data, busy: res.key !== key, error: res.error }
}
