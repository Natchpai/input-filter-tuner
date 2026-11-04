# Roadmap: Input Filter Tuner

Proposed improvements, grouped into milestones. Each milestone stands alone,
so you can pick any of them in any order. Effort is S (under a day),
M (1 to 3 days) or L (more than 3 days).

Order by value to a filter design review: **M3b** (the optimizer) next,
and the rest as needed.

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
- **M3a. Design assistant** (2026-11-04, `docs/M3-plan.md`). Proposes L, C
  and the damping (Rd-Cd, parallel or series Rd-Ld, R across L) for 1 or 2
  stages from a dB or EMI target and margin k, sized by target Q (as in the
  reports) or to just meet k (Erickson); E-series rounding per part type
  with a recheck; Apply as one undo step. Sensitivity table (+10 % per
  part) as a card and a report section.
- **Dark theme** (2026-11-04): neutral greys around `#191a1b` instead of
  navy.

Still open from done milestones:
- [ ] Remove `legacy/` and `scripts/legacy-fixture.mjs` (M0), when the user
  says so.
- [ ] Run the D4 netlist in LTspice by hand and compare (M6).
- [ ] Check the EMI limit tables and AN impedances in
  `references/emi-limits.md` against the standards (M2).

---

## M3b. Design optimizer

**Why:** M3a gives one design that meets the targets. The optimizer finds
the best one for a chosen goal. Plan it in detail before any code.

- [ ] **Multi-goal optimizer (M).**
  - Minimize one goal: Cd, total C, DC loss or size.
  - Subject to: margin ≥ k, attenuation ≥ target, and the Q window
    (Qpeak, Qloss and Qstab, as in NP-DR-26004 §5).
  - Can start from the M3a proposal and reuse its E-series rounding.
- Uses the parts library from M8 when it exists (moved there 2026-11-04).

**Done when:** for a chosen goal, the tool proposes the E-series design with
the lowest value of that goal that meets margin k, the attenuation target
and the Q window.

---

## M5. Deeper stability check

- [ ] **Frequency-dependent converter Zin (M).** Use a simple closed-loop buck
  model with crossover fc. Below fc it is a negative resistance; above fc it
  trends to the converter's own input capacitance and passive impedance.
  Measured Zin can also be imported.
- [ ] **Forbidden-region criteria (S).** Add GMPM and ESAC (Wildrick et al.)
  next to the Middlebrook magnitude check. Report the Tm gain and phase
  margins.
- [x] **Several converters on one bus (S).** Use the parallel sum of each
  converter's Zin, with different P and fc. Done 2026-11-04
  (`docs/M5-plan.md`): up to 6 converters, |Rn| bands at each f check,
  EMI, ripple and load step per converter, report and netlists.

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
