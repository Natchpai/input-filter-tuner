import { expect, test } from 'vitest'
import { fmtIn, fmtSI, parseSI } from './si'

test("parseSI('10f') is 10 fF", () => {
  expect(Math.abs(parseSI('10f') - 1e-14)).toBeLessThan(1e-20)
})

test('parseSI keeps unit stripping', () => {
  expect(parseSI('2.2uF')).toBe(2.2e-6)
  expect(parseSI('1MHz')).toBe(1e6)
  expect(parseSI('68 mΩ')).toBeCloseTo(0.068, 12)
  expect(parseSI('1meg')).toBe(1e6)
})

test("'4u7' style parses", () => {
  expect(parseSI('4u7')).toBeCloseTo(4.7e-6, 18)
  expect(parseSI('2k2')).toBe(2200)
})

test('parseSI rejects text', () => {
  expect(parseSI('abc')).toBeNaN()
  expect(parseSI('')).toBeNaN()
})

test('fmtIn and fmtSI', () => {
  expect(fmtIn(4.7e-6)).toBe('4.7u')
  expect(fmtIn(0)).toBe('0')
  expect(fmtSI(22e-6, 'H')).toBe('22 µH')
  expect(fmtSI(-23.04, 'Ω')).toBe('−23 Ω')
  expect(fmtSI(Infinity, 'Ω')).toBe('∞ Ω')
  expect(fmtSI(null)).toBe('–')
})
