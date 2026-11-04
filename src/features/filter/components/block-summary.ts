// One-line value summaries for folded block and converter cards.
import type { Block, BusConv } from '../engine'
import { fmtSI } from '../lib/si'

/** Capacitor value as the schematic shows it: count, C, DC-bias loss. */
export function capLabel(b: { n: number; c: number; derate: number }) {
  const cnt = b.n > 1 ? `${b.n}× ` : ''
  const der = b.derate ? ` (−${b.derate}%)` : ''
  return cnt + fmtSI(b.c, 'F') + der
}

const join = (parts: (string | false)[]) =>
  parts.filter((p): p is string => !!p).join(' · ')

/** The main values of a block, for its folded card. */
export function blockSummary(b: Block): string {
  switch (b.type) {
    case 'ind':
      return join([
        fmtSI(b.L, 'H'),
        b.dcr > 0 && fmtSI(b.dcr, 'Ω'),
        b.dmode !== 'none' && `Rd ${fmtSI(b.dR, 'Ω')}`,
        (b.dmode === 'RLpar' || b.dmode === 'RLser') &&
          `Ld ${fmtSI(b.dL, 'H')}`,
      ])
    case 'bead2':
      return join([`Lb ${fmtSI(b.lb, 'H')}`, `Rdc ${fmtSI(b.rdc, 'Ω')}`])
    case 'bead4':
      return join([`Lb ${fmtSI(b.lb, 'H')}`, `Rs ${fmtSI(b.rs, 'Ω')}`])
    case 'res':
      return join([fmtSI(b.r, 'Ω'), b.l > 0 && `ESL ${fmtSI(b.l, 'H')}`])
    case 'cap':
      return join([capLabel(b), b.esr > 0 && `ESR ${fmtSI(b.esr, 'Ω')}`])
    case 'rc':
      return join([`Rd ${fmtSI(b.rd, 'Ω')}`, `Cd ${fmtSI(b.cd, 'F')}`])
  }
}

/** The main values of an extra converter, for its folded card. */
export const convSummary = (l: BusConv) =>
  join([fmtSI(l.pout, 'W'), fmtSI(l.fsw, 'Hz'), `η ${l.eta}`])
