import { describe, expect, it } from 'vitest'
import { formatCurve, parseCurve } from './curve-text'

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-12 + 1e-9 * b

describe('parseCurve formats', () => {
  it('reads units, separators and exponents', () => {
    const lines = [
      '12 V; 3.96 µF',
      '24, 3.5u',
      '36\t3.0e-6',
      '48 V, 2.5 µF',
      '50   2u',
      '60 V 1.5 µF',
    ]
    const { points, errors } = parseCurve(lines.join('\n'))
    expect(errors).toEqual([])
    expect(points.map((p) => p[0])).toEqual([12, 24, 36, 48, 50, 60])
    const ys = [3.96e-6, 3.5e-6, 3e-6, 2.5e-6, 2e-6, 1.5e-6]
    points.forEach((p, i) => expect(close(p[1], ys[i])).toBe(true))
  })

  it('reads a SimSurfing-like CSV with a header and extra columns', () => {
    const csv = [
      'DC Bias Voltage [V],Capacitance [F],Change [%]',
      '0,4.7E-06,0',
      '10,4.1E-06,-12.8',
      '25,2.9E-06,-38.3',
    ].join('\r\n')
    const { points, errors } = parseCurve(csv)
    expect(errors).toEqual([])
    expect(points).toEqual([
      [0, 4.7e-6],
      [10, 4.1e-6],
      [25, 2.9e-6],
    ])
  })

  it('handles Windows line ends and blank lines', () => {
    const { points, errors } = parseCurve('\r\n1, 2\r\n\r\n3, 4\r\n')
    expect(errors).toEqual([])
    expect(points).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('sorts by x', () => {
    expect(parseCurve('5, 1\n1, 2\n3, 3').points.map((p) => p[0])).toEqual([
      1, 3, 5,
    ])
  })

  it('returns no points for empty text', () => {
    expect(parseCurve('  \n ')).toEqual({ points: [], errors: [] })
  })
})

describe('parseCurve errors', () => {
  it('reports line numbers', () => {
    const { points, errors } = parseCurve('x, y\n1, 2\n3, abc\n-1, 5\n6, 0\n7')
    expect(points).toEqual([[1, 2]])
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5, 6])
    expect(errors[0].text).toBe('3, abc')
  })

  it('treats a text line after data as an error, before data as a header', () => {
    const { errors } = parseCurve('Voltage, Cap\n1, 2\nnote, here')
    expect(errors.map((e) => e.line)).toEqual([3])
  })

  it('rejects infinite values', () => {
    expect(parseCurve('1, 1e999').errors).toHaveLength(1)
  })

  it('keeps the first of a duplicate x', () => {
    const { points, errors } = parseCurve('1, 2\n1, 3\n2, 4')
    expect(points).toEqual([
      [1, 2],
      [2, 4],
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0].line).toBe(2)
  })

  it('caps at 64 points and reports the rest', () => {
    const text = Array.from({ length: 70 }, (_, i) => `${i}, 1`).join('\n')
    const { points, errors } = parseCurve(text)
    expect(points).toHaveLength(64)
    expect(errors.map((e) => e.line)).toEqual([65, 66, 67, 68, 69, 70])
  })
})

describe('formatCurve', () => {
  it('round-trips within SI rounding', () => {
    const c: [number, number][] = [
      [0, 4.7e-6],
      [12, 3.96e-6],
      [0.5, 2.2e-7],
      [48, 1.01e-6],
    ]
    const sorted = [...c].sort((a, b) => a[0] - b[0])
    const text = formatCurve(sorted, 'V', 'F')
    expect(text.split('\n')[1]).toContain('500 mV')
    const { points, errors } = parseCurve(text)
    expect(errors).toEqual([])
    expect(points).toHaveLength(sorted.length)
    points.forEach((p, i) => {
      expect(close(p[0], sorted[i][0])).toBe(true)
      expect(Math.abs(p[1] / sorted[i][1] - 1)).toBeLessThan(1e-2)
    })
  })

  it('formats amps and henries', () => {
    expect(formatCurve([[1.5, 2.2e-6]], 'A', 'H')).toBe('1.5 A, 2.2 µH')
  })
})
