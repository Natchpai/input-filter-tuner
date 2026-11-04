# M1 plan: real part behaviour

Status: **M1a planned, waiting for approval to start code.** M1b is an
outline; plan it in detail when M1a is done. Written 2026-11-04.

## Decisions (user, 2026-11-04)

- **Split M1 in three.** M1a Operating point, M1b Tolerances. Measured |Z|
  import moves to the new M8 Part data, together with the parts library
  from M3. Reason: no report uses measured data, so there is no ground
  truth, and it needs a file parser and link-size limits.
- **Corners are Vin × load.** Vin min/nom/max × {light load, full load}.
  L comes from the load current, C from Vin, and |Rn| is always taken at
  full power and that Vin. This is how NP-DR-26004 checks the 0 A case
  (Lb 1.0 µH) against |Rn| at 10 W.
- **Parity ignores the new fields by name.** `parity.test.ts` keeps
  comparing every legacy key and number, and skips only the new M1 fields.
  `legacy-presets.json` is not touched.
- **C-vs-V data comes from Murata SimSurfing.** The user exports C vs DC
  bias as CSV. Until then the LQRx presets keep their static derate %.

## Facts this plan rests on (checked 2026-11-04)

- `conv` already has vinMin, vinNom, vinMax. The margin uses only
  `rn.min` with one fixed network (`engine/metrics.ts:133`).
- DC current is one value, `iin = pout/(eta*vinMin)` (`metrics.ts:156`).
  No node DC voltage exists.
- C derating is the static `derate` % in `effC` (`engine/types.ts:135`).
  No L depends on current.
- `zBlock(b, w, s)` takes a global `Scale {L, C}`, not per block
  (`engine/ladder.ts:19`). The tolerance curves (`plot.tol`, `dL`, `dC`)
  are plot-only, in `plots/curves.ts:61-69`, and never reach the margin.
- The D4 0.83 A case exists only as a test, via `withParam(..., 'lb', 0.8e-6)`
  (`engine/engine.test.ts:155-163`). D4 uses Vin 12 V, 10 W, eta 1, so
  iin = 0.833 A.
- `parity.test.ts:73-75` compares block keys exactly, so any new block
  field fails it.
- Report numbers for M1a tests:
  - NP-DR-26004 report.md:230-237. 0 A, Lb 1.0 µH: Q 2.26, peak 0.66 Ω,
    margin 26.8 dB. 0.83 A, Lb 0.8 µH: Q 2.02, peak 0.54 Ω, margin 28.5 dB,
    attenuation at fsw 54.6 dB. |Rn| at 10 W in both rows.
  - LQRx 02 report.md:144-146. Margin 21 dB at 24 V, 13 dB at 15 V
    (|Rn| 0.89 Ω), both at 240 W, with Cf derated −33 % at every Vin.
- No report has C-vs-V points, a Monte Carlo, or measured |Z| files.

## M1a. Operating point (M, about 2 to 3 days)

### Definitions (add to CLAUDE.md "Definitions")

- A corner is one Vin from {min, nom, max} and one load from
  {light, full}. Duplicate Vin values are merged (D1, D3, D4 have one Vin).
- At a corner: each MLCC with a curve uses C(Vin). Each inductor or bead
  with a curve uses L(I), with I = P_load/(eta·Vin). |Rn| = Vin²·eta/P_full.
- The DC drop in the filter is ignored for the bias voltage, as in the
  reports.
- A curve replaces the static `derate` % at the corners only. The nominal
  tiles keep the typed values and `derate`, so today's numbers do not move.
- Curves are linear interpolation between points, held flat beyond the
  first and last point. One point means a constant value.

### Data model

- `CapBlock.cv?: [V, C][]`: C per part against DC bias.
- `ind`, `bead2`, `bead4`: `li?: [A, H][]`: L (or Lb) against DC current.
- `conv.pLight?: number`: light-load power in W, default 0.
- All three are optional. When absent, behaviour is the same as today.
- The rc block's Cd gets no curve in M1a (usually electrolytic or polymer).

### Engine (`engine/oppoint.ts`, new)

- `interp(points, x)`: sorted, clamped linear interpolation.
- `corners(st)`: list of `{vin, pLoad, label}`.
- `atCorner(st, corner)`: a design copy with curved values resolved and
  vinMin = vinNom = vinMax = corner Vin. Then the existing `metrics()` gives
  the peak, margin, Q and attenuation at fsw for that corner with no change
  to the ladder code. The current at the corner is set by P_load, while
  |Rn| uses P_full; keep these two apart in the copy.
- `cornerMetrics(st)`: rows plus the worst row (lowest margin).
- Cost: up to 6 `metrics()` calls per change. Measure it; if it is over
  about 100 ms, run corners in `useDeferredValue` like the plots, and
  consider a worker in M1b.

### State and persistence

- `adopt()`: read `cv` and `li` as arrays of [x, y]. Each x finite ≥ 0,
  each y finite > 0. At most 64 points. Sort by x, drop duplicates and bad
  points; an empty result means no curve. `pLight` is a number ≥ 0.
- `adopt.test.ts`: hostile arrays (strings, NaN, nested, 10 000 points),
  limits, and a round trip of a design with curves.
- `parity.test.ts`: skip `cv`, `li` and `pLight` by name. Every other key
  and number is still compared.
- D4 preset: add `li: [[0, 1.0e-6], [0.83, 0.8e-6]]` on FB1, with a comment
  citing NP-DR-26004 report.md:200 ("about 0.8 µH at 0.83 A", an assumed
  typical value, not a datasheet value).
- LQRx 02 and 03 presets: add `cv` only after the SimSurfing data arrives.

### UI (visual change, show screenshots before finishing)

- Settings: a "Light load" power input next to Pout.
- Block card (cap): a collapsible "C vs DC bias" text box. One point per
  line, `12, 3.96u` or `12 V; 3.96 µF`, parsed with `parseSI`. Tabs and
  commas are accepted and header lines are skipped, so a SimSurfing CSV can
  be pasted. Below it: point count, errors per line, and C at each corner
  Vin.
- Block card (ind, bead2, bead4): the same for "L vs DC current", showing L
  at each corner current.
- Results: a new "Corners" card. A table with one row per corner: Vin,
  load, I, peak |Zout|, |Rn|, margin, Q, attenuation at fsw. The worst row
  is marked with a `--status-*` token. At 390 px the table scrolls inside
  the card.
- Zout tab: one dashed trace for the worst corner, only when a curve
  exists. Colour from `--chart-*`.

### Tests

Engine (`engine.test.ts` or a new `oppoint.test.ts`):
1. `interp`: unsorted input, clamping, one point, two equal x.
2. Invariance: no curves and pLight 0. The full-load corner at vinMin gives
   exactly `metrics(st).margin` and the same peak.
3. A one-point `cv` equal to c·(1 − derate) gives the same corner numbers as
   the static derate.
4. D4 with the `li` above (report NP-DR-26004:230-237):
   - light-load corner: margin 26.8 dB, Q 2.26, peak 0.66 Ω;
   - full-load corner: margin 28.5 dB, Q 2.02, peak 0.54 Ω, attenuation at
     fsw 54.6 dB;
   - the worst corner is light load.
   Use the same tolerances as the existing D4 checks.
5. LQRx 02 preset with no curve (report :144-146): margin 21 dB at the
   24 V full-load corner and 13 dB at 15 V.
6. A falling C-vs-V curve gives a lower C at Vin max than at Vin min.

Browser (`test/browser_check.py`):
- The Corners card shows for every preset; D4 shows two rows (one Vin, two
  loads).
- Pasting a curve into a cap's text box changes that cap's corner rows.
- A `#d=` link and a reload keep the curve.

### Order of work

1. Engine and its tests (steps 1 to 6 above).
2. Model fields, `adopt()`, adopt tests, parity skip list, D4 preset.
3. UI: settings, curve editors, Corners card, worst-corner trace.
4. Browser checks, then screenshots at 1440 px and 390 px, dark and light,
   in `%TEMP%\filter-shots`.
5. Docs: README feature list, CLAUDE.md definitions and the new-field rule
   (`adopt` line and parity skip list), ROADMAP ticks.
6. Run every "Done means" command in CLAUDE.md and report the counts.

### Done when

- D4 shows its margin at Lb 1.0 µH (0 A) and 0.8 µH (0.83 A) with no manual
  edit, and both match NP-DR-26004.
- Every MLCC with a curve is evaluated at the corner Vin.
- LQRx 02 shows 21 dB at 24 V and 13 dB at 15 V in the Corners card.
- All CLAUDE.md "Done means" checks pass; parity passes with the fixture
  unchanged.

## M1b. Tolerances (outline, plan in detail later)

- Per-part tolerance `tol?: number` (± %) on each block's main value. Which
  values (C, L, Lb, R, Rd, Cd) is decided at planning time.
- Worst case per corner: try every ± extreme when there are at most 8
  tolerances (256 cases, peak only), else use Monte Carlo only.
- Monte Carlo: N draws (default 1000), seeded PRNG so results repeat.
  Report worst, 1st percentile and median margin, with a histogram.
  Open: uniform within ±tol, or normal with tol = 3σ.
- Runs on a button. Use a Web Worker if one run takes over about 200 ms
  (the engine is DOM-free, so it can move).
- Open: whether the global tolerance curves (`plot.tol`, `dL`, `dC`) stay,
  or are driven by the per-part tolerances. Changing them touches
  `browser_check.py` and the parity skip list.
- Ground truth: NP-DR-26001 report.md:229-237, Rd 1.06 Ω fixed. Q is 0.71
  nominal, 0.84 at L −30 %, 0.55 at C 6 µF, 0.66 at both.
- Done when: the worst case and the Monte Carlo spread show per corner, and
  the NP-DR-26001 Q table is reproduced.

## User to-do before the LQRx curves

Export C vs DC bias from Murata SimSurfing as CSV for:
- GRM31CR71H475KA12 (4.7 µF 50 V 1206, LQRx 02, report :77)
- GRT32ER71H475KE01 (4.7 µF 50 V 1210, LQRx 02 Cf, report :109)
- the 4.7 µF 35 V 0805 in LQRx 03 (report :102; part number from the BOM)

Put them in `references/curves/`. M1a does not wait for them; they are
added to the presets when they arrive.
