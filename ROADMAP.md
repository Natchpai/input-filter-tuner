# Roadmap: Input Filter Tuner

Proposed improvements, grouped into milestones. Each milestone stands alone,
so you can pick any of them in any order. Effort is S (under a day),
M (1 to 3 days) or L (more than 3 days).

Order by value to a filter design review: **M3** next, and the rest as
needed.

Status key: `[ ]` not started, `[x]` done.

---

## Done

Details are in the plan docs and the git history.

- **M0. Port to the web-site-starter template** (2026-11-04). Vite + React +
  TypeScript, Vitest, a single-file build and GitHub Pages; same numbers as
  the old tool on all 14 presets.
- **M6. Workflow and reports** (2026-11-04, `docs/M6-plan.md`). Undo/redo,
  saved designs with overlays, design notes, SPICE netlist, plot images and
  the design report zip.
- **M1. Real part behaviour** (2026-11-04, `docs/M1-plan.md`).
  - M1a: operating-point corners (Vin × load), C vs DC bias and L vs DC
    current curves, the Corners card.
  - M1b: per-part tolerances, every ± extreme and a seeded Monte Carlo per
    corner, the Tolerance card.
- **M2. Conducted EMI prediction** (2026-11-04, `docs/M2-plan.md`).
  Trapezoid input-current spectrum with N phases, the CISPR 25 or CISPR 32
  LISN, predicted dBµV against the limits per band, the worst harmonic and
  its margin, the attenuation needed and the LC corner hint; EMI card, EMI
  tab and report section.
- **M4. Time domain** (2026-11-04, `docs/M4-plan.md`). Hot-plug overshoot,
  inrush and I²t with a cable, constant-power load step with droop and
  stability flag, source ripple waveform; MNA with trapezoidal steps in a
  worker, Time card, Time tab, report section and LTspice netlists.
  Matches LTspice within 2 % on D1 Rd-Cd and D4.

Still open from done milestones:
- [ ] Remove `legacy/` and `scripts/legacy-fixture.mjs` (M0), when the user
  says so.
- [ ] Run the D4 netlist in LTspice by hand and compare (M6).
- [ ] Check the EMI limit tables and AN impedances in
  `references/emi-limits.md` against the standards (M2).

---

## M3. Design assistant

**Why:** the tool analyses a design you type in. It can also propose one from
the requirements.

- [ ] **Auto-design single and 2-stage (M).**
  - Input: Vin range, P, η, fsw, the attenuation or EMI target, and margin k.
  - Output: L, C, Cd/C ratio n, Rd and Cd, following the Middlebrook and
    Erickson procedure.
  - For 2-stage, the attenuation is split between the stages.
- [ ] **E-series rounding (S).** Snap every value to E12, E24 or E96, as in
  `LQRx/Images/Resistor_E96.png`, and recheck the margin after rounding.
- [ ] **Multi-goal optimizer (M).**
  - Minimize one goal: Cd, total C, DC loss or size.
  - Subject to: margin ≥ k, attenuation ≥ target, and the Q window
    (Qpeak, Qloss and Qstab, as in NP-DR-26004 §5).
- [ ] **Sensitivity table (S).** Show how much the margin and the attenuation
  change, in dB, for a +10 % change in each part. This shows which part
  matters most.
- Uses the parts library from M8 when it exists (moved there 2026-11-04).

**Done when:** given only the requirements, the tool proposes an E-series
design that meets the margin and the attenuation target.

---

## M5. Deeper stability check

- [ ] **Frequency-dependent converter Zin (M).** Use a simple closed-loop buck
  model with crossover fc. Below fc it is a negative resistance; above fc it
  trends to the converter's own input capacitance and passive impedance.
  Measured Zin can also be imported.
- [ ] **Forbidden-region criteria (S).** Add GMPM and ESAC (Wildrick et al.)
  next to the Middlebrook magnitude check. Report the Tm gain and phase
  margins.
- [ ] **Several converters on one bus (S).** Use the parallel sum of each
  converter's Zin, with different P and fc.

**Done when:** the result says which criterion limits the design, with its
margin.

---

## M7. Code health

- [x] **Engine as its own file (S).** Done in M0: `src/features/filter/engine/`.
- [ ] **ngspice cross-check (M).** A test that runs each preset in ngspice and
  compares Zout and H with the engine within 0.5 dB.
- [ ] **CI (S).** Run both test suites on every change. The Pages workflow
  runs `npm test` before it builds; the browser check is not in CI yet.

---

## M8. Part data

Added 2026-11-04 from M1 (measured impedance) and M3 (parts library). No
report uses measured data yet, so this needs its own ground truth.

- [ ] **Parts library (M).** A JSON list of real parts: inductors with L,
  DCR, Isat and L vs I, MLCCs with their C vs DC bias, and beads with the
  4-element model. Pick a part instead of typing its values.
- [ ] **Measured impedance import (M).** Load a part's |Z| and phase from CSV
  or Touchstone `.s1p`/`.s2p`, as exported by Murata SimSurfing or Würth
  REDEXPERT. Use that data in place of the R-L-C model. Needs a size limit
  for `#d=` links and localStorage.

**Done when:** a design can use a library part and a measured |Z| file, and
both survive a link and a reload.

---

## Notes

- Each milestone keeps the current rules from `CLAUDE.md`: both test suites
  pass, report numbers stay as ground truth, and `adopt()` whitelists every
  new state field.
- Tell me the milestone (or single items) you want, and I will plan it first.
