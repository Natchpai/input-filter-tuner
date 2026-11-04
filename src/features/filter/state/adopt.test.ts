import { expect, test } from 'vitest'
import { adopt } from './adopt'
import { buildPreset } from './presets'

const bad = '<img src=x onerror="window.__pwned=1">'
const hostile = {
  name: bad,
  conv: {
    vinMin: 12,
    vinNom: 12,
    vinMax: 12,
    pout: 10,
    eta: 1,
    vout: 5,
    fsw: 1e6,
    k: bad,
    fcheck: 1e6,
  },
  source: { R: 0, L: 0 },
  plot: { z0: bad, tab: 'sweep' },
  blocks: [
    { type: 'ind', name: 'L1', L: 10e-6, dcr: 0.02 },
    { type: 'cap', name: 'C1', c: 10e-6 },
    { type: 'rc', name: bad, rd: 1, cd: 47e-6, _q: '"><img src=x>' },
    { type: 'constructor', name: 'x' },
    { type: '__proto__', name: 'y' },
    { type: 'toString', name: 'z' },
  ],
}

test('hostile design: unknown types dropped, bad numbers replaced by defaults', () => {
  const d = adopt(JSON.parse(JSON.stringify(hostile)))
  expect(d.blocks.map((b) => b.type)).toEqual(['ind', 'cap', 'rc'])
  expect(d.plot.z0).toBe(50)
  expect(d.conv.k).toBe(6)
  expect(d.plot.tab).toBe('sweep')
  const rc = d.blocks[2]
  expect(rc.name).toBe(bad) // kept as text; React escapes it
  expect(rc._q).toBe(0.707)
})

test('limits are applied', () => {
  const d = adopt({
    conv: { eta: 0, phases: 99, k: -5, pout: -1 },
    plot: { n: 10, fmin: 1e6, fmax: 2e6, xfer: 'X', load: 'conv' },
    blocks: [{ type: 'cap', c: 1e-6, n: 500, derate: 100, esr: -1 }],
  })
  expect(d.conv.eta).toBe(0.3)
  expect(d.conv.phases).toBe(8)
  expect(d.conv.k).toBe(0)
  expect(d.conv.pout).toBe(10)
  expect(d.plot.n).toBe(100)
  expect(d.plot.fmax).toBe(1e7)
  expect(d.plot.xfer).toBe('H')
  expect(d.plot.load).toBe('conv')
  const c = d.blocks[0]
  expect(c.type === 'cap' && [c.n, c.derate, c.esr]).toEqual([50, 90, 0])
})

test('not a design throws', () => {
  expect(() => adopt(null)).toThrow()
  expect(() => adopt({ blocks: [] })).toThrow()
  expect(() => adopt('x')).toThrow()
})

test('a saved preset round-trips through JSON', () => {
  for (const i of [1, 5, 10]) {
    const st = buildPreset(i)
    const back = adopt(JSON.parse(JSON.stringify(st)))
    const strip = (d: typeof st) => ({
      ...d,
      blocks: d.blocks.map(({ id: _id, ...b }) => b),
    })
    expect(strip(back)).toEqual(strip(st))
  }
})
