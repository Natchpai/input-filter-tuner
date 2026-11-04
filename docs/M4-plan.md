# M4 plan: time domain

Status: **done (2026-11-04)**. Planned 2026-11-04.

M4 notes:
- Follow-up (user, 2026-11-04): no preset has a source L, so hot-plug gets
  its own cable, `tran.lCable` (default 1 µH) and `tran.rCable` (default
  0 Ω), added after Rsrc + Lsrc for the hot-plug only. Zout, H, EMI and the
  load step keep Rsrc + Lsrc as typed.
- With a total source L of 0, the inrush is set by ps spikes through ESL
  and Cb and moved 25 % with the step (D4, Pi). Inrush and I²t are null
  then; the card says to set the cable L.
- The step from resonance peaks missed an overdamped fast pole (Rs-Ls-C,
  2 % low). Every run is now repeated with half the step until V peak,
  inrush, dip and rise agree within 0.1 % (at most 1600 steps per period).
  All presets settle at 200 or 400.
- Droop is the total dip V light − V min, not V full − V min: an overdamped
  bus showed 0 V droop. The rise after the step down is V max − V full.
- The C-loop "unbounded" check in the plan was dropped; the Lsrc = 0 rule
  covers it.
- Cost: 15 to 130 ms per design (3 Vin × 2 runs × step check), so it runs in
  `workers/transient.worker.ts`. The worker key leaves out the plot
  settings.
- `tsconfig.node.json` type-checks `export/ltspice.test.ts` (Node APIs); the
  app config excludes it.
- LTspice 2026-11-04 (`LTSPICE=... npx vitest run ltspice`, 2 passed):

  | Case | Tool | LTspice |
  | --- | --- | --- |
  | D1 Rd-Cd hot-plug V peak | 54.58 V | 54.49 V |
  | D1 Rd-Cd inrush | 45.27 A | 45.20 A |
  | D1 Rd-Cd load step V min | 46.4983 V | 46.4983 V |
  | D4 hot-plug V peak | 19.30 V | 19.23 V |
  | D4 inrush | 25.37 A | 25.29 A |
  | D4 load step V min | 11.7730 V | 11.7728 V |

- Every preset, worst corner, default cable 1 µH / 0 Ω:

  | Preset | Hot-plug V peak | Inrush | Load step V min (dip) |
  | --- | --- | --- | --- |
  | D1 LC undamped | 95.0 V (+97.9 %) | 31.3 A | unstable |
  | D1 Rd-Cd | 54.6 V (+13.7 %) | 45.3 A | 46.50 V (1.50 V) |
  | D1 method A | 58.0 V (+20.9 %) | 14.6 A | 43.18 V (4.82 V) |
  | D1 method B | 59.2 V (+23.3 %) | 40.6 A | 46.54 V (1.46 V) |
  | D1 method D | 50.4 V (+4.9 %) | 14.6 A | 42.83 V (5.17 V) |
  | Parallel Rd-Ld | 74.7 V (+55.7 %) | 36.7 A | 45.86 V (2.14 V) |
  | Series Rd∥Ld | 80.5 V (+67.7 %) | 24.3 A | 44.37 V (3.63 V) |
  | D3 | 18.8 V (+56.3 %) | 20.8 A | 11.70 V (0.30 V) |
  | D4 | 19.3 V (+60.8 %) | 25.4 A | 11.77 V (0.23 V) |
  | Pi / CLC | 21.1 V (+41.0 %) | 60.6 A | 8.00 V (1.00 V) |
  | 2-stage LC | 44.5 V (+39.0 %) | 56.8 A | 16.43 V (1.57 V) |
  | D6 TPS62142 | 7.28 V (+32.3 %) | 26.7 A | 4.17 V (0.33 V) |
  | LQRx 02 | 37.7 V (+34.6 %) | 129.5 A | 12.74 V (2.26 V) |
  | LQRx 03 | 24.9 V (+3.7 %) | 24.7 A | 8.77 V (0.62 V) |

## Context

The frequency plots don't show hot-plug overshoot, inrush current or the
bus droop on a load step, and those often set the input cap's voltage
rating, the fuse and the TVS. ROADMAP M4 asks for a hot-plug step, a load
step and the source ripple waveform, solved with fixed-step trapezoidal
integration, cross-checked against the frequency response and against
LTspice within 5 % on one case.

## Decisions (user, 2026-11-04)

- **Load model:** constant power, I = P/(η·V) at each instant (same
  physics as Rn). Below 0.5·Vin_corner the current is held at
  P/(η·0.5·Vin_corner) (UVLO stand-in), so V → 0 cannot blow up.
- **Hot-plug:** converter off (open). Only the filter loads the cable.
  Worst overshoot, plain inrush. No new input field.
- **Option, off by default** (`tran.on`), same pattern as `emi.on`: card
  shows one line while off, no tab, no report section, nothing computed.
  Turning it off on the Time tab goes to Zout.

## Facts this plan rests on (checked 2026-11-04)

- No report has time-domain results for the input filter (searched all of
  `document-archive/documents`; no SPICE files). NP-TN-26005 report.md:618
  quotes TI's 12 V / 15 ft cable spike above 30 V, not our circuit. So
  there is no report ground truth for M4; checks are closed forms, the
  frequency response and LTspice.
- LTspice is installed: `%LOCALAPPDATA%\Programs\ADI\LTspice\LTspice.exe`
  (batch mode `-b`, `.meas` results in the `.log`). No standalone ngspice.
- `export/netlist.ts` already maps every block to R/L/C elements between
  nodes (`blockNet`, `ser`/`par`, `Builder`, `:23-216`), element for
  element with `zBlock`, and `netlist.test.ts` checks it. That is the
  circuit the solver needs.
- `atCorner()` / `corners()` (`engine/oppoint.ts:69,116`) give C(V) and
  L(I) at a corner. `metrics().dc` has Rdc and the drop
  (`metrics.ts:161-164`); `metrics().unstableAt` is the Nyquist verdict.
- `emi.ts` `harmonicAmp` gives |c_n| of the N-phase trapezoid; for pulses
  centred at t = 0 the complex coefficient is real, so a signed version
  gives the waveform.
- Wiring pattern from M2: `TabKey` (`model.ts:101`), `TABS`
  (`plots/traces.ts:35`), tab fallback (`traces.ts:174`, `adopt.ts:159`),
  `index.tsx:54` calc, card after `<Emi>` (`index.tsx:138`),
  `REPORT_FIGURES` / `CAPTIONS` (`report.ts:16,39`), `PLOT_FIGS`
  (`report-zip.ts:16`), worker pattern `workers/tolerance.worker.ts`.

## Method (deviation from ROADMAP wording, same math)

MNA on the element graph, not hand-derived state equations per block type.
Trapezoidal companion models for C and L are the trapezoidal rule on the
circuit's state equations, and the element graph already handles every
block form and zero-valued part.

- Unknowns: node voltages, plus branch currents of the V source and every
  inductor (so DC = same matrix with L → short, and the source current is
  read directly even with Rsrc = Lsrc = 0).
- Fixed dt; dense LU once per run (linear part). The constant-power load
  is a rank-1 change at the converter node: Newton per step (stop at
  |ΔV| < 1e-9·Vin, max 8), solved with Sherman-Morrison so the LU is
  reused.
- After each discontinuity (t = 0, load edges): 2 backward-Euler half
  steps, as SPICE does, so stiff parasitic modes (Cb, Cp, ESL) don't ring
  at the Nyquist rate.
- dt and tStop are automatic: scan |Hopen| (hot-plug) or |Zout| (load
  step) on a log grid up to min(fmax, 20·fsw), take the highest peak fHi
  and the lowest peak fLo with its Q. dt = 1/(100·fHi); run until the
  waveform stays within ±0.5 % of its final value for 3 periods of fLo,
  capped at 200 k steps ("did not settle"). Also stop when V leaves
  [−Vin, 4·Vin] ("unstable").

## Definitions (add to CLAUDE.md "Definitions")

- **Hot-plug.** At each Vin corner (C(V) at that Vin, L(I) at 0 A), the
  source steps 0 → Vin (ideal step) behind Rsrc + Lsrc, converter open,
  all states 0. Results: V peak at the converter pins and overshoot % over
  Vin; inrush peak = max source current; I²t until settled; peak node
  voltage of each shunt block (cap rating). Worst = highest V peak. If no
  R or L limits the current into the first cap, inrush is "unbounded" and
  the card says to set Rsrc or Lsrc.
- **Load step.** At each Vin corner (full-load corner values), start from
  the DC point at P_light (`pLight`), step to P_full (`pout`), settle,
  step back to P_light, settle. Ideal current-command step (worst case; no
  converter loop, that is M5). Results: droop = V_final − V_min after the
  up step, overshoot after the down step, ringing frequency, settle time
  to ±1 %, and a flag when it did not settle. Worst = lowest V_min.
- **Source ripple.** Steady state by Fourier synthesis at Vin nom, full
  load: i_src(t) = I_dc + Σ c_n·Re(Hopen(n·fsw)·e^{jnωt}), c_n the signed
  trapezoid coefficient (edge time `emi.tr`), n up to where the term is
  below 1e-6 of I_dc. Shown over 3 switching periods with the converter
  current. Result: source ripple p-p.

## Data model

- New top-level `tran: { on: boolean }` in `Design` (default off),
  `defaults.ts`, `adopt()` (boolean whitelist), `adopt.test.ts` cases.
- `plot.tview: 'hot' | 'step' | 'ripple'` (default `hot`): view setting,
  not recorded in `history.ts` (same as `tab`). `adopt()` whitelist.
- `TabKey 'time'` ("Time domain"); fallback to `zout` when `tran.on` is
  false, in `traces.ts` and `adopt.ts` (BUGLOG lesson: undo left EMI tab).
- No new block field, so `parity.test.ts` and the fixture are untouched.

## Engine

- `engine/circuit.ts` (new, pure): move `Net`, `el`/`ser`/`par`,
  `blockNet`, `Builder` out of `export/netlist.ts`; `netlist.ts` imports
  them. `netlist.test.ts` must pass unchanged (proves the move).
- `engine/transient.ts` (new): `buildTran(st)` → element list with the
  source branch and converter node; `simulate(circuit, {vsrc(t), pLoad(t),
  dt, tStop})` → `{t, v_out, i_src, v_nodes}` as Float64Arrays;
  `hotPlug(st)`, `loadStep(st)`, `rippleWave(st)` → per-corner results and
  the worst; `tranResult(st)` bundles them.
- `emi.ts`: add `harmonicSigned`; `harmonicAmp` = |harmonicSigned| (EMI
  numbers unchanged).
- Measure on all 14 presets. If any `tranResult` > 30 ms, run it in
  `workers/transient.worker.ts` like `tolerance.worker.ts`; else
  `useMemo` with `useDeferredValue`.

## UI (visual change: screenshots before finishing)

- **Time domain card** after the EMI card, header switch like EMI.
  Summary line: worst V peak (overshoot %) and inrush peak, worst droop,
  ripple p-p. Table per Vin corner: V peak, I peak, I²t, droop, settle
  time, status token (did not settle / unstable via `--status-*`). Peak V
  per shunt block at the worst hot-plug corner as a list.
- **Time tab**: segmented control Hot-plug / Load step / Ripple
  (`plot.tview`). Hot-plug: V at pins (left) and source current (right),
  worst corner bold, other corners faint. Load step: V at pins and
  converter current. Ripple: source and converter current, 3 periods.
  Colours via `plots/theme-colors.ts`; strings through `esc()`.

## Export

- `report.ts`: section "Time domain" after Conducted EMI when `tran.on`
  (sections after it renumber, as M2 did); figures `fig_hotplug.svg`,
  `fig_loadstep.svg`, `fig_ripple.svg`. `PLOT_FIGS` gains a view per
  entry. No new front-matter keys.
- `netlist.ts`: `spiceTranNetlist(st, 'hot' | 'step', corner)`. Hot-plug:
  PWL step source, `.tran` with the engine's tStop, `.meas` MAX V(out),
  MAX I(source). Load step: B-source `I = P(t)/(eta*max(V(out),vclamp))`,
  `.meas` MIN/MAX V(out). Both go into the report zip when `tran.on`.

## Tests (engine/transient.test.ts unless noted)

1. Series Rs-Ls-C (ESR 0) hot-plug: V peak = Vin(1 + e^(−ζπ/√(1−ζ²))) and
   I peak from i(t) = Vin/(ωd·L)·e^(−αt)·sin(ωd·t), within 0.1 %.
2. Rs-C only: inrush = Vin/Rs at t = 0+, V(τ) = Vin(1 − 1/e), 0.1 %.
3. Frequency cross-check: sine source at 4 frequencies around f0, steady
   amplitude at the pins vs |Hopen| from `point()` within 0.5 %; sine
   current into the pins vs |Zout| within 0.5 %. On D1 Rd-Cd and D4.
4. DC: hot-plug ends at Vin; load step ends at V with V = Vin − Rdc·P/(ηV)
   (consistent with `metrics().dc`).
5. Ripple: transient with a PWL trapezoid current run to steady state vs
   Fourier synthesis, p-p within 1 %; tr = 0 fundamental matches
   `metrics().ripple.isrc`.
6. Stability: a design with `metrics().unstableAt` set grows and is
   flagged; every stable preset settles.
7. dt halving: V peak, I peak and droop change < 0.5 % on every preset; D4
   (bead Cb 2 pF) shows no step-to-step sign alternation.
8. All 14 presets give finite hot-plug and load-step numbers; table goes in
   `docs/M4-plan.md` notes.
9. `export/ltspice.test.ts`, skipped unless env `LTSPICE` is set: writes
   the `.tran` netlists for D1 · LC + Rd-Cd (hot-plug and load step) and
   D4 (hot-plug), runs LTspice `-b`, parses `.meas` from the `.log`;
   V peak, I peak, droop within 5 %. This is the ROADMAP "Done when".

Also: `netlist.test.ts` for the tran netlists, `report.test.ts` section
numbers with `tran.on`, `adopt.test.ts`, `history.test.ts` (tview not
recorded). Browser check: card on every preset, Time tab draws all three
views, toggle off on the Time tab goes to Zout, `#d=` link keeps `tran`.

## Order of work

1. Copy this plan to `docs/M4-plan.md`.
2. Move the element graph to `engine/circuit.ts`; netlist tests green.
3. `transient.ts` solver + tests 1-4, 6-7. Measure timing.
4. Hot-plug, load step, ripple results + tests 5, 8.
5. LTspice netlists + test 9, run with LTspice locally.
6. Model fields, `adopt()`, history, tests.
7. Card and tab. Screenshots 1440 / 390 px, dark and light, in
   `%TEMP%\filter-shots`; show the user.
8. Report section and figures; report test.
9. Browser checks.
10. Docs: README features, CLAUDE.md definitions, ROADMAP ticks, M4 notes,
    BUGLOG entries for any bug found.
11. Run every "Done means" command and report pass/fail counts.

## Verification / done when

- Hot-plug overshoot and inrush peak shown for every preset; tests 1-8
  pass; LTspice check (test 9) within 5 % on D1 Rd-Cd, run locally with
  `LTSPICE=<path> npx vitest run ltspice`.
- `metrics()` and EMI numbers, `parity.test.ts` and the fixture unchanged.
- All CLAUDE.md "Done means" commands pass: `npm test`,
  `npm run build && npm run build:single`, `python -I
  test/browser_check.py`, `npm run lint`, `npx prettier --check .`,
  `npm run knip`.
- Known limits, stated in the card help and report Method: linear C(V)
  and L(I) at the corner (no large-signal saturation during inrush), ideal
  steps, no tolerances, converter loop not modelled (M5).
