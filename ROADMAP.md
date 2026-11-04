# Roadmap: Input Filter Tuner

Proposed improvements, grouped into milestones. Each milestone stands alone,
so you can pick any of them in any order. Effort is S (under a day),
M (1 to 3 days) or L (more than 3 days).

Order: **M0 first** (decided 2026-11-04, done 2026-11-04). Then, by value
to a filter design review: **M1 → M2 → M4 → M3**, and the rest as needed.

Status key: `[ ]` not started, `[x]` done.

---

## M0. Port to the web-site-starter template (done 2026-11-04, legacy/ kept)

**Decision (2026-11-04):** split the single `index.html` into a Vite +
TypeScript project, built from the user's template
`D:\KiCAD\KiCAD Templates\web-site-starter`.

**Reason:**
- `index.html` is about 1,500 lines, and M1–M6 would add much more.
- Types and imports make the engine math safer to extend.

**Template contents (checked 2026-11-04):**
- Vite 8, React 19, TypeScript ~6, Tailwind CSS 4
- shadcn/ui (Radix) and TanStack Router with hash history
- ESLint, Prettier and knip
- Set up for GitHub Pages: `base` in `vite.config.ts`, plus hash routing
- Its own `CLAUDE.md` rules, which carry over:
  - Dark theme by default, with the brand tokens.
  - Use colour tokens, never raw hex.
  - Build pages from cards.
  - `npm run build`, `npm run lint` and Prettier must pass.
  - Check at 1440 px and 390 px, in dark and light.

**Gaps the template does not cover:**
- **No test runner.** Add Vitest and port `test/engine.test.mjs`, all
  75 checks. Port `test/browser_check.py` to run against `npm run preview`.
- **No single-file build.** Decided: both. `npm run build:single` with
  `vite-plugin-singlefile`, and GitHub Pages like the template.
- **Plotly.** Decided: `plotly.js-basic-dist-min` 2.35.3 from npm (scatter
  only, about 1 MB), loaded with a dynamic import.

**Port outline (to be planned in detail and approved before any code):**
- [x] Start a new project from the template. Keep the current `index.html`
  as the reference until the port has parity.
- [x] Engine as pure typed modules under `src/features/filter/engine/`:
  - complex math
  - block types
  - ABCD ladder
  - peak search (keep the Im-crossing bisection)
  - metrics and stage lookup (`sectionOf`)
  - closed forms
  - presets
- [x] State: a reducer, with URL-hash and localStorage persistence. Keep
  `adopt()` as the only whitelist and validator for untrusted input.
- [x] UI as React components using the template's card patterns:
  - value rows with a slider
  - block cards
  - SVG schematic
  - plot tabs
  - results tiles
  - snapshots
- [x] Parity check: every engine check passes in Vitest, every browser check
  passes, and the presets give the same numbers as the old `index.html`.

**Done when:**
- The port matches the old tool on all 14 presets.
- All engine and browser checks pass.
- The template's build, lint and Prettier checks pass.
- The old `index.html` is retired. (Kept in `legacy/` for now, by choice.)

---

## M1. Real part behaviour (model accuracy)

**Why:** the biggest errors in a real design come from part behaviour that the
tool now treats as fixed: MLCC capacitance under DC bias, inductor L under
current, and ESR that changes with frequency. Your reports already handle
these by hand (D4 re-runs at Lb 0.8 µH, LQRx derates by 33 %).

- [ ] **MLCC DC-bias curve per capacitor (M).** Enter C vs V points, as on
  the Murata curves in `LQRx/Images`. The tool picks C at Vin min, nom and
  max, so the margin uses the real C at each voltage.
- [ ] **Inductor / bead L vs DC current (M).** Enter L vs I points, or Isat
  with a roll-off. The tool takes the DC input current at each Vin and uses
  that L.
- [ ] **Corner sweep (S).** Run Vin min/nom/max, each with its own C, L and
  Rn, and report the worst-case margin and the corner it comes from. This
  replaces the single "tolerance curves" option.
- [ ] **Monte Carlo (M).** Run N random draws within the part tolerances and
  report the margin distribution: worst, 1st percentile and median.
- [ ] **Measured impedance import (M).** Load a part's |Z| and phase from CSV
  or Touchstone `.s1p`/`.s2p`, as exported by Murata SimSurfing or Würth
  REDEXPERT. Use that data in place of the R-L-C model.

**Done when:** a D4-style design shows its margin at both Lb values without
any manual edits, and every MLCC is evaluated at its bias voltage.

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
- [ ] **Parts library (M).** A JSON list of real parts: inductors with L,
  DCR and Isat, MLCCs with their DC-bias curve, and beads with the
  4-element model. Pick a part instead of typing its values.

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

## M6. Workflow and reports

- [ ] **SPICE netlist export (S).** Export LTspice `.cir`/`.asc` with every
  parasitic, so a design can be checked in LTspice in one step.
- [ ] **Design report export (M).** Export a Markdown or PDF report with the
  schematic, plots and numbers, in the NP-DR report layout, ready to drop
  into `document-archive`.
- [ ] **Named designs (S).** Save several designs in the browser, compare them
  side by side, and keep snapshots across reloads.
- [ ] **Undo/redo (S).**
- [x] **Offline use (S).** Done in M0: the single-file build carries Plotly.

---

## M7. Code health

- [x] **Engine as its own file (S).** Done in M0: `src/features/filter/engine/`.
- [ ] **ngspice cross-check (M).** A test that runs each preset in ngspice and
  compares Zout and H with the engine within 0.5 dB.
- [ ] **CI (S).** Run both test suites on every change. The Pages workflow
  runs `npm test` before it builds; the browser check is not in CI yet.

---

## Notes

- Each milestone keeps the current rules from `CLAUDE.md`: both test suites
  pass, report numbers stay as ground truth, and `adopt()` whitelists every
  new state field.
- Tell me the milestone (or single items) you want, and I will plan it first.
