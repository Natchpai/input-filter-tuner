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

## Entries

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
