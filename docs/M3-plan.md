# M3 plan: design assistant

Status: **in progress (2026-11-04)**. Scope: M3a (auto-design, E-series
rounding, sensitivity table). M3b (multi-goal optimizer) is planned after
M3a ships.

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
