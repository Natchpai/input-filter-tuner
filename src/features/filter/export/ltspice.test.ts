// LTspice cross-check of the time-domain solver (M4 test 9, the ROADMAP
// "Done when"). Runs only when LTSPICE points to LTspice.exe:
//   LTSPICE="$LOCALAPPDATA/Programs/ADI/LTspice/LTspice.exe" npx vitest run ltspice
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hotPlugAt, loadStepAt } from '../engine'
import { mkLoad } from '../state/defaults'
import { buildPreset, PRESET_NAMES } from '../state/presets'
import { spiceHotPlug, spiceLoadStep } from './netlist'

const LT = process.env.LTSPICE
const OPTS = { date: 'test', link: 'test' }
/** ROADMAP M4: match LTspice within 5 %. */
const TOL = 0.05

/** Runs one netlist in batch mode and returns its .meas values by name. */
function run(dir: string, name: string, text: string): Record<string, number> {
  const cir = join(dir, name + '.cir')
  writeFileSync(cir, text)
  execFileSync(LT!, ['-b', cir], { timeout: 120_000 })
  const raw = readFileSync(join(dir, name + '.log'))
  // LTspice writes the log as UTF-16LE on some versions.
  const log = raw[1] === 0 ? raw.toString('utf16le') : raw.toString('latin1')
  const out: Record<string, number> = {}
  for (const m of log.matchAll(/^(\w+):.*?=\s*([-+0-9.eE]+)/gm))
    out[m[1].toLowerCase()] = Number(m[2])
  return out
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe.skipIf(!LT)('LTspice cross-check (test 9)', () => {
  for (const prefix of ['D1 · LC + Rd-Cd', 'D4']) {
    const i = PRESET_NAMES.findIndex((n) => n.startsWith(prefix))
    it(`${PRESET_NAMES[i]}: hot-plug and load step within 5 %`, () => {
      const st = buildPreset(i)
      const vin = st.conv.vinNom
      const dir = mkdtempSync(join(tmpdir(), 'filter-lt-'))
      try {
        const h = hotPlugAt(st, vin)
        const a = run(dir, 'hot', spiceHotPlug(st, h, OPTS))
        // Overshoot above Vin, not the peak itself, so 5 % means something.
        expect(rel(h.vPeak - vin, a.vpk - vin)).toBeLessThan(TOL)
        expect(rel(h.iPeak!, -a.imin)).toBeLessThan(TOL)
        const s = loadStepAt(st, vin)
        const b = run(dir, 'step', spiceLoadStep(st, s, OPTS))
        expect(rel(s.vLight, b.vlight)).toBeLessThan(1e-3)
        expect(rel(s.droop, b.vlight - b.vmin)).toBeLessThan(TOL)
        expect(rel(s.rise, b.vmax - s.vFull)).toBeLessThan(TOL)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }

  it('D1 Rd-Cd with two converters: load step V min within 1 % (M5)', () => {
    const i = PRESET_NAMES.findIndex((n) => n.startsWith('D1 · LC + Rd-Cd'))
    const st0 = buildPreset(i)
    const st = {
      ...st0,
      loads: [
        mkLoad(st0.conv, 'Aux', { pout: 40, pLight: 5, eta: 0.85 }, 'x1'),
      ],
    }
    const vin = st.conv.vinNom
    const dir = mkdtempSync(join(tmpdir(), 'filter-lt-'))
    try {
      const s = loadStepAt(st, vin)
      const b = run(dir, 'step2', spiceLoadStep(st, s, OPTS))
      expect(rel(s.vLight, b.vlight)).toBeLessThan(1e-3)
      expect(rel(s.vMin, b.vmin)).toBeLessThan(0.01)
      expect(rel(s.droop, b.vlight - b.vmin)).toBeLessThan(TOL)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
