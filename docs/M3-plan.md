# M3 plan: design assistant

Status: **M3a done (2026-11-04), M3b done (2026-11-05)**. Scope: M3a
(auto-design, E-series rounding, sensitivity table) and M3b (optimizer,
second half of this file).

Progress (2026-11-04):
- Done: step 0 plan (`bd9c8ae`), steps 1-6 engine and state (`2e23581`),
  steps 7-9 UI, report, browser check and docs.
- Gates: 471 Vitest passed (3 skipped, the LTspice cases), both builds,
  browser check 319 passed / 0 failed, lint, prettier and knip clean.
  Parity unchanged. Two browser-check runs out of five had one flaky
  console error each, in code M3 does not touch (a Plotly redraw after a
  page closed; a refused resource load in the M2 shots); both reruns
  passed.
- Deviations from the plan text below:
  - `nForPeak` is the exact inverse (each peak formula is a quadratic in
    n), not a bisection.
  - "Just meet margin k" also works for R across L: it uses Q = Qstab.
  - When the DCR alone gives the target Q, the stage gets no damping part
    (rd = null) instead of a 1 kΩ leg.
  - A warning when an f0 reaches fa: C and the source alone almost meet
    the target, so L is very small.
  - E-series retry: each round tries one step up and one step down for
    every part and keeps the best move.
  - No worker: Propose takes 9-14 ms in the browser (EMI target on D4 with
    2 stages included); sensitivity runs on the main thread while its card
    is open.
  - The report's Sensitivity section follows Results, so every later
    section number moves up by one.
- Not in M3, done on request the same day: the dark theme is neutral
  greys around `#191a1b` instead of navy (`src/styles/theme.css`,
  theme-color in `index.html` and `theme-switch.tsx`).

## Context

Today the tool only analyses a design you type in. ROADMAP M3 asks it to
propose one from the requirements. M3 is split (user, 2026-11-04):
- **M3a (this plan):** auto-design (1 and 2 stage), E-series rounding,
  sensitivity table. It meets the M3 "Done when": given only the
  requirements, the tool proposes an E-series design that meets margin k and
  the attenuation target.
- **M3b (later):** the multi-goal optimizer (Q window, minimize Cd / total C
  / DC loss). Planned in detail only after M3a ships.

Step 0 copies this plan to `docs/M3-plan.md` (same shape as M5-plan.md).

## Decisions (user, 2026-11-04)

- Attenuation target: either **A dB at fa** (fa default = lowest N·fsw of
  the converters that are on; N·fsw because the input current has no line
  at fsw when N > 1), or **from EMI** (needs `emi.on`; the proposal must give
  EMI margin ≥ 0 in every band).
- Free choice after f0: **per stage, the user fixes L or C** and its value.
- Damping forms: **Rd-Cd across C (`rc`), parallel Rd-Ld (`RLpar`), series
  Rd∥Ld (`RLser`), R across L (`R`, method B)**. Bead window: not in M3.
- Sizing rule: **both**, default **Target Q**:
  - *Target Q* (reports): peak ≈ Q·Z0. For `rc`: Rd = Z0²/(Z0/Q − rL)
    (`rdForQ`), Cd = 10/(2π·f0·Rd), i.e. Xcd = Rd/10 at f0 (NP-DR-26001 §7).
    For `R`: same Rd across L. For `RLpar`/`RLser`: n from
    closedForm(mode, n).peak = Q·Z0, Rd from closedForm.
  - *Least Cd* (Erickson): peak target = Qstab·Z0 = |Rn|/k, n from the
    closed form, Rd from closedForm. Not offered for `R` (no n).
- 2 stages: **equal dB split by default**, field for the stage-1 share (%).
  Fixed L/C value and damping form are **per stage**.
- **Preview, then Apply.** Apply replaces `blocks` as one undo step.
- **Design nominal, check corners:** the proposal shows the worst-corner
  margin and flags a failure; it does not iterate on corners.
- E-series **per part**: L, C, Cd, Ld on E12, resistors on E96 by default,
  each selectable (E6/E12/E24/E96). Snap to the log-nearest value, recheck,
  then try neighbours (below).

## Ground truth (from the reports)

All reports size damping from a target Q; none has Erickson's optimum or a
2-stage filter.
- NP-DR-26001 §4: 48 V, 100 W, L 22 µH, rL 20 mΩ, C 10 µF, Q 0.707 →
  Rd 1.06 Ω, Cd min 140 µF, chosen 150 µF (E12 rounding gives 150 µF).
- NP-DR-26001 §7 table: Q 1 → 1.50 Ω / 99 µF → 100 µF; Q 2 → 3.05 Ω /
  49 µF → 47 µF; Qstab = 7.8 (k = 2).
- NP-DR-26004 §5: Qstab = 22.8 (12 V, 10 W, Z0 0.316 Ω, k = 2 → 6.02 dB);
  40 dB at 1.1 MHz with C 10 µF → L ≥ 0.21 µH (closed-form start value).
- LQRx 03 report :108-126: L 2.2 µH, C 3.1 µF (4.7 µF derated at 24 V),
  Z0 = 0.84 Ω, DCR 0.2 Ω, Q = 1 → Rd = 1.1 Ω (rdForQ gives 1.105 Ω), with
  Cd ≈ 18 µF.
- E96 table: IEC 60063, checked value by value against
  `LQRx/Images/Resistor_E96.png` (100 … 976, 96 values).
- Least Cd, `RLpar`/`RLser` inverse, 2-stage and E-series retry: no report.
  Ground truth there is the existing closed forms (already checked against
  `optimizeParam` in `engine.test.ts`) plus engine round-trip tests.

## Definitions to add to CLAUDE.md

- Zmax = min band |Rn| at Vin min, full power (`marginBands` bands) ×
  10^(−k/20); Qstab = Zmax/Z0 per stage.
- Attenuation A(f) = −20·log10|Hopen(f)| of the whole design (source R, L in
  the path, converter open), the same H as the ripple `hfr`.
- Stage = one LC section in `sectionOf` terms; stage 1 is on the source
  side (block order source → converter).
- Proposal algorithm (below) and the Apply rules.

## Algorithm (`engine/design.ts`, pure)

1. **Start values.** Stage i gets A_i dB (split %). f0_i = fa·10^(−A_i/40).
   L or C from the fixed one: C = 1/((2π f0)²·L) or L = 1/((2π f0)²·C).
   Damping from the sizing rule with Z0_i, f0_i, rL (DCR of the carried-over
   inductor, else the TYPES default).
2. **Exact attenuation.** One scale u on every f0_i (keeps the split).
   Bisection on log u until the exact check holds within 0.05 dB:
   - dB mode: A(fa) ≥ target;
   - EMI mode: `emiResult(candidate).rows` worst margin ≥ 0, starting from
     `f0Max` (single stage) or the 80 dB/dec equivalent.
   This also covers `RLpar` (HF L is L·n/(1+n)) and Lsrc. Method B caps
   A at about Rd/|ZC|: if the target is not reached at the bound
   (f0 = fa/1000 or a TYPES max), return `reachable: false` with the best A.
3. **Margin polish.** Engine margin at Vin min (`marginBands`) plus the
   Nyquist check as in `metrics()`. Least Cd: if margin < k, scale n (up for
   `rc`/`RLser`, down for `RLpar`) by bisection until margin ≥ k + 0.1 dB.
   Target Q: no change; report "Q too high, Qstab = …".
   Then redo step 2 once (polish moves A a little); at most 2 rounds.
4. **E-series.** Snap every value to its series (log-nearest). Check A and
   margin. If one fails: greedy, up to (part count) rounds; each round tries
   the other neighbour of every part and keeps the change that cuts the
   shortfall max(0, A_t − A) + max(0, k − margin) most. Stop when both pass
   or nothing helps; then show the failing numbers.
5. **Corners.** `cornerMetrics()` on the rounded design: worst margin and
   its label, flagged when below k. Informational only.
6. **Output (`Proposal`):** per stage L, C, form, n, Rd, Cd or Ld, f0, Z0,
   Q (`qSeriesOf`-style), Qstab; continuous and E-series values; A at fa or
   EMI worst margin; nominal margin; worst-corner margin; pass flags;
   warnings (out of TYPES range, not reachable, Q > Qstab).

**Apply (`applyProposal(st, p, ids)`):** a new `blocks` list, source side
first: per stage `ind` (dmode none/R/RLpar/RLser with dR, dL), `cap`, and
an `rc` leg when the form is `rc`. Parasitics (dcr, cp, esr, esl) come from
the existing block in the same role (stage k's k-th inductor, cap bank, rc
leg), else TYPES defaults. Curves (`cv`, `li`), `tol` and `derate` are
dropped, since they belong to the old part. Other blocks (beads, series R,
extra banks) are removed; undo brings them back. Ids from `newId()` in the
click handler; the reducer gets `{ t: 'replace', st }`.

## State

`asst: AsstSettings` on `Design` (like `emi`, `tran`), off by default:
`on`, `stages` (1|2), `target` ('db'|'emi'), `aDb` (40), `fa` (0 = auto),
`split` (50 %), `rule` ('q'|'leastCd'), `q` (1), `st: [StageIn, StageIn]`
with `fix` ('L'|'C'), `val`, `damp`, and `ser: {L, C, R}` series names.
- `state/defaults.ts` ASST_DEFAULTS; `adopt.ts` whitelist and clamps, plus
  `adopt.test.ts` cases; `reducer.ts` `{ t: 'asst'; patch }` with the same
  clamps as adopt; `history.ts` same-key join like `emi`.
- Top-level key, so no `parity.test.ts` skip entry (M5 note). Parity
  unchanged: no existing number moves.
- The proposal itself is not state (UI state in the card), so it is never
  saved, linked or undone.

## Sensitivity (`engine/sensitivity.ts`, pure)

For every value key in use (`TOL_KEYS` with `keyInUse`, exported from
`tolerance.ts`) on every block that is on: +10 % via `applyTol`, then
Δmargin (dB, `marginBands` at `vinLow`) and ΔA (dB at the ripple fr of the
worst converter, `metrics().ripple.fr`). Rows sorted by |Δmargin|. Same
check range as the margin, never the plot zoom. Card computes it with
`useMemo` on the deferred design; if the browser check shows > 50 ms on
D4, move it into `tolerance.worker.ts`.

## UI

- `components/assistant.tsx`: "Design assistant" card. Off: one line with
  a switch (EMI card pattern). On: target, stages, split, rule, Q, per-stage
  fix L/C + value + damping form, series pickers; a **Propose** button
  (runs on click only); result table with continuous and E-series columns,
  pass/fail tiles (`--status-*` tokens), warnings, **Apply**.
- `components/sensitivity.tsx`: "Sensitivity" card, table part / value /
  Δmargin / ΔA, largest first.
- `index.tsx`: Sensitivity after Tolerance; Design assistant after Time,
  before Designs (new cards go below Results).
- Propose time: measured in the browser check; if > 300 ms on D4 in EMI
  mode, run it in a worker like tolerance (`workers/design.worker.ts`).

## Report

`export/report.ts`: a Sensitivity section (table) for every design; the
assistant inputs are not in the report (the applied design is). Front
matter unchanged. `report.test.ts` updated.

## Steps (commit on `main` after each, solo repo; no push without asking)

0. `docs/M3-plan.md` from this plan.
1. Ground truth: re-read NP-DR-26001 §4/§7, NP-DR-26004 §5, LQRx 03
   :110-146; record exact numbers in the plan doc.
2. `engine/eseries.ts` + tests: E6/E12/E24/E96 tables (IEC 60063; E24
   uses the table values, not a formula; E96 checked against
   `LQRx/Images/Resistor_E96.png`), `snap(v, ser)` → nearest/lower/upper.
3. `closed-form.ts`: `nForPeak(mode, ratio)` (bisection inverse) and
   `cdForRd(f0, rd)`; round-trip tests and the report numbers above.
4. State: `AsstSettings`, defaults, adopt, reducer, history + tests.
5. `engine/design.ts` + `design.test.ts`: steps 1-6 and Apply. Tests: the
   report numbers; least-Cd peak vs `optimizeParam` within 1 %; "Done
   when" end to end on D1 and D4 presets, 1 and 2 stage, each form: the
   E-series proposal has A ≥ target and nominal margin ≥ k, every value on
   its series; method B unreachable case; EMI mode on a preset with EMI on.
6. `engine/sensitivity.ts` + test: +10 % C on a plain LC at f ≫ f0 gives
   ΔA ≈ +0.83 dB (20·log10 1.1).
7. UI cards and layout; screenshots at 1440 px and 390 px, dark and light.
8. Report section; browser check: assistant on → Propose on D1 → Apply →
   margin tile passes; undo restores blocks; sensitivity rows present;
   Propose timing.
9. Docs: CLAUDE.md (Next, Definitions, Layout), ROADMAP ticks for the three
   M3a items, README, BUGLOG entry if a bug was fixed.

## Verification (done means all pass; report counts)

```
npm test
npm run build && npm run build:single
python -I test/browser_check.py
npm run lint
npx prettier --check .
npm run knip
```
Parity fixture unchanged. Screenshots in `%TEMP%\filter-shots`, looked at.

## Critical files

- New: `engine/eseries.ts`, `engine/design.ts`, `engine/sensitivity.ts`
  (+ tests), `components/assistant.tsx`, `components/sensitivity.tsx`,
  `docs/M3-plan.md`.
- Changed: `engine/model.ts`, `engine/closed-form.ts`, `engine/tolerance.ts`
  (export `keyInUse`), `engine/index.ts`, `state/defaults.ts`,
  `state/adopt.ts`, `state/reducer.ts`, `state/history.ts`, `index.tsx`,
  `export/report.ts`, `test/browser_check.py`, CLAUDE.md, ROADMAP.md,
  README.md.
- Reused: `closedForm`, `rdForQ`, `sectionOf`, `marginBands`, `checkRange`,
  `point`, `emiResult`, `cornerMetrics`, `applyTol`, `optimizeParam`,
  `converters`, `vinLow`, `newId`.

---

# M3b plan: design optimizer

Status: **done (2026-11-05)**. Part A (equation audit) ran first; its
verdict table is `docs/equations.md`.

Progress (2026-11-05):
- Commits: audit and references `46ad66b`, `peakH` and EMI prep `698b425`,
  state `006ef86`, engine `a6277ea`, UI `aedb1c8`, then these docs.
- Gates: 518 Vitest passed (3 skipped, the LTspice cases), both builds,
  browser check 394 passed / 0 failed, lint, prettier and knip clean.
  Parity unchanged.
- Audit: no engine equation is wrong. Erickson's own numbers (Table I,
  eqs. 26-30, Rd-Cd at n = 4) pass through the engine. The app-note rule
  "Rd = Z0, Cd = 4C" (SNVA538, Flex AN 323, SLVAFE0 with 5C) is not the
  optimum; Flex AN 323 eq. 2 puts η on the wrong side of |Rn|.
- Deviations from the plan text below:
  - Each stage has its own damping factor g (one shared g left stage 1
    over-damped, and the E-series result beat the continuous one).
  - The compass search has diagonal moves along L·C = const: with a
    binding attenuation target, less L needs more C at the same time. Moves
    stop at the range bounds; results are cached.
  - Inside the search Nyquist is skipped when margin ≥ k + 0.1 > 0 (it can
    fail only where |Zout| > |Rn|); the result gets the full check.
  - `peaksZH` finds the |Zout| and |H| peaks from one grid scan.
  - Brute-force ground truth is a 10 × 10 exact grid (a 200 × 200 grid
    takes minutes), plus the loss test with L free down to 0.1 µH and the
    ±1 E-series neighbours.
  - Timing (Node): D1 1 stage 1.3-1.5 s, D4 2 stages EMI 2.9 s, 2-stage
    preset dB 3.8 s; browser on D1 0.3 s.

## Context

ROADMAP M3b: for a chosen goal, propose the E-series design with the lowest
value of that goal that meets margin k, the attenuation target and the Q
window. M3a proposes one design that meets the targets; it does not
minimize anything. The user asked to check the report definitions and the
engine equations against outside sources first (Part A).

## Decisions (user, 2026-11-05)

- L and C both free per stage, inside ranges (default: the part in that
  role ×0.1…×10, clipped to the TYPES limits).
- DCR follows L: DCR = ρ·L, ρ = dcr/L of the old inductor in that role (one
  footprint, fixed winding window). Datasheets: XAL7070 DCR ∝ L^1.01 above
  1 µH, SRP7028A ∝ L^0.91. M3a keeps its fixed DCR.
- Goal "size" is deferred to M8 (parts library). Goals: least Cd, least
  total C, least DC loss.
- Q window (NP-DR-26004 §4) as exact checks: Qstab → margin ≥ k; Qloss →
  DC loss ≤ ε %; Qpeak → max|Hopen| ≤ Qpeak.
- References are saved in `references/` (index `references/README.md`); the
  Erickson IEEE paper stays local (`.gitignore`).

## State (`asst`; `clampAsst()`, `adopt.ts`, `adopt.test.ts`)

- `goal`: 'meet' (M3a, default) | 'cd' | 'ctot' | 'loss'.
- `qPeak`: H gain-peak limit as a ratio, default 2.5 (about 8 dB); 0 = off.
- `eps`: DC loss limit, % of bus Pout, default 1; 0 = off.
- `rng: [StageRng, StageRng]`, `StageRng = { lMin, lMax, cMin, cMax }`;
  0 = auto.
- `allForms`: try all four damping forms per stage (default off). Goal
  'cd' fixes the form to rc.

## Definitions

- Goals: Cd = ΣCd of rc stages; total C = Σ(C + Cd); DC loss = I²·ΣDCR_i,
  I = iBus(vinLow, full), DCR_i = ρ_i·L_i (+ ρ_i·Ld_i for RLser), in % of
  pBus(full). Rsrc is not counted.
- Constraints at nominal: attenuation or EMI target, margin ≥ k and
  Nyquist, max|Hopen| ≤ qPeak over [checkRange lo, max(fcheck, fa)], DC loss
  ≤ eps, every value in range. Corners are shown, not designed for.
- Q window per stage, shown for reading: Qstab = Zmax/Z0, Qpeak,
  Qloss = Z0/(ε·Vin²/Pin).

## Algorithm (`engine/optimize.ts`, pure)

1. Coarse log grid over each stage's L and C (1 stage 24 × 24, 2 stages
   8⁴); per point and form: closed-form least damping (peak target
   g·Zmax/Z0, g = 1), exact attenuation or EMI, goal. Keep the best 4.
2. Exact polish per kept point: bisection on g for margin ≥ k + 0.1 dB,
   Nyquist and H peak; compass search in log L, log C (×1.26 down to
   ×1.01) lowering the goal with every exact check holding.
3. E-series: `roundE`, then a goal descent (one step per part, keep the
   best passing move). Best rounded result over the 4 points wins.
4. EMI speed-up: `emiPrep`/`emiMarginOf` in `emi.ts`, equal to
   `emiResult`'s worst margin (test).
5. Output: M3a `Proposal` plus goal value, Q window numbers, H peak, DC
   loss and the binding constraints.
6. `peakH` in `peak.ts` (as `peakZout`, on |Hopen|).

Runs in `workers/optimize.worker.ts` with progress and cancel; target
< 3 s for D4, 2 stages, EMI.

## UI

Assistant card: a "Goal" select (Meet the targets | Least Cd | Least total
C | Least DC loss). Other goals show L/C ranges per stage, Qpeak, ε and
"Try every damping form", and an Optimize button. Result as M3a plus goal,
Q window line and binding constraints; Apply as today.

## Ground truth and tests

No report optimizes. Tests: a 200 × 200 brute-force grid on D1 finds no
feasible design more than 1 % below the optimizer per goal; ±2 E-series
steps per part find no better passing design; `emiMarginOf` equals
`emiResult`; `peakH` finds a narrow peak; browser check on D1 goal 'cd'.

## Steps (commit on `main` after each; no push without asking)

0. This section; `docs/equations.md`; references saved.
1. Part A: comments citing [E99] eq. numbers, the `cdForRd` label, [E99]
   number tests (Table I, eqs. 26-30, n = 4 Rd-Cd example).
2. `peakH`; `emiPrep`/`emiMarginOf`.
3. State fields.
4. `engine/optimize.ts` + tests.
5. Worker and UI; screenshots.
6. Browser check and docs.
