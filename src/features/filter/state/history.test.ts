import { describe, expect, it } from 'vitest'
import type { Design } from '../engine'
import {
  emptyHistory,
  GROUP_MS,
  type History,
  MAX_STEPS,
  record,
  redo,
  undo,
} from './history'
import { buildPreset } from './presets'
import { type Action, reducer } from './reducer'

/** Apply actions at the given times; returns the design and the history. */
function run(st: Design, steps: [Action, number][], h = emptyHistory()) {
  for (const [a, now] of steps) {
    const next = reducer(st, a)
    h = record(h, st, next, a, now)
    st = next
  }
  return { st, h }
}

const base = buildPreset(1)
const id = base.blocks.find((b) => b.type === 'cap')!.id
const setC = (v: number): Action => ({ t: 'param', id, k: 'c', v })
const capC = (st: Design) =>
  (st.blocks.find((b) => b.id === id) as { c: number }).c

describe('history', () => {
  it('groups a run of the same action inside the window', () => {
    const { st, h } = run(base, [
      [setC(1e-6), 1000],
      [setC(2e-6), 1000 + GROUP_MS],
      [setC(3e-6), 1000 + 2 * GROUP_MS],
    ])
    expect(h.past).toHaveLength(1)
    const u = undo(h, st)!
    expect(u.st).toEqual(base)
  })

  it('splits the same action outside the window', () => {
    const { h } = run(base, [
      [setC(1e-6), 1000],
      [setC(2e-6), 1000 + GROUP_MS + 1],
    ])
    expect(h.past).toHaveLength(2)
  })

  it('splits different keys', () => {
    const { h } = run(base, [
      [setC(1e-6), 1000],
      [{ t: 'param', id, k: 'esr', v: 0.01 }, 1001],
      [{ t: 'conv', k: 'pout', v: 5 }, 1002],
      [{ t: 'conv', k: 'eta', v: 0.8 }, 1003],
    ])
    expect(h.past).toHaveLength(4)
  })

  it('caps the past at MAX_STEPS', () => {
    const steps: [Action, number][] = []
    for (let i = 0; i < MAX_STEPS + 20; i++)
      steps.push([setC((i + 1) * 1e-6), i * 10 * GROUP_MS])
    const { h } = run(base, steps)
    expect(h.past).toHaveLength(MAX_STEPS)
    expect(capC(h.past[0])).toBeCloseTo(20e-6, 15)
  })

  it('clears redo on a new action', () => {
    const r = run(base, [[setC(1e-6), 0]])
    const u = undo(r.h, r.st)!
    expect(u.hist.future).toHaveLength(1)
    const r2 = run(u.st, [[setC(5e-6), 10_000]], u.hist)
    expect(r2.h.future).toHaveLength(0)
    expect(redo(r2.h, r2.st)).toBeNull()
  })

  it('undo then redo returns the same design', () => {
    const r = run(base, [[setC(1e-6), 0]])
    const u = undo(r.h, r.st)!
    expect(capC(u.st)).toBe(capC(base))
    const d = redo(u.hist, u.st)!
    expect(d.st).toEqual(r.st)
    expect(undo(emptyHistory(), base)).toBeNull()
  })

  it('does not record a tab-only change, and undo keeps the tab', () => {
    const { st, h } = run(base, [
      [setC(1e-6), 0],
      [{ t: 'plot', patch: { tab: 'zin' } }, 10_000],
      [{ t: 'plot', patch: { sweepId: id } }, 20_000],
    ])
    expect(h.past).toHaveLength(1)
    const u = undo(h, st)!
    expect(u.st.plot.tab).toBe('zin')
    expect(u.st.plot.sweepId).toBe(id)
    expect(capC(u.st)).toBe(capC(base))
  })

  it('records other plot changes', () => {
    const { h } = run(base, [[{ t: 'plot', patch: { tol: true } }, 0]])
    expect(h.past).toHaveLength(1)
  })

  it('records and undoes replace, which never groups', () => {
    const other = buildPreset(3)
    const { st, h } = run(base, [
      [{ t: 'replace', st: other }, 0],
      [{ t: 'replace', st: buildPreset(4) }, 1],
    ])
    expect(h.past).toHaveLength(2)
    const u = undo(h, st)!
    expect(u.st.name).toBe(other.name)
    expect(undo(u.hist, u.st)!.st.name).toBe(base.name)
  })

  it('ignores actions that change nothing', () => {
    const h: History = emptyHistory()
    const a: Action = { t: 'move', id, dir: -1 }
    const first = base.blocks[0]
    const r = run(base, [[{ ...a, id: first.id }, 0]], h)
    expect(r.h.past).toHaveLength(0)
  })
})

describe('undo with the EMI tab', () => {
  it('falls back to Zout when the restored design has EMI off', () => {
    const on = reducer(base, { t: 'emi', patch: { on: true } })
    const h = record(
      emptyHistory(),
      base,
      on,
      { t: 'emi', patch: { on: true } },
      0
    )
    const cur = reducer(on, { t: 'plot', patch: { tab: 'emi' } })
    const r = undo(h, cur)!
    expect(r.st.emi.on).toBe(false)
    expect(r.st.plot.tab).toBe('zout')
    const back = redo(r.hist, r.st)!
    expect(back.st.emi.on).toBe(true)
    expect(back.st.plot.tab).toBe('zout')
  })
  it('keeps any other tab', () => {
    const on = reducer(base, { t: 'emi', patch: { on: true } })
    const h = record(
      emptyHistory(),
      base,
      on,
      { t: 'emi', patch: { on: true } },
      0
    )
    const cur = reducer(on, { t: 'plot', patch: { tab: 'zin' } })
    expect(undo(h, cur)!.st.plot.tab).toBe('zin')
  })
})
