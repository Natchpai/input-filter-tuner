import { expect, test } from 'vitest'
import { setParam } from '../engine'
import { buildPreset } from '../state/presets'
import { compareRows, metricsOf } from './compare'

test('compare: key results first, then only the values that differ', () => {
  const a = buildPreset(1)
  const cap = a.blocks.find((b) => b.type === 'cap')!
  const b = {
    ...a,
    blocks: a.blocks.map((x) => (x === cap ? setParam(x, 'c', x.c * 2) : x)),
  }
  const same = compareRows(a, metricsOf(a), a, metricsOf(a))
  expect(same).toHaveLength(7)
  for (const [, x, y] of same) expect(x).toBe(y)
  const rows = compareRows(a, metricsOf(a), b, metricsOf(b))
  expect(rows.slice(7).map((r) => r[0])).toEqual([`${cap.name} C (each)`])
  expect(rows.slice(0, 7).some(([, x, y]) => x !== y)).toBe(true)
})

test('compare: blocks only in one design', () => {
  const a = buildPreset(1)
  const b = { ...a, blocks: a.blocks.slice(1) }
  const rows = compareRows(a, metricsOf(a), b, metricsOf(b))
  expect(rows.find((r) => r[0] === a.blocks[0].name)?.[2]).toBe('absent')
})
