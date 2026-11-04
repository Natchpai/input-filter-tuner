import type { Conv } from '../engine'

/** Converter fields: key, label, unit, slider min and max. */
export const CONV_FIELDS: [keyof Conv, string, string, number, number][] = [
  ['pout', 'Pout', 'W', 0.01, 10e3],
  ['pLight', 'Light load', 'W', 0.01, 10e3],
  ['eta', 'Efficiency η', '', 0.3, 1],
  ['vout', 'Vout', 'V', 0.3, 1000],
  ['fsw', 'fsw', 'Hz', 1e3, 10e6],
  ['phases', 'Phases N', '', 1, 8],
  ['k', 'Margin k', 'dB', 0, 20],
  ['fcheck', 'f check max', 'Hz', 100, 100e6],
]
/** Fields where 0 is a valid value. */
export const ZERO_OK = new Set<keyof Conv>(['pLight'])
