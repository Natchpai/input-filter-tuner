import { describe, expect, it } from 'vitest'
import type { Figure } from '../plots/traces'
import { IMG_DEFAULT, presetSize, readImgOpts, scaleFigure } from './image-size'

describe('readImgOpts', () => {
  it('falls back to the defaults for junk', () => {
    expect(readImgOpts(null)).toEqual(IMG_DEFAULT)
    expect(readImgOpts('x')).toEqual(IMG_DEFAULT)
    expect(readImgOpts({ preset: 'bogus', fmt: 'gif', w: 'abc' })).toEqual(
      IMG_DEFAULT
    )
  })

  it('clamps and rounds numbers, accepts numeric strings', () => {
    const o = readImgOpts({
      preset: 'custom',
      w: '99999',
      h: 10,
      fmt: 'png',
      scale: 2.6,
      font: 100,
    })
    expect(o).toEqual({
      preset: 'custom',
      w: 4000,
      h: 150,
      fmt: 'png',
      scale: 3,
      font: 24,
    })
  })

  it('does not call toString on objects', () => {
    const evil = { toString: () => '500', valueOf: () => 500 }
    expect(readImgOpts({ w: evil }).w).toBe(IMG_DEFAULT.w)
  })
})

describe('presetSize', () => {
  it('gives fixed sizes and null for screen and custom', () => {
    expect(presetSize('slide')).toEqual([1600, 900])
    expect(presetSize('screen')).toBeNull()
    expect(presetSize('custom')).toBeNull()
  })
})

/** Value at a path inside a plain object (test helper). */
const at = (o: unknown, ...path: (string | number)[]): unknown =>
  path.reduce<unknown>((x, k) => (x as Record<string, unknown>)[k], o)

describe('scaleFigure', () => {
  const fig: Figure = {
    traces: [
      { x: [1, 2], y: [3, 4], textfont: { size: 11 }, line: { width: 2 } },
    ],
    layout: {
      font: { color: 'red', size: 11 },
      legend: { font: { size: 11 } },
      xaxis: { title: { font: { size: 12 } }, tickfont: { color: 'b' } },
      shapes: [{ label: { font: { size: 10 } } }],
      margin: { l: 62, r: 16, t: 10, b: 44 },
    },
  }

  it('returns the same figure at k = 1', () => {
    expect(scaleFigure(fig, 1)).toBe(fig)
  })

  it('scales every font size and the margins, nothing else', () => {
    const s = scaleFigure(fig, 2)
    const L = s.layout
    expect(at(L, 'font')).toEqual({ color: 'red', size: 22 })
    expect(at(L, 'legend', 'font', 'size')).toBe(22)
    expect(at(L, 'xaxis', 'title', 'font', 'size')).toBe(24)
    expect(at(L, 'xaxis', 'tickfont')).toEqual({ color: 'b' })
    expect(at(L, 'shapes', 0, 'label', 'font', 'size')).toBe(20)
    expect(at(L, 'margin')).toEqual({ l: 124, r: 32, t: 20, b: 88 })
    const t = s.traces[0]
    expect(at(t, 'textfont', 'size')).toBe(22)
    expect(at(t, 'line', 'width')).toBe(2)
    expect(at(t, 'x')).toEqual([1, 2])
  })

  it('does not change the input figure', () => {
    const before = JSON.stringify(fig)
    scaleFigure(fig, 1.5)
    expect(JSON.stringify(fig)).toBe(before)
  })
})
