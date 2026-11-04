import type { Metrics } from '../engine'

export type Tone = 'good' | 'bad' | 'warn' | ''

/** Margin verdict: shared by the Results tile and the status strip. */
export function marginTone(m: Metrics): Tone {
  if (m.unstableAt) return 'bad'
  if (m.pass) return 'good'
  return m.margin > 0 ? 'warn' : 'bad'
}

export const toneText: Record<Tone, string> = {
  good: 'text-status-done',
  bad: 'text-destructive',
  warn: 'text-status-open',
  '': '',
}
