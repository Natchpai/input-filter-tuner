# Roadmap: Input Filter Tuner

Proposed improvements, grouped into milestones. Each milestone stands alone,
so you can pick any of them in any order. Effort is S (under a day),
M (1 to 3 days) or L (more than 3 days).

Order by value to a filter design review: **M2 → M4 → M3**, and the rest
as needed.

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

Still open from done milestones:
- [ ] Remove `legacy/` and `scripts/legacy-fixture.mjs` (M0), when the user
  says so.
- [ ] Run the D4 netlist in LTspice by hand and compare (M6).

---

## M2. Conducted EMI prediction

**Why:** the filter exists to pass conducted emissions. Today the tool shows
only attenuation at fsw. A predicted spectrum against the limit lines answers
the real question: does it pass, and by how much?

- [ ] **Converter current spectrum (M).** Model the input current as a
  trapezoid with D, edge rise time and N interleaved phases. Show its
  harmonics up to 108 MHz.
- [ ] **LISN model (S).** Add CISPR 25 (5 µH / 50 Ω) and CISPR 16 (50 µH / 50 Ω)
  as the source impedance.
- [ ] **Predicted emissions plot (M).** Show the dBµV at the LISN for each
  harmonic, against CISPR 25 class 1–5 and CISPR 32 class A/B limits
  (peak/average), with the pass margin per band.
- [ ] **Required attenuation (S).** Show the attenuation still needed at
  each harmonic to meet the limit plus a user margin. This gives the
  corner frequency the filter needs.

**Done when:** for a chosen limit class, the tool shows pass or fail per band,
with the worst harmonic and its margin.

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

## M4. Time domain

**Why:** hot-plug overshoot and inrush current often decide the input
capacitor's voltage rating and the fuse. The frequency plots don't show them.

- [ ] **Hot-plug step (M).** Apply a step on Vin with the cable L and R, and
  show the overshoot at the converter pins and the inrush current peak.
- [ ] **Load step (M).** Apply a converter current step, Iin from P/Vin, and
  show the input-bus droop and ringing.
- [ ] **Source ripple waveform (S).** Show the time-domain input current at
  the source over a few switching periods.
- [ ] **Method (M).** Use a state-space model of the ladder, solved with
  fixed-step trapezoidal integration. Cross-check against the frequency
  response, and against LTspice for one preset.

**Done when:** the hot-plug overshoot and inrush peak are reported for each
preset, and match LTspice within 5 % on one test case.

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
