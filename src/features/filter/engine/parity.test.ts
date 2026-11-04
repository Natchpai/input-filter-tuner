// Parity with the old single-file tool: every preset, built with the new
// code, gives the same numbers as legacy/index.html did. The reference was
// written by scripts/legacy-fixture.mjs and is frozen.
import { describe, expect, test } from 'vitest'
import { buildPreset, PRESET_COUNT, PRESET_NAMES } from '../state/presets'
import legacy from './__fixtures__/legacy-presets.json'
import { type Complex, metrics, point } from './index'

const REL = 1e-9

type Num = number | string | null

/** Fixture numbers: Infinity and NaN were stored as strings. */
const val = (v: Num) => (typeof v === 'string' ? Number(v) : v)

function same(got: number | null | undefined, want: Num, what: string) {
  const w = val(want)
  if (w === null || got === null || got === undefined) {
    expect(got ?? null, what).toBe(w)
    return
  }
  if (!Number.isFinite(w)) {
    expect(got, what).toBe(w)
    return
  }
  expect(
    Math.abs(got - w),
    `${what}: got ${got}, want ${w}`
  ).toBeLessThanOrEqual(Math.abs(w) * REL + 1e-300)
}

const sameC = (got: Complex, want: Num[], what: string) => {
  same(got.re, want[0], what + '.re')
  same(got.im, want[1], what + '.im')
}

/** Every number in a nested object, as [path, value] pairs. */
function leaves(o: unknown, path = ''): [string, unknown][] {
  if (o === null || typeof o !== 'object') return [[path, o]]
  return Object.entries(o).flatMap(([k, v]) =>
    leaves(v, path ? `${path}.${k}` : k)
  )
}

test('fixture has every preset', () => {
  expect(legacy.presets.length).toBe(PRESET_COUNT)
  expect(legacy.presets.map((p) => p.name)).toEqual(PRESET_NAMES)
})

describe.each(legacy.presets.map((p, i) => [p.name, i, p] as const))(
  'preset %s',
  (_name, i, ref) => {
    const st = buildPreset(i)

    test('design (incl. optimized damping) matches', () => {
      const blocks = st.blocks.map((b) => {
        const { id: _id, ...rest } = b
        return rest
      })
      for (const [path, want] of leaves({ ...ref.state, blocks: undefined })) {
        const got = path
          .split('.')
          .reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], {
            ...st,
            blocks: undefined,
          })
        if (typeof want === 'number') same(got as number, want, path)
        else expect(got, path).toEqual(want)
      }
      expect(blocks.length).toBe(ref.state.blocks.length)
      // cv, li and conv.pLight are M1a fields, not in the legacy tool. The
      // state loop above walks the fixture's keys, so pLight needs no skip.
      const M1A = ['cv', 'li']
      blocks.forEach((b, j) => {
        const r = ref.state.blocks[j] as Record<string, unknown>
        expect(
          Object.keys(b)
            .filter((k) => !M1A.includes(k))
            .sort(),
          `block ${j} keys`
        ).toEqual(Object.keys(r).sort())
        for (const [k, v] of Object.entries(b)) {
          if (M1A.includes(k)) continue
          if (typeof v === 'number') same(v, r[k] as number, `block ${j}.${k}`)
          else expect(v, `block ${j}.${k}`).toEqual(r[k])
        }
      })
    })

    test('metrics match', () => {
      const m = metrics(st)
      const r = ref.metrics
      for (const k of ['min', 'nom', 'max'] as const)
        same(m.rn[k], r.rn[k], 'rn.' + k)
      same(m.peak.v, r.peak.v, 'peak.v')
      same(m.peak.f, r.peak.f, 'peak.f')
      expect(m.peak.edge).toBe(r.peak.edge)
      same(m.margin, r.margin, 'margin')
      expect(m.pass).toBe(r.pass)
      same(m.unstableAt, r.unstableAt, 'unstableAt')
      if (r.prim) {
        expect(m.prim?.block.name).toBe(r.prim.name)
        for (const k of ['L', 'C', 'Z0', 'f0', 'rL'] as const)
          same(m.prim?.[k], r.prim[k], 'prim.' + k)
      } else expect(m.prim).toBeNull()
      same(m.qeff, r.qeff, 'qeff')
      same(m.qSeries, r.qSeries, 'qSeries')
      same(m.fLo, r.fLo, 'fLo')
      same(m.fHi, r.fHi, 'fHi')
      for (const grp of ['dc', 'ripple'] as const) {
        const g = m[grp] as unknown as Record<string, number>
        const rg = r[grp] as unknown as Record<string, Num | Num[]>
        for (const [k, v] of Object.entries(rg)) {
          if (k === 'perBlock') continue
          same(g[k], v as Num, `${grp}.${k}`)
        }
        const per = st.blocks.map((b) =>
          b.id in m[grp].perBlock ? m[grp].perBlock[b.id] : null
        )
        ;(rg.perBlock as Num[]).forEach((v, j) =>
          same(per[j], v, `${grp}.perBlock[${j}]`)
        )
      }
    })

    test('Zout, H, Hopen, S21, Zin, Tm at 40 frequencies match', () => {
      for (const p of ref.points) {
        const pt = point(st, p.f)
        for (const k of ['Zout', 'H', 'Hopen', 'S21', 'Zin', 'Tm'] as const)
          sameC(pt[k], p[k] as Num[], `${k} @ ${p.f}`)
      }
    })
  }
)
