# M6 plan: workflow and reports

Status: **planned, waiting for approval to start code.** Written 2026-11-04.
The user moved M6 ahead of M1a. M1a (`docs/M1-plan.md`) comes after M6.

## Decisions (user, 2026-11-04)

- **Snapshots and named designs are merged.** One saved-designs list in
  localStorage. Each entry has Load, Rename, Delete and an "overlay" toggle.
  The Snapshot button saves the current design as S1, S2... with the overlay
  on. Overlays are recomputed from the saved design, so they survive reloads.
  A compare table shows the current design against one saved design.
- **Report export is a zip** with `report.md` (front matter keys as in the
  NP-DR reports) and `fig_*.svg` in light colours, ready for
  `document-archive`. The user's own pipeline makes the PDF. Adds `fflate`.
- **SPICE export is a `.cir` netlist only** (no `.asc`).
- **Extras in M6:** plot image export (SVG/PNG) and a free-text design notes
  field. Nothing else.

## Facts this plan rests on (checked 2026-11-04)

- `state/reducer.ts:11-21`: pure reducer, actions `replace`, `conv`,
  `source`, `plot`, `param`, `patch`, `move`, `dup`, `remove`, `add`.
- `state/store.ts:37-47`: `dispatch` runs the reducer, `set()` saves the whole
  design to localStorage on every change (`persist.ts:9-15`, key
  `input-filter-tuner-v1`). No debounce.
- `components/value-row.tsx:130-134`: the range slider dispatches on every
  input event. Text commits on blur or Enter; arrow keys commit each press.
- `plot` actions (tab, fmin, tol, load...) change `st.plot`, which is part of
  the saved design.
- Snapshots (`store.ts:9-17`, `plots/traces.ts:61-71`, `196-203`) hold curve
  arrays in memory only, with no count limit. Buttons `#bSnap`, `#bClrSnap`
  (`components/toolbar.tsx:110-128`). `browser_check.py:191-205` expects the
  text "Snapshot (1)" and that snapshots survive a route change.
- No Ctrl+Z handler exists. Ctrl+K (command menu) and Ctrl+B (sidebar) are
  taken.
- Schematic (`components/schematic.tsx:491-506`) is inline SVG styled by
  Tailwind classes on CSS variables. A standalone SVG needs the computed
  colours inlined. No `foreignObject`, no `<defs>`.
- Plotly is `plotly.js-basic-dist-min` via dynamic import
  (`plots/plotly-chart.tsx:6-9`). `toImage` is not used yet. Colours come from
  `readColors()` (`plots/theme-colors.ts:17-32`).
- `download(name, text, type)` (`state/persist.ts:71-81`) is text only.
- `zBlock` topologies (`engine/ladder.ts:19-50`):
  - ind: (dcr + jωL) ∥ Cp, then damping: `R` = ∥ dR; `RLpar` = ∥ (dR + jω·dL);
    `RLser` = + (dR ∥ jω·dL).
  - bead2: rdc + (jω·lb ∥ rb). bead4: rs + (jω·lb ∥ rp ∥ cb).
  - res: r + jω·l. cap: (esr + jω·esl + 1/(jω·Ceff))/n, Ceff with derate.
  - rc: rd + esr + jω·esl + 1/(jω·cd).
  - Source Rs + jω·Ls in series at the input. Load for H: open, Rn at vinNom,
    or `plot.rload`. Zout is source-shorted.
- NP-DR report front matter (NP-DR-26004 report.md:1-14): title, subtitle,
  short_title, author, doc_no, date, revision, kicker, specs, note,
  subscripts. Figures are `![caption](fig_x.svg){width=92%}`.

## Parity rule for new fields

`parity.test.ts:73-75` compares keys exactly. M6 adds a skip list of new
optional fields (here `notes`); every legacy key and number is still
compared, and `legacy-presets.json` is not touched. M1a adds its fields to the
same list.

## 1. Undo and redo (S)

- `state/history.ts` (new, pure): `{past, future}` of designs, at most 100
  steps.
  - A new action pushes the previous design to `past` and clears `future`.
  - **Grouping:** an action with the same key as the last one (type + block
    id + field, e.g. `param:C1:c`) within 800 ms joins the last step. One
    slider drag or a run of arrow keys is one undo step. The clock is passed
    in, so tests are exact.
  - A `plot` patch that changes only `tab` or `sweepId` is not recorded, and
    undo/redo keep the current tab.
  - `replace` (preset, Load JSON, load a saved design) is recorded, so a
    wrong preset click can be undone.
- Store: `undo()`, `redo()`, `canUndo`, `canRedo`. History is in memory only.
- UI: Undo and Redo icon buttons in the toolbar (`#bUndo`, `#bRedo`),
  disabled when empty, with the shortcut in the tooltip.
- Keys: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and Ctrl+Y redo. Skipped while the
  focus is in a text input, textarea or select, so the browser's own text
  undo still works there.
- Tests (`history.test.ts`): grouping inside and outside 800 ms, different
  keys split, cap at 100, redo cleared by a new action, tab-only patch not
  recorded, `replace` undone.

## 2. Saved designs, overlays and compare (S to M)

- `state/library.ts` (new): localStorage key `input-filter-tuner-designs-v1`,
  `{v: 1, items: [{id, name, savedAt, overlay, design}]}`.
  - Every item's design goes through `adopt()` on read. Bad items are dropped.
  - At most 30 items; names cut to 80 characters. A quota error shows a toast
    and keeps the old list.
- Snapshot button: saves the current design as `S<n>: <peak>, <margin>` with
  overlay on. The label stays "Snapshot (n)", n = overlays shown, so the
  browser check keeps working. "Clear snapshots" deletes the auto S entries
  and hides all overlays.
- Overlays: the grey curves are computed from each overlaid design with the
  existing sweep, memoised per item, so they cost nothing while you edit.
  The in-memory `Snapshot` arrays go away.
- "Designs" card on the Tuner page, below Results:
  - Save as (name), and the list: name, date, peak, margin, overlay toggle,
    Load, Rename, Delete.
  - Load is one undoable `replace`.
  - Compare: pick one saved design. A table of current vs saved: peak, margin,
    Q, Z0, f0, attenuation at fsw, DC loss, plus every changed part value
    (matched by block name).
- Design notes: `Design.notes?: string`, at most 2000 characters, read by
  `adopt()` with `String().slice`, rendered as React text. A textarea in the
  Designs card, committed on blur as one `notes` action (one undo step).
  Shown in the saved list and copied into the report.
- Tests: `library.test.ts` (hostile storage: not JSON, wrong shape, bad
  designs, 1000 items, long names), `adopt.test.ts` case for `notes`.

## 3. SPICE netlist export (S)

- `export/netlist.ts` (new, pure, DOM-free): design to an element list
  `{name, kind: R|L|C|I|V, a, b, value}`, then to text.
- One `.cir` with two copies of the filter:
  - `h_*`: V source `AC 1` with Rs and Ls, load as set in the plot settings.
    V(h_out) is H.
  - `z_*`: source shorted (Rs and Ls kept), 1 A AC current into the
    converter node. V(z_out) is Zout.
- Mapping follows `zBlock` exactly: n parallel caps become one C of n·Ceff
  with esr/n and esl/n; derate is applied; zero-valued series R or L merge the
  nodes; zero Cp is left out.
- The converter as Rn is a negative resistor (LTspice and ngspice accept
  it). Each output node gets 1 GΩ to ground so no node floats.
- `.ac dec 200 fmin fmax`, `.meas AC zpk MAX mag(V(z_out))`, header comments
  with the design name, date, load choice and the `#d=` link.
- Toolbar button "Export SPICE" (`#bSpice`).
- Test (`netlist.test.ts`): parse the generated text back, solve it with a
  small complex nodal solver in the test, and compare |Zout| and H with the
  engine at 20 frequencies for all 14 presets, relative error under 1e-6.
  This checks every block topology and the text format.
- LTspice itself is not run in CI. One manual check in LTspice on D4 is
  `NOT_VERIFIED` until the user does it.

## 4. Figure export and plot images (S)

- `export/svg.ts` (new):
  - `schematicSvg(el, colors)`: clone the schematic SVG, inline the computed
    stroke, fill and font of each element, drop the hit rects. Light colours
    by default.
  - `plotImage(figure, format, w, h)`: `Plotly.toImage` with the figure built
    by `buildPlot` using the light palette (`readColors` from an element
    forced to the light theme).
- Plot card: "SVG" and "PNG" download buttons for the current tab.
- Browser check: both downloads happen and are non-empty; the SVG has no
  `var(--` left in it.

## 5. Design report zip (M)

- Dependency: `fflate` 0.8.2 (`zipSync`, about 8 KB).
- `export/report.ts` (new, pure): design + metrics + options to the
  `report.md` text.
  - Front matter: title, subtitle, short_title, author, doc_no, date,
    revision, kicker ("Input Filter Design Notes"), specs
    (`Input = 12 V, 10 W | fsw = 1.1 MHz | Filter = ...`), note. Every value
    is quoted and escaped for YAML.
  - Body: 1 Inputs (converter, source), 2 Parts (one table per block, all
    values), 3 Results (peak, margin and Middlebrook pass/fail, Q, Z0, f0,
    attenuation, ripple, DC loss), 4 Figures, 5 Notes (design notes), 6
    Method (Rn flat up to fcheck, Zout with the source shorted, Q series
    form), and a line with the tool URL and the `#d=` link to reopen the
    design.
  - Figures: `fig_schematic.svg`, `fig_zout.svg`, `fig_xfer.svg`,
    `fig_zin.svg`.
- Dialog: author, doc no, date (today), revision. The author is remembered in
  localStorage for this browser.
- Zip layout: `<doc_no or design name>/report.md` and the figures.
- Before coding this step, read the archive's report build script once and
  match its required front matter keys.
- Tests: `report.test.ts` (keys present, YAML escaping of quotes and colons,
  margin and peak in the text equal the metrics), browser check (download,
  unzip with Python `zipfile`, files present, D4 report contains "26.8 dB").

## Order of work and commits

Branch `feat/m6-workflow`, one commit per step, PR at the end (git actions
need the usual approvals).

1. Undo/redo.
2. Saved designs, overlays, compare, notes (parity skip list here).
3. SPICE netlist.
4. SVG helpers and plot image export.
5. Report zip.
6. Browser checks for every step, screenshots at 1440 px and 390 px, dark and
   light, in `%TEMP%\filter-shots`; README feature list, CLAUDE.md (new
   files, skip-list rule), ROADMAP ticks. Run every "Done means" command and
   report the counts.

## Done when

- A slider drag undoes in one step; a preset change can be undone; Ctrl+Z
  works outside text fields.
- Saved designs and their overlays survive a reload; compare shows the
  deltas.
- The netlist matches the engine within 1e-6 on all 14 presets in Vitest.
- The report zip for D4 has `report.md` and four SVGs, with the right
  numbers, and the plot SVG/PNG buttons work.
- All CLAUDE.md "Done means" checks pass; parity passes with the fixture
  unchanged.
