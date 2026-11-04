// Conducted emission limits and artificial networks (M2, docs/M2-plan.md).
// Data only. Sources are listed in references/emi-limits.md. The values are
// ASSUMED until the user checks them against the standards.

export type EmiStd = 'cispr25' | 'cispr32'

/** Highest edge time, s, and highest EMI margin, dB, a design may hold. */
export const EMI_TR_MAX = 1e-6
export const EMI_MARGIN_MAX = 40

/** A limit in dBµV: flat, or [at fLo, at fHi] falling linearly in log f. */
export type Lim = number | [number, number]

export type EmiBand = {
  name: string
  /** Band edges, Hz. */
  fLo: number
  fHi: number
  /** Receiver resolution bandwidth, Hz. */
  rbw: number
  pk?: Lim
  qp?: Lim
  av?: Lim
}

export type EmiStdInfo = {
  label: string
  classes: string[]
  /** Highest frequency with a limit, Hz. */
  fMax: number
  /** Nominal network impedance: (jωL + R) ∥ Rm. */
  lisn: { name: string; L: number; R: number; Rm: number }
}

export const EMI_STDS: Record<EmiStd, EmiStdInfo> = {
  // CISPR 25 AN: (5 µH + 1 Ω) ∥ 50 Ω (CISPR 16-1-2 Table 5 network).
  cispr25: {
    label: 'CISPR 25 (voltage method)',
    classes: ['1', '2', '3', '4', '5'],
    fMax: 108e6,
    lisn: { name: '5 µH / 50 Ω AN', L: 5e-6, R: 1, Rm: 50 },
  },
  // CISPR 32 with the CISPR 16-1-2 V-AMN for 0.15-30 MHz: 50 µH ∥ 50 Ω.
  cispr32: {
    label: 'CISPR 32 (AC mains port)',
    classes: ['A', 'B'],
    fMax: 30e6,
    lisn: { name: '50 µH / 50 Ω V-AMN', L: 50e-6, R: 0, Rm: 50 },
  },
}

// CISPR 25 Ed. 4/5, conducted emissions, voltage method. [pk, qp, av] for
// class 5 down to class 1 (each class is +step dB). Source: emccalc.com
// CEV page (references/emi-limits.md). TV band I has no QP limit.
type C25Row = {
  name: string
  fLo: number
  fHi: number
  rbw: number
  /** Class 5 [pk, qp | null, av] and the step per class, dB. */
  c5: [number, number | null, number]
  step: number
}
const K = 9e3,
  M = 120e3
const C25: C25Row[] = [
  { name: 'LW', fLo: 0.15e6, fHi: 0.3e6, rbw: K, c5: [70, 57, 50], step: 10 },
  { name: 'MW', fLo: 0.53e6, fHi: 1.8e6, rbw: K, c5: [54, 41, 34], step: 8 },
  { name: 'SW', fLo: 5.9e6, fHi: 6.2e6, rbw: K, c5: [53, 40, 33], step: 6 },
  { name: 'CB', fLo: 26e6, fHi: 28e6, rbw: K, c5: [44, 31, 24], step: 6 },
  { name: 'VHF', fLo: 30e6, fHi: 54e6, rbw: M, c5: [44, 31, 24], step: 6 },
  { name: 'TV I', fLo: 41e6, fHi: 88e6, rbw: M, c5: [34, null, 24], step: 6 },
  { name: 'VHF', fLo: 68e6, fHi: 87e6, rbw: M, c5: [38, 25, 18], step: 6 },
  { name: 'FM', fLo: 76e6, fHi: 108e6, rbw: M, c5: [38, 25, 18], step: 6 },
]

// CISPR 32 AC mains port, QP and AV. Class B falls with log f from 0.15 to
// 0.5 MHz. Sources: IB Lenhardt glossary (QP), Tom's Hardware and Tekbox
// (AV), see references/emi-limits.md. At 0.5 and 5 MHz the lower limit
// applies, so each harmonic there is judged in both bands.
const C32: Record<'A' | 'B', EmiBand[]> = {
  A: [
    { name: '0.15-0.5 MHz', fLo: 0.15e6, fHi: 0.5e6, rbw: K, qp: 79, av: 66 },
    { name: '0.5-30 MHz', fLo: 0.5e6, fHi: 30e6, rbw: K, qp: 73, av: 60 },
  ],
  B: [
    {
      name: '0.15-0.5 MHz',
      fLo: 0.15e6,
      fHi: 0.5e6,
      rbw: K,
      qp: [66, 56],
      av: [56, 46],
    },
    { name: '0.5-5 MHz', fLo: 0.5e6, fHi: 5e6, rbw: K, qp: 56, av: 46 },
    { name: '5-30 MHz', fLo: 5e6, fHi: 30e6, rbw: K, qp: 60, av: 50 },
  ],
}

/** Bands of one standard and class, in frequency order; [] if unknown. */
export function bandsOf(std: EmiStd, cls: string): EmiBand[] {
  if (std === 'cispr32') return cls === 'A' || cls === 'B' ? C32[cls] : []
  const k = Number(cls)
  if (!Number.isInteger(k) || k < 1 || k > 5) return []
  return C25.map((r) => {
    const up = (5 - k) * r.step
    const [pk, qp, av] = r.c5
    return {
      name: r.name,
      fLo: r.fLo,
      fHi: r.fHi,
      rbw: r.rbw,
      pk: pk + up,
      ...(qp === null ? {} : { qp: qp + up }),
      av: av + up,
    }
  })
}

/** Value of one limit at f inside its band, dBµV. */
export function limVal(l: Lim, b: EmiBand, f: number): number {
  if (typeof l === 'number') return l
  const t = Math.log10(f / b.fLo) / Math.log10(b.fHi / b.fLo)
  return l[0] + (l[1] - l[0]) * t
}

/** The strictest limit of a band at f (fixed-frequency source), dBµV. */
export function bandLimit(b: EmiBand, f: number): number {
  return Math.min(
    ...[b.pk, b.qp, b.av]
      .filter((l): l is Lim => l !== undefined)
      .map((l) => limVal(l, b, f))
  )
}
