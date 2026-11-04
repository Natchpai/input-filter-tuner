# M5 plan: several converters on one bus

Status: **in progress (2026-11-04)**. Scope: only the ROADMAP M5 item "Several
converters on one bus". The frequency-dependent Zin and the GMPM/ESAC
criteria are not part of this plan.

M5 notes:
- Ground truth (step 1, 2026-11-04): no report has several converters on
  one bus. LQRx 02 is one 2-phase interleaved buck (phases = 2 covers it).
  LQRx 03 has two LMR54410 bucks, but each has its own LC filter.
  NP-DR-26001/3/4 and AOH-DR-26006 have one converter. So, like EMI and
  M4, there is no report ground truth; the equivalence tests and LTspice
  carry it.
- `parity.test.ts` walks only the fixture's keys (lines 69-78), so the new
  top-level `loads` key needs no skip entry.

Progress (2026-11-04):
- Done, committed: step 0 plan (`23e2b79`), step 1 ground truth (above),
  step 2 state (`515b2d4`), steps 3-4 bus engine and bands (`70b4b54`),
  step 5 EMI/ripple/load step (`54b1adf`), step 6 UI (`bfb6996`).
  Gates at `bfb6996`: 380 Vitest passed (2 skipped), browser check 304
  passed / 0 failed, lint, prettier and knip clean. Parity unchanged.
- Deviations from the plan text below:
  - The type is `BusConv`, not `Load` (`transient.ts` already has `Load`).
  - Extra items beyond 5 are dropped silently, like blocks (no warning).
  - Reducer: `loadSet` takes a patch (`{id, patch}`), not `{id, k, v}`.
  - `rnOf` and `vinLow` moved from `ladder.ts` to `engine/bus.ts`.
  - `Corner.pLoad` stays: it is now the bus total; EMI picks full-load
    corners with `pLoad === pBus(st, 'full')`.
  - Margin logic is one function, `marginBands()` in `metrics.ts`, used by
    `metrics()` and `tolerance.ts` `evalCase`. `metrics()` returns
    `bands` and `limitBand`; `ripple` has `per` and `worst`.
  - Converter fields live in `components/fields.ts` (lint: settings.tsx
    may export components only). Extra converter card:
    `components/conv-card.tsx`, ids `conv-<id>`, inputs `ld-<id>-<key>`.
  - With B's crossover below f0, the low band can still limit (|Zout| at
    its top edge); the test says so (D1 Rd-Cd: 23.8 dB, not 26.8 dB).
- Next: step 7 (export), then step 8 (docs). Step 7 starts by reading
  `export/report.ts` and `export/netlist.ts` in full; `netlist.ts` builds
  corners by hand (`pLoad: cv.pout`, `B_t_conv` source at line ~240) and
  `report.ts` prints the `conv` table (lines ~238-293) and Rn/fcheck prose
  (~352). `export/ltspice.test.ts` runs only when `LTSPICE` is set.

## Context

Today a design has one converter (`st.conv`). A real input filter often
feeds several converters on one bus (for example a 5 V and a 3.3 V buck),
each with its own power, efficiency, switching frequency, phase count and
loop crossover. The filter must be stable against all of them together and
must filter all their ripple.

With a flat Rn, N converters at one Vin act like one converter with
Σ P_i/η_i for the stability check. The parts that really change are:
- each converter's Rn is valid only up to its own crossover (`fcheck`);
- EMI and ripple come from several spectra (different fsw, N, D);
- the load step is the sum of several constant-power loads.

## Decisions (user, 2026-11-04)

- **Data model:** `conv` stays as it is (bus fields and converter 1). A new
  `loads: Load[]` list holds converters 2 to 6. Old links, saved designs,
  presets and the legacy fixture keep their shape; no parity change.
- **fcheck per converter, stepwise:** below its `fcheck` a converter counts
  in the parallel |Rn|; above it, it drops out. The limit line becomes a
  staircase; margin and Nyquist use the |Rn| of each band.
- **Load step:** every converter steps from its P light to its P full at
  t = 0, together (worst case). One run per Vin, as today.
- **Same fsw:** harmonics at the same frequency (within RBW/2) add in
  amplitude, in phase (worst case), as harmonics already do today.

## Facts this plan rests on (checked 2026-11-04)

- `rnOf(conv, vin) = −vin²·η/P` (`engine/ladder.ts:98`); no frequency term.
- Margin = `db(|rn.min| / peak)` with `rn.min = rnOf(vinLow)`; the peak
  search and the Nyquist scan both run over `checkRange(st)` =
  `[min(fmin, 10), fcheck || fsw]` (`engine/metrics.ts:14-17, 131-160`).
  This is the only place `fcheck` enters the engine. `optimizeParam`,
  `sweepParam` and `tolerance.ts` `evalCase` use the same range.
- Input current for L(I): `i = p/(η·vin)` (`engine/oppoint.ts:86`);
  |Rn| at a corner always uses full power (`atCorner`, `oppoint.ts:119`).
- EMI: `dutyOf`, `harmonics(conv, …)` build one spectrum at multiples of
  N·fsw (`engine/emi.ts:26-86, 124`); full-load corners only (`emi.ts:194`);
  harmonics within RBW/2 already add in amplitude; dropout check
  `vout ≥ vin·η` (`emi.ts:247`).
- Load step: `cpl(P, η, 0.5·vin)` constant-power current
  (`engine/transient.ts:228-235, 715-749`); hot-plug runs with the
  converter open. Ripple: `harmonicSigned` through Hopen at Vin nom
  (`transient.ts:850-865`).
- Zin (`ladder.ts:134`) and the 'conv' plot load (`ladder.ts:103`) use a
  flat `rnOf(vinNom)` at every frequency.
- `parity.test.ts` walks only the fixture's keys (`conv.*` flat), so a new
  top-level `loads` key needs no skip entry. Check this when the field is
  added (the comment at `parity.test.ts:81-83` says so).

## Definitions (add to CLAUDE.md "Definitions")

- A **converter** is `conv` (converter 1, always on) or an item of `loads`
  with `on: true`. Bus fields stay in `conv`: Vin min/nom/max and k.
- **Bus Rn** at a frequency f and a Vin: the parallel of Rn_i =
  −Vin²·η_i/P_i over the converters with `fcheck_i ≥ f`, that is
  1/Rn = −Σ P_i/(η_i·Vin²). Above the highest `fcheck` the last band
  continues (display only). With one converter this is today's flat Rn.
- **Bands:** the check range is split at each distinct `fcheck_i`. In band
  j, |Rn_j| is flat. Margin = min over bands of db(|Rn_j| / peak |Zout| in
  band j). The Nyquist crossing at f is judged against |Rn| of f's band.
  The check range ends at the highest `fcheck`. The result names the band
  that limits.
- **Zin and the 'conv' H load** use the parallel of all converters at Vin
  nom at every frequency (flat), as today. Only the check, the limit line
  and Tm use the bands.
- **Corner:** light = every converter at its P light, full = every
  converter at its P full. Input current I = Σ P_i/(η_i·Vin).
- **EMI:** each converter gives its own trapezoid spectrum (its fsw, N, D,
  Io, the common edge time `emi.tr`). Lines within RBW/2 of each other add
  in amplitude, across converters too. Dropout is checked per converter.
- **Ripple (Results):** source ripple = rss over distinct frequencies of
  the amplitude sum at each frequency. Attenuation tile = the lowest
  attenuation at any converter's fr, with its name.
- **Time domain:** load step current Σ cpl(P_i, η_i, 0.5·Vin); all step
  together. Ripple waveform: sum of every converter's signed trapezoid
  series through Hopen, all in phase at t = 0, shown over 3 periods of the
  lowest fsw; p-p over that window. Step size from the highest fsw.

## Data model

- `Load = { id, name, on, pout, pLight, eta, vout, fsw, phases, fcheck }`
  in `engine/model.ts`; `Design.loads: Load[]`, default `[]`.
- At most 5 items (6 converters in all): `MAX_LOADS` in `model.ts`, used by
  `adopt()`, the reducer and the add button (BUGLOG lesson 3: one limit).
- `adopt()`: `loads` must be an array; each item through the same field
  rules as `conv` (pos fields, η 0.3 to 1, phases 1 to 8, pLight ≤ pout),
  `name` string ≤ 40 chars, `on` boolean, `id` string or a new id. Extra
  items dropped with a warning. Cases in `adopt.test.ts`.
- Reducer: `loadAdd {load}`, `loadSet {id, k, v}`, `loadDel {id}`,
  `loadMove {id, dir}`, `loadDup {id, newId}`. New ids from `newId()` in
  the handler (pure reducer rule). `history.ts` `keyOf` joins
  `loadSet` by id + key.
- `lib/compare.ts`: rows for converter count and total P.

## Engine

- `engine/bus.ts` (new, pure):
  - `converters(st)`: `[conv, ...loads.filter(on)]` as one shape.
  - `rnBus(st, vin, f?)`: parallel Rn, all converters, or only those with
    `fcheck ≥ f`.
  - `bands(st, vin)`: `[{ fLo, fHi, rn, names }]` over the check range.
  - `iBus(st, vin, load: 'light' | 'full')`: Σ P_i/(η_i·vin).
- `checkRange` uses the highest `fcheck || fsw`.
- `metrics()`: margin, peak and Nyquist per band; `rn.min/nom/max` = bus Rn
  of the lowest band; new `limitBand` index. With `loads = []` every
  number is bit-identical (parity).
- `ladder.ts`: Zin, the 'conv' load and Tm use `rnBus`; Tm uses the band Rn.
- `oppoint.ts`: corner currents from `iBus`.
- `tolerance.ts` `evalCase`: same band margin (shared function, no copy).
- `emi.ts`: `harmonics` per converter, merged into one sorted list before
  the RBW sum; dropout list names the converter.
- `transient.ts`: load step with summed `cpl`; ripple wave summed; time
  scale from the highest fsw.
- `metrics().ripple`: per-converter `fr`, `ih`, attenuation, plus the
  combined source ripple and losses (sum of losses over frequencies).

## UI (visual change: screenshots before finishing)

- Converter card: title "Converter 1 (load) and bus"; a "+ Converter"
  button at its foot while fewer than 6.
- Each extra converter: a compact card under it (name, on, P, P light, η,
  Vout, fsw, phases, f check; move, duplicate, delete), same `ValueRow`.
- Schematic converter box: "3 converters · Rn = −x Ω at Vin min" (bus Rn of
  the lowest band); click focuses converter 1's P.
- Zout plot: |Rn| and |Rn|/k lines become staircases when `fcheck` differ.
- Results: margin tile names the limiting band when there are several
  ("band 10 Hz to 200 kHz, all 3"); All numbers lists each converter's
  Rn, fr, attenuation and Iin.
- Status strip and Corners: no change in layout.

## Export

- Report: converter table with one row per converter and a bus row; the
  margin sentence names the limiting band. Front-matter keys unchanged.
- SPICE netlist: 'conv' load = bus Rn at Vin nom; time-domain netlists get
  one behavioural source per converter.
- CSV: unchanged columns.

## Tests

- **Parity:** every preset with `loads = []` and with one extra converter
  `on: false` gives the same metrics, corners, EMI and transient results as
  today (bit-identical).
- **Equivalence:** two converters with P/2 each, same η, fsw, phases and
  fcheck give the same margin, Nyquist, corner currents, load step and
  EMI reading as one converter with P (in-phase amplitude sum), within
  1e-9 relative.
- **Bands:** an LC with a peak between fcheck_B and fcheck_A is judged
  against |Rn_A| only; a hand-computed margin per band. Fails before the
  change (BUGLOG rule: a check that fails first).
- **Nyquist:** a crossing above fcheck_B with Re(Zout) between |Rn_A∥B|
  and |Rn_A| is stable; below fcheck_B it is unstable.
- **EMI:** two converters at 400 kHz and 2.1 MHz give lines at both
  harmonic sets; same fsw lines add; dropout names the converter.
- **adopt:** junk `loads`, more than 5 items, pLight > pout, missing ids.
- **Browser check:** add a converter, the margin chip changes; turn it off,
  back to the old value; reload and a `#d=` link keep it; undo removes
  it; screenshots 1440/390, dark/light.
- **LTspice** (when `LTSPICE` is set): D1 Rd-Cd with two converters, load
  step V min within 1 %.

## Order of work

1. Ground truth check: look in LQRx `Reports/02_Power_State` for a bus
   with more than one converter. If found, make it a preset and a test
   case; if not, say so (like EMI and M4, no report ground truth).
2. `model.ts`, `defaults.ts`, `adopt.ts` + tests, reducer + history.
3. `engine/bus.ts` + equivalence and band tests (fail first).
4. `metrics`, `ladder`, `oppoint`, `tolerance` on the bands; parity green.
5. EMI, transient, ripple per converter + tests.
6. UI cards, schematic, plots, Results; screenshots.
7. Report, netlists, compare; LTspice check.
8. CLAUDE.md definitions, ROADMAP tick, plan notes.

## Done when

- All of the "Done means" commands pass; counts reported.
- One converter (and an extra one turned off) gives exactly today's
  numbers on all 14 presets.
- The result says which band limits the margin, with its converters.
- A design with several converters survives a link, a JSON file and a
  reload.
