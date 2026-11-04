// E-series tables and snapping (M3).
import { describe, expect, test } from 'vitest'
import { DECADE, snap, stepE } from './eseries'

describe('E-series tables', () => {
  test('sizes and order', () => {
    expect(DECADE.E6).toEqual([100, 150, 220, 330, 470, 680])
    expect(DECADE.E12).toEqual([
      100, 120, 150, 180, 220, 270, 330, 390, 470, 560, 680, 820,
    ])
    expect(DECADE.E24.length).toBe(24)
    expect(DECADE.E96.length).toBe(96)
    for (const t of Object.values(DECADE))
      for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1])
  })
  // Spot values from LQRx/Images/Resistor_E96.png (code → value).
  test.each([
    [1, 100],
    [16, 143],
    [32, 210],
    [48, 309],
    [64, 453],
    [68, 499],
    [80, 665],
    [96, 976],
  ])('E96 code %i is %i', (code, v) => expect(DECADE.E96[code - 1]).toBe(v))
})

describe('snap', () => {
  test('value on the series stays', () => {
    expect(snap(4.7e-6, 'E12')).toEqual({
      lower: 4.7e-6,
      upper: 4.7e-6,
      nearest: 4.7e-6,
    })
    expect(snap(1, 'E96').nearest).toBe(1)
    expect(snap(0.1, 'E6').nearest).toBe(0.1)
  })
  // NP-DR-26001 §4 and §7: Cd minimum 140, 99, 49 µF → chosen 150, 100, 47.
  test.each([
    [140e-6, 150e-6],
    [99e-6, 100e-6],
    [49e-6, 47e-6],
  ])('E12 nearest of %d is %d', (v, want) =>
    expect(snap(v, 'E12').nearest).toBe(want)
  )
  test('lower and upper bracket the value', () => {
    expect(snap(1.06, 'E96')).toMatchObject({ lower: 1.05, upper: 1.07 })
    expect(snap(9.9e-6, 'E12')).toMatchObject({ lower: 8.2e-6, upper: 10e-6 })
    expect(snap(0.97, 'E6')).toMatchObject({ lower: 0.68, upper: 1 })
  })
  test('nearest is log-nearest', () => {
    // √(1.5·2.2) = 1.817: below goes to 1.5, above to 2.2.
    expect(snap(1.81, 'E6').nearest).toBe(1.5)
    expect(snap(1.82, 'E6').nearest).toBe(2.2)
  })
  test('bad input passes through', () => {
    expect(snap(0, 'E12').nearest).toBe(0)
    expect(snap(Infinity, 'E12').nearest).toBe(Infinity)
  })
})

describe('stepE', () => {
  test('one step either way', () => {
    expect(stepE(4.7e-6, 'E12', 1)).toBe(5.6e-6)
    expect(stepE(4.7e-6, 'E12', -1)).toBe(3.9e-6)
    expect(stepE(9.76, 'E96', 1)).toBe(10)
    expect(stepE(1, 'E96', -1)).toBe(0.976)
    expect(stepE(1.06, 'E96', 1)).toBe(1.07)
    expect(stepE(1.06, 'E96', -1)).toBe(1.05)
  })
})
