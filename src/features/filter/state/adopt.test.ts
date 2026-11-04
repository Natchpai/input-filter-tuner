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

test('notes: strings kept up to 2000 characters, anything else dropped', () => {
  const base = JSON.parse(JSON.stringify(hostile))
  expect(adopt({ ...base, notes: bad }).notes).toBe(bad)
  expect(adopt({ ...base, notes: 'x'.repeat(5000) }).notes).toHaveLength(2000)
  for (const v of [{ a: 1 }, 42, null, '', ['x']])
    expect(adopt({ ...base, notes: v })).not.toHaveProperty('notes')
  expect(buildPreset(1)).not.toHaveProperty('notes')
})

const withBlock = (b: Record<string, unknown>) =>
  adopt({ conv: {}, blocks: [b] }).blocks[0] as unknown as Record<
    string,
    unknown
  >

test('cv and li: hostile values are dropped, good points are kept', () => {
  for (const v of [
    'abc',
    5,
    { 0: [1, 2] },
    null,
    ['abc'],
    [[NaN, 1]],
    [[1, Infinity]],
    [[[1], [2]]],
    [[-1, 1]],
    [[1, 0]],
    [[1, -3]],
    [[1]],
    [['', 1]],
    [[{}, 1]],
    [],
  ])
    expect('cv' in withBlock({ type: 'cap', c: 1e-6, cv: v }), String(v)).toBe(
      false
    )
  const b = withBlock({
    type: 'cap',
    c: 1e-6,
    cv: [[5, 1e-6], ['2', '2e-6'], [5, 9e-6], [-1, 1], [0, 3e-6], 'x'],
  })
  expect(b.cv).toEqual([
    [0, 3e-6],
    [2, 2e-6],
    [5, 1e-6],
  ])
})

test('cv and li: at most 64 points are kept', () => {
  const many = Array.from({ length: 10000 }, (_, i) => [i, 1 + i])
  expect((withBlock({ type: 'cap', cv: many }).cv as unknown[]).length).toBe(64)
})

test('cv only on caps, li only on ind, bead2 and bead4', () => {
  const pts = [
    [0, 1e-6],
    [1, 0.5e-6],
  ]
  expect('cv' in withBlock({ type: 'ind', cv: pts })).toBe(false)
  expect('li' in withBlock({ type: 'cap', li: pts })).toBe(false)
  expect('li' in withBlock({ type: 'res', li: pts })).toBe(false)
  for (const t of ['ind', 'bead2', 'bead4'])
    expect(withBlock({ type: t, li: pts }).li, t).toEqual(pts)
  expect(withBlock({ type: 'cap', cv: pts }).cv).toEqual(pts)
})

test('pLight: clamped to 0..pout, bad values give 0', () => {
  const d = (pLight: unknown) =>
    adopt({ conv: { pout: 10, pLight }, blocks: [] }).conv.pLight
  expect(d(2)).toBe(2)
  expect(d('3')).toBe(3)
  expect(d(-1)).toBe(0)
  expect(d(99)).toBe(10)
  for (const v of [NaN, 'abc', {}, undefined, null]) expect(d(v)).toBe(0)
})

test('cv, li and pLight round-trip through JSON', () => {
  const st = buildPreset(1)
  const cvPts = [
    [0, 10e-6],
    [12, 4e-6],
  ] as [number, number][]
  const liPts = [
    [0, 2e-6],
    [1.5, 1e-6],
  ] as [number, number][]
  st.conv.pLight = 1.5
  const cap = st.blocks.find((b) => b.type === 'cap')
  const ind = st.blocks.find((b) => b.type === 'ind')
  if (cap?.type === 'cap') cap.cv = cvPts
  if (ind?.type === 'ind') ind.li = liPts
  expect(cap && ind).toBeTruthy()
  const back = adopt(JSON.parse(JSON.stringify(st)))
  expect(back.conv.pLight).toBe(1.5)
  const bc = back.blocks.find((b) => b.type === 'cap')
  const bi = back.blocks.find((b) => b.type === 'ind')
  expect(bc?.type === 'cap' && bc.cv).toEqual(cvPts)
  expect(bi?.type === 'ind' && bi.li).toEqual(liPts)
})
