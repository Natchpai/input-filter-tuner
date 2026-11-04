# M2 plan: conducted EMI prediction

Status: **done (2026-11-04)**, except the user's check of the limit
tables. Written 2026-11-04.

M2 notes:
- The LISN is modelled by the nominal impedance the standards define,
  (jωL + R) ∥ 50 Ω, not by component values. No public source gave the AN
  schematics in readable form. The receiver reads the voltage at the AN
  port. This replaces the `Zc + 50 Ω` branch in the definitions below.
- RBW: harmonics within ±RBW/2 of a harmonic add in amplitude. So the sum
  starts when the spacing N·fsw is at most RBW/2, not RBW.
- An exact null of sin(nπD) (D = 0.25 on D1) returned about 1e-17 A, which
  showed as −275 dBµV and got judged. `harmonicAmp` now returns 0 there.
- `emiResult` takes under 5 ms on every preset, so it runs in the page's
  `useMemo` with no worker.
- With CISPR 25 class 5, every single-stage preset fails in MW by 46 to
  88 dB. Pi/CLC, the 2-stage LC and D6 pass. The no-filter case is the bare
  trapezoid into the AN, so "needed" counts the work of every filter part,
  including the converter's own input capacitors.
- The report gets section 4 "Conducted EMI" and `fig_emi.svg`. Figures,
  Notes and Method move to 5, 6 and 7. No new front-matter keys.
- Limit sources are weak: one third-party site for CISPR 25, a glossary
  page and search snippets for CISPR 32. All are in
  `references/emi-limits.md`, marked ASSUMED.

## Context

Today the tool shows the attenuation at fsw and one ripple harmonic
(`metrics().ripple`, `engine/metrics.ts:164-175`). A filter exists to pass
conducted emissions, so M2 predicts the spectrum at the LISN against CISPR
limit lines. It answers "does it pass, and by how much", per band, with the
worst harmonic and its margin (ROADMAP M2 "Done when").

## Decisions (user, 2026-11-04)

- **Limit tables:** Claude collects CISPR 25 (class 1-5, conducted voltage
  method) and CISPR 32 (class A/B) limits from public app notes. Each row
  cites its source in code and in `references/emi-limits.md`. The user
  checks them against their copy of the standards before M2 is marked done.
- **LISN follows the standard:** CISPR 25 limits use the 5 µH / 50 Ω AN,
  CISPR 32 limits use the 50 µH / 50 Ω V-network (CISPR 16-1-2). A
  "lines" setting picks 1 AN (return grounded locally, default, worse case)
  or 2 ANs (loop sees 2·Zlisn).

## Facts this plan rests on (checked 2026-11-04)

- No design report has EMI content: no LISN, CISPR, dBµV or harmonic series
  (searched all of `document-archive/documents`). There is no report ground
  truth for M2. Checks come from closed forms, an independent DFT, the
  reports' Iac rms, and the cited limit tables.
- Reports use Iac,rms = Io·√(D(1−D)): NP-DR-26003 report.md:110 (2.0 A,
  D 0.42, 0.99 A rms); NP-DR-26001 :137 (3.61 A rms). LQRx 02 :60-71 has 0 A
  ripple at 24 V with 2 phases (D = 0.5).
- `metrics()` already has the ideal pulse model: D = vout/(vinNom·η),
  Io = pout/vout, N phases, one harmonic `ih = 2·Io·|sin(NπD)|/(Nπ)` at
  N·fsw, and `iacRms` for all harmonics (`metrics.ts:165-175`). No rise time.
- Converter current to source current is `Hopen = 1/(A + Zs·C)` from
  `abcd()` (`ladder.ts:73-91`, `point()` at `:115-136`). `point()` builds
  `Zs = Rsrc + jωLsrc` itself, so a LISN needs `abcd()` with its own Zs.
- `corners()` / `atCorner()` (`engine/oppoint.ts:69`, `:114`) give a design
  copy with vinNom = corner Vin and curves resolved, so D per corner comes
  for free. `atCorner` keeps `pout` at full power.
- New tab = `TabKey` (`model.ts:100`), `TABS` (`plots/traces.ts:22`),
  `TAB_KEYS` (`state/adopt.ts:20`), a `buildPlot` branch.
- `parity.test.ts` walks the fixture's keys, so a new top-level state field
  needs no skip; only new block fields do. No new block field in M2.
- Default `plot.fmax` is 100 MHz; CISPR 25 goes to 108 MHz. The EMI
  harmonics use their own frequency list, not the plot grid.

## Definitions (add to CLAUDE.md "Definitions")

- **Source current.** Each phase draws a trapezoid of height Io/N, width D·T
  (at 50 % points), equal rise and fall time tr. N phases are shifted by
  T/N. Harmonic n of fsw, peak amplitude:
  `c_n = 2·(Io/N)·|sin(nπD)|/(nπ) · |sinc(nπ·tr·fsw)|`, summed over phases
  (only n = multiples of N survive, times N). With tr = 0 and n = N this is
  `metrics().ripple.ih`. The inductor ripple slope on the pulse top is
  ignored, as in the reports.
- **LISN.** Seen from the filter input: `Zl = Zline ∥ (Zc + 50 Ω)`, where
  Zline is the AN inductor (supply side shorted by its large cap) and Zc the
  coupling cap to the 50 Ω receiver. Component values come from the
  standard's AN figure (collected with the limits). With 2 lines the loop
  sees 2·Zl and each receiver reads its own line. For EMI the LISN replaces
  Rsrc and Lsrc.
- **Reading.** `V_rx = I_port · Zl · 50/(50 + Zc)`, with
  `I_port = c_n / (A + Zl_loop·C)`. dBµV = 20·log10(|V_rx|/√2 / 1 µV).
- **Detectors.** Fixed frequency, no spread spectrum: one resolved harmonic
  reads the same on peak, QP and AV. So the prediction is compared with
  every limit given for a band; the AV limit usually decides. If harmonic
  spacing N·fsw is below the RBW (9 kHz up to 30 MHz, 120 kHz above), the
  harmonics in one RBW window add in amplitude (conservative) and the card
  says so.
- **Margin.** Per harmonic inside a band: limit − prediction − user margin.
  Band margin = the lowest over its harmonics and over the corners. Pass
  when every band margin ≥ 0. Harmonics outside every band are shown but
  not judged.
- **Corners.** EMI is evaluated at every Vin corner at full load (highest
  current, lowest L(I)). The worst corner per band is named.
- **Required attenuation.** `A_req(n) = V_bare(n) − (limit − margin)`, where
  V_bare is the reading with all filter blocks off (current source straight
  into the LISN). The corner-frequency hint for a 2nd-order LC
  (40 dB/dec): `f0 ≤ min_n f_n · 10^(−A_req(n)/40)`. This number feeds M3.

## Data model

New top-level `emi` object in `Design` (persisted, in undo, in links):
- `std: 'cispr25' | 'cispr32'` (default `cispr25`)
- `cls: 1..5` for CISPR 25, `'A' | 'B'` for CISPR 32 (default 5 / `'B'`)
- `lines: 1 | 2` (default 1)
- `tr: number` in s, edge time (default 10 ns; 0 allowed = ideal pulse)
- `margin: number` in dB (default 6)

`adopt()`: enums by whitelist, `tr` in [0, 1 µs], `margin` in [0, 40],
`cls` checked against `std`. `adopt.test.ts`: hostile values and a round
trip. `parity.test.ts` and the fixture are not touched.

## Engine (`engine/emi.ts` and `engine/emi-limits.ts`, new)

- `emi-limits.ts`: data only. Bands `{fLo, fHi, peak?, qp?, avg?}` per class,
  with log-f sloped segments for CISPR 32 class B 0.15-0.5 MHz. Each table
  has a source comment. `limitAt(std, cls, f)`, `bandsOf(std, cls)`.
- `lisn(std)`: component values; `zLisn(std, f)` and the receiver ratio.
- `harmonics(conv, tr, fMax)`: `[{n, f, c}]` from 150 kHz (lowest limit)
  to 30 MHz (CISPR 32) or 108 MHz (CISPR 25).
- `emiAt(st, emi)`: per harmonic `{f, c, vBare, vPred, limit, margin,
  aReq}` using `abcd()` with the LISN Zs.
- `emiResult(st)`: runs `emiAt` on `atCorner()` of each full-load Vin
  corner; returns per-band worst (corner, f, margin), overall pass, the
  worst harmonic, the f0 hint and the RBW warning.
- Cost: about 700 harmonics × 3 corners of `abcd()`. Measure; expect well
  under 20 ms, so `useMemo`, no worker. If over 50 ms, use
  `useDeferredValue` like the plots.

## UI (visual change: screenshots before finishing)

- **EMI card** on the Tuner page (after Corners, `index.tsx:111`): inputs
  for standard, class, lines, tr, margin. Summary line: PASS/FAIL, worst
  harmonic, its margin and corner. A table per band: band, limit (pk/QP/AV),
  worst f, prediction, margin, required attenuation, status token. The f0
  hint below. Scrolls inside the card at 390 px.
- **EMI tab** (`TabKey 'emi'`, "Conducted EMI"): dBµV vs log f, predicted
  harmonics as markers (worst corner), bare spectrum faint, limit lines as
  steps per band (peak solid, AV dashed), a margin line (limit − margin).
  Second y-trace or toggle: required attenuation in dB. Colours from
  `--chart-*` / `--status-*` via `plots/theme-colors.ts`.
- Existing `metrics().ripple` and its report rows stay as they are.

## Export

- `export/report.ts`: new section "Conducted EMI" (standard, class, LISN,
  lines, tr, margin, per-band table, verdict, f0 hint) and figure `emi` in
  `REPORT_FIGURES` / `CAPTIONS` / `PLOT_FIGS` (`report-zip.ts:14`). No new
  front-matter keys.
- SPICE netlist: no change in M2.

## Tests

Engine (`engine/emi.test.ts`):
1. tr = 0, harmonic N equals `metrics().ripple.ih` on every preset.
2. Parseval: Σ c_n²/2 over n ≤ 2·10^5 equals `iacRms²` within 0.5 %; the
   NP-DR-26003 case (2.0 A, D 0.42) gives 0.99 A rms (report :110).
3. Interleave: N = 2 leaves only even n; LQRx 02 at 24 V (D 0.5) gives a
   zero 400 kHz line (report :60-71).
4. Trapezoid vs an independent DFT of a sampled waveform (D 0.3, tr 20 ns,
   fsw 400 kHz): every harmonic to 108 MHz within 0.1 dB where c_n is above
   −100 dB.
5. LISN: |Zl| at chosen frequencies matches the standard's nominal
   impedance points (from the collected source); tends to 50 Ω at high f.
6. Transfer: one series L + shunt C against the hand formula
   `Zc/(Zc + ZL + Zl)`; with the LISN replaced by Rsrc/Lsrc, `I_port/c_n`
   equals `|Hopen|` from `point()`.
7. Limits: `limitAt` at band edges and inside the sloped segment matches
   the cited table; outside every band returns null.
8. Required attenuation: bare LC case gives A_req consistent with the f0
   hint (40 dB/dec); a design that passes has A_req ≤ its own attenuation.
9. Corners: worst band margin is the min over Vin corners; a falling C(V)
   curve lowers margin at Vin max.

`adopt.test.ts`: `emi` field cases. Browser (`test/browser_check.py`): EMI
card shows on every preset with a verdict; changing the class changes the
verdict text; the EMI tab draws; a `#d=` link and reload keep `emi`.

## Order of work

1. Copy this plan to `docs/M2-plan.md`. Collect CISPR 25 / CISPR 32 limit
   tables and AN component values from public app notes via a
   `web-research` agent; write `references/emi-limits.md` with sources.
   Mark them ASSUMED until the user checks.
2. Engine: `emi-limits.ts`, `emi.ts`, tests 1-9.
3. Model `emi`, defaults, `adopt()` and its tests.
4. UI: EMI card, EMI tab. Screenshots at 1440 and 390 px, dark and light, in
   `%TEMP%\filter-shots`; show the user.
5. Report section and figure, report test.
6. Browser checks.
7. Docs: README features, CLAUDE.md definitions (EMI block above), ROADMAP
   ticks, M2 notes in `docs/M2-plan.md`.
8. Run every "Done means" command and report pass/fail counts.

## Verification / done when

- For a chosen standard and class, the card shows pass or fail per band
  with the worst harmonic, its corner and margin.
- Tests 1-9 pass; `metrics()` numbers, `parity.test.ts` and the fixture are
  unchanged.
- All CLAUDE.md "Done means" commands pass:
  `npm test`, `npm run build && npm run build:single`,
  `python -I test/browser_check.py`, `npm run lint`,
  `npx prettier --check .`, `npm run knip`.
- Open for the user: check the limit tables and LISN values in
  `references/emi-limits.md` against the standards. Until then M2 limits
  are ASSUMED, not VERIFIED.
