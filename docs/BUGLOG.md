# Bug log

A running log of bugs found and fixed. Add a new entry at the top for each
bug hunt or fix. Read the "Lessons" list before changing the engine, state
or export code.

## Lessons (patterns that caused bugs)

1. **A view setting must never change a result.** The margin search
   followed the plot zoom (`checkRange` used `plot.fmax`), so zooming
   flipped the stability verdict. Engine ranges come from design values
   (`fcheck`), not from the plot.
2. **Do not assume inputs are typed in order.** `vinMin` was used as the
   lowest Vin; use `vinLow()`. The same applies to `pLight` vs `pout`:
   clamp where it is used, not only in `adopt()`.
3. **One set of limits for every entry point.** `adopt()` clamped values
   that the reducer and the input fields did not (EMI `tr`, block name
   length), so a reload changed what the user typed. When `adopt()` gets a
   limit, the reducer or input gets the same one (shared constant).
4. **A feature toggle must be honoured on every path that restores state.**
   EMI off hid the EMI tab in the reducer and `adopt()`, but undo/redo
   (`keepView`) still restored it. Check reducer, `adopt()`, undo/redo and
   the plot fallback together.
5. **Editable text must keep full precision.** The curve editor showed
   3 digits, and an edit saved the rounded points. Display precision is
   not storage precision.
6. **Escape text for the consumer that reads it.** Plotly decodes only a
   few entities (`&quot;` is not one; use `&#34;`). The archive's report
   builder reads `$$`, `![`, `|` and `>` at line start as markup, and splits
   `specs` on `|`. Check the consumer's parser, not just HTML rules.
7. **Never call `Number()` or `String()` on untrusted objects.** An object
   with a bad `toString` throws. Accept only number, string or boolean.
8. **Match by index, not by label.** Labels round (12 V and 12.001 V are
   both "12 V, full").
9. **Snap exact zeros.** `sin(nπD)` with D = 0.25 gave about 1e-17, shown
   as −275 dBµV and judged. Treat values below a tolerance as exactly 0.
10. **Clamp refine windows to the search range.** A golden-section window
    around a grid crossing ran past `fcheck`.
11. **Save what cannot be recovered.** A `#d=` link was cleared from the
    URL but not saved until the first edit. An unreadable saved list was
    overwritten by the next save; back it up first.
12. **Silent drops need a message.** An EMI corner with D ≥ 1 had all-zero
    harmonics and quietly passed. Report it (`dropout`).
13. **One sign convention per quantity.** "Attenuation" was negative in
    Results and positive in Corners. Attenuation is positive; |H| is a gain.
14. **Check a numeric step, do not trust a guess.** The time step from the
    resonance peaks missed an overdamped fast pole (2 % error). Halve the
    step until the result holds still.
15. **Do not report a number set by parts you do not model.** With no
    source L, the hot-plug inrush came from ps spikes through ESL and Cb and
    moved 25 % with the step. Report it only when a cable L limits it.
16. **A box can change size without a window resize.** Plotly's
    `responsive` follows only `window` resize events, so the sidebar toggle
    left the plot at its old width. Watch the element (ResizeObserver).
17. **One user action, one dispatch.** Set for Q sent `_q` and the value as
    two actions with different history keys, so it took two undos. Merge
    the fields into one `patch`.
18. **A hidden panel still runs.** Panels stay mounted; the Sensitivity
    table recomputed on every edit while another tab showed. Gate heavy
    work on the visible tab.
19. **Know why a search point failed before choosing the direction.** The
    assistant's f0 search went down when the start failed, but a part
    above its range needs a higher f0. Range limits and the target pull in
    opposite directions.
20. **A unit-carrying field means the same thing on both sides.** Apply
    copied a bank's per-part ESR onto a one-part bank of the whole C, so
    the bank ESR became n times larger.

21. **A coordinate search stalls on a binding product constraint.** With
    attenuation fixing L·C, less L needs more C in the same move; one axis
    at a time never improves the goal. Add the diagonal moves.
22. **Every limit of the final check is a limit of the search.** The
    optimizer's search left out the DC loss limit, so its best point
    failed after rounding. Use one feasibility test for both, and keep
    rounding inside the user's ranges too.

## Entries

### 2026-11-05: M3b optimizer, found by its own tests (not shipped)

- E-series rounding stepped outside the user's L and C ranges (C 0.39 µF
  below a 1 µF minimum), which also made the rounded goal beat the
  continuous one. `roundE` now takes an `allowed` test. Lesson 22.
- The search did not check the DC loss limit; D4 ended at 1.39 % for a
  1 % limit. Lesson 22.
- The loss goal stopped at C 82 µF of 100 µF allowed: the compass search
  had no diagonal move. Lesson 21.
- One damping factor shared by both stages left stage 1 over-damped; each
  stage now has its own.

### 2026-11-05: review of the newer code (23 fixes)

Three read-only reviews of the code added since 2026-11-04 (M3a assistant,
M5 bus, damping Set for Q, UX rework), each finding checked in the code.
Every fix has a test that failed on the old code.

- Engine, design assistant (`engine/design.ts`, `design.test.ts`):
  - Apply gave a multi-part bank n × its ESR and ESL (per-part values on a
    one-part bank). Now the bank values. Lesson 20.
  - A part above its range at the start made the f0 search go down only,
    so a reachable target was "cannot be met" with C = 25 mF; the
    unreachable fallback also kept out-of-range parts. Now the search
    starts at the lowest in-range scale above, and the margin polish
    checks the range too. Lesson 19.
  - The fixed L or C was snapped to its E-series; it is now kept as typed.
  - EMI target: dropout corners and "no line judged" now give a warning
    (Lesson 12).
  - A carried Cd ESR above the needed Rd was clamped silently; now warned.
    E-series moves that leave a part's range are skipped.
  - `clampAsst`: a bad value with the other Fix gave 1 nH; now the part
    default, as the UI's Fix switch gives.
- Engine, Nyquist (`engine/metrics.ts`, `engine.test.ts`): the grid was
  max(400, plot Points), so a view setting could change the verdict
  (Lesson 1). Now a fixed 800 points; `plot.n` left the tolerance and
  assistant run keys.
- Schematic: bus Rn used `vinMin`, not `vinLow` (Lesson 2).
- Damping UI (`components/block-card.tsx`, `lib/damping.ts`):
  - Set for Q made two undo steps (Lesson 17); `Infinity` or `1e400` was
    accepted as Q; the value was not clipped to its field (ESR could be
    133 Ω). Now one patch, finite Q only, clipped with a toast.
  - Set Rd, Ld clipped Ld at 10 mH but kept Rd for the unclipped Ld; Rd is
    now from the clipped Ld, with a toast giving the reached peak/Z0.
  - No LC section gave "Series Rd∥Ld cannot get the peak below 1.41·Z0";
    now "No LC section".
  - Rd and Ld limits are one shared `DAMP_LIM`.
- Value boxes (`components/value-row.tsx`, browser check):
  - Linear fields stored float noise (k 6 + 3 steps = 6.6000000000000005).
  - ArrowUp or the wheel dropped typed text and stepped from the old value.
  - Shift+wheel (deltaX in Windows browsers) did nothing; a touchpad
    stepped once per tiny event. Pixel deltas now add up to 50 px a step.
- Sensitivity ran on every edit while its tab was hidden (Lesson 18).
- State (`state/adopt.ts`, `state/persist.ts`):
  - `String(oe.cls)` threw on an object with a bad `toString` (Lesson 7).
  - `adopt()` clamped light load to Pout while the reducer kept it, so a
    reload changed it (Lesson 3). Now kept as typed; every use clamps it.
  - An unreadable main design was replaced by preset 1 and lost at the
    next save. It is copied to `input-filter-tuner-v1.bak` first, with a
    warning (Lesson 11).
- Report (`export/report.ts`, `report.test.ts`):
  - With several bands, the margin cell showed the all-converter |Rn| and
    limit line, not the limiting band's.
  - Note lines `\pagebreak` and `<!-- pagebreak -->` broke the page; `*`
    and `_` in names became bold, italic or subscripts. Now escaped.
- Time tab (`components/use-tran.ts`): after a worker error the old result
  stayed on screen at full opacity; it is dropped now, and a worker crash
  outside its try/catch sets an error instead of "Running…" forever. No
  test (hook with a worker): NOT_VERIFIED by a test.

Not fixed: `(@key)` in user text is read by the report builder as an
equation reference and has no escape; arrow keys snap the Ω fields S21 Z0
and R load to E24 (looks intended).

### 2026-11-04: Plotly error after a plot was purged

- One browser-check run logged "Cannot read properties of undefined
  (reading '_redrawFromAutoMarginCount')". `plotly.react()` goes on after
  it returns (auto-margin redraws); when the div is purged first (Notes
  round trip) Plotly reads the missing `_fullLayout`, and nothing caught
  the rejected promise. Since the two-pane layout, plots also draw inside
  hidden panels and areas, which may make the race more likely.
  `PlotlyChart` now drops that rejection when the div is gone or purged,
  and rethrows otherwise. It is a race: the next run passed (365/0), but
  the cause is NOT_VERIFIED by a repeatable test.

### 2026-11-04: plot kept its width when the sidebar toggled

- Opening or closing the sidebar changed the card width but not the plot.
  `PlotlyChart` now resizes on a ResizeObserver of its own div (commit
  `7cade94`). Browser check "sidebar toggle resizes the plot".

### 2026-11-04: time domain (M4), found while building

- Inrush with Lsrc = 0 changed 25 % with the step (D4, Pi). Now null
  unless the total source L > 0; a hot-plug cable (`tran.lCable`, default
  1 µH) gives every preset a value. Test "Rs-C, no cable L" in
  `engine/transient.test.ts`.
- An overdamped Rs-Ls-C missed its inrush peak by 2 %: no resonance peak
  set the step. Now `converge()` halves the step until the peaks agree.
  Test "overdamped Rs-Ls-C".
- The load-step plot thinning dropped the 0− sample, so the current seemed
  to ramp before the step. Each bucket now keeps its first and last sample
  and the lead-in point stays out of the thinning.

### 2026-11-04: review of engine, state and UI (23 fixes)

Found by three read-only reviews (engine; state and save/load; UI, plots
and export), each finding checked in the code before fixing. Details and
the test for each fix: `docs/bugfix-2026-11-04.md`. Commits `c46a1cd`,
`a75c3a0`, `5ec3148`, `831a202`, `622aa94`.

- Engine (7): check range followed the plot zoom; Vin order; pLight above
  pout; peak above fcheck; `primary()` gave up early; EMI dropout corners;
  EMI worst corner by label.
- State (9): undo left the EMI tab; EMI tr/margin not clamped; `adopt()`
  threw on objects and allowed fmax ∞; block names cut on reload; curve
  text rounded to 3 digits; "12,5 3,96" read as 12 and 53; saved list could
  be wiped; link lost on reload; compare missed Vout and light load.
- UI and export (7): `"` shown as `&quot;` in plots; `|` broke the report
  specs; note lines broke the report build; attenuation sign; tolerance
  marked stale by view settings; dialog figure count; report Zout figure
  without the worst corner.
- Not fixed (low value): grid miss for a zero/pole pair inside one grid
  step in `peakZout`; ZinOpen = NaN with no shunt part; no-op undo step
  from a quick on/off toggle.

### 2026-11-04: EMI exact nulls (M2)

`harmonicAmp` returned about 1e-17 A at exact nulls of sin(nπD) (D1,
D = 0.25), shown as −275 dBµV and judged. It now returns 0 there. Test
"D 0.25: every 4th harmonic is exactly zero" in `engine/emi.test.ts`.
