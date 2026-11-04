# Input Filter Tuner

A browser tool for tuning DC-DC converter input filters. It shows the
circuit, Zout against the converter's Rn, H/S21, Zin and the Middlebrook check.
Vite + React + TypeScript, from the template
`D:\KiCAD\KiCAD Templates\web-site-starter`. `README.md` has the user-facing
description and the folder layout.

## Next

M0 (the port) is done except one item: `legacy/` (the old single-file tool
and its tests) is kept until the user says to remove it, together with
`scripts/legacy-fixture.mjs`.

M6 is done (`docs/M6-plan.md`); its LTspice run on D4 is still open.
M1a and M1b are done (`docs/M1-plan.md`). M2 is done (`docs/M2-plan.md`)
except the user's check of the EMI limit tables. The next milestone per
`ROADMAP.md` is M4; plan it in detail before any code.

## Git

Solo repository: direct commits and pushes to the default branch are allowed.

## Layout

- `src/features/filter/engine/`: the math. Keep it free of DOM and storage
  access; an ESLint rule on the folder enforces it.
- `src/features/filter/state/`: presets, `adopt()`, reducer, store,
  persistence, undo history (`history.ts`), saved designs (`library.ts`).
- `src/features/filter/export/`: SPICE netlist and report text (pure), report
  zip and SVG/PNG figures (DOM).
- `src/features/filter/plots/` and `components/`: the UI.
- `engine/__fixtures__/legacy-presets.json`: frozen numbers of the old
  single-file tool. Never regenerate it to make a test pass.
- `references/`: app-note PDFs. Their equations are images, so the text
  cannot be extracted.

## Done means all of these pass

```
npm test                          # Vitest
npm run build && npm run build:single
python -I test/browser_check.py   # needs both builds; starts vite preview itself
npm run lint
npx prettier --check .
npm run knip
```

Report the pass/fail counts. For an engine bug, add a check that fails before
the fix. Screenshots go to `%TEMP%\filter-shots`; look at them after any
change to the layout or plots (1440 px and 390 px, dark and light).

## Ground truth

The numbers come from the user's design reports in
`C:\Users\AORUS\Documents\Github\document-archive\documents`:
- NP-DR-26001, NP-DR-26003, NP-DR-26004
- AOH-DR-26006
- LQRx `Reports/02_Power_State` and `Reports/03_Buck_1p1MHz`

Every preset and engine check traces back to one of these. When the tool
disagrees with a report, check the report's definition before changing the
math. For example, D4's 54.6 dB is the Lb = 0.8 µH case.

An intended change to the numbers fails `parity.test.ts`. Say so to the user
and get approval before changing the fixture.

## Definitions (keep them consistent with the reports)

- Rn = −Vin²·η/P is flat. It holds only up to `fcheck`, so both the peak
  search and the Nyquist scan stop there.
- Zout is seen from the converter with the source voltage shorted. Rsrc and
  Lsrc stay in the path.
- H = Vout/Vsrc, with the converter side open by default. S21 covers the
  filter blocks only, between 50 Ω ports.
- Q is the series form Q = Re(Zout(f0))/Z0, which matches the reports.
  Peak/Z0 is shown separately.
- A corner is one Vin from {min, nom, max} (duplicates merged) and one load
  from {light (`pLight`), full (`pout`)}. At a corner, a cap with `cv` uses
  C(Vin) instead of `derate`, and an inductor or bead with `li` uses L(I),
  I = P_load/(eta·Vin). |Rn| always uses full power. The nominal tiles keep
  the typed values. `engine/oppoint.ts`.
- A tolerance is ± % on a main L, C or R value (`TOL_KEYS`), applied after
  the corner values. Monte Carlo is uniform, seed 1; one draw is one board,
  the same parts at every corner. `engine/tolerance.ts`, run in
  `workers/tolerance.worker.ts`.
- Closed-form optimum damping: only the Rd-Cd, parallel Rd-Ld and series
  Rd∥Ld forms are used. Each one was verified against the numeric optimizer.
  A new closed form needs the same check in `engine.test.ts`.
- EMI (`engine/emi.ts`, `engine/emi-limits.ts`, `docs/M2-plan.md`):
  - An option, off by default (`emi.on`). While off: no EMI tab, the card
    shows one line, no EMI section or figure in the report, and
    `emiResult` is not run. Turning it off on the EMI tab goes to Zout.
  - Input current: each phase is a trapezoid of height Io/N, width D·T at
    the 50 % points, edge time tr. c_n = 2·Io·|sin(nπD)|/(nπ)·
    |sinc(nπ·tr·fsw)| for n a multiple of N, else 0. An exact null is 0.
    tr = 0 and n = N give `metrics().ripple.ih`.
  - The AN follows the standard and replaces Rsrc and Lsrc. Its nominal
    impedance is (jωL + R) ∥ 50 Ω. With 2 lines the loop sees 2·Zl.
  - Reading: c_n·|1/(A + Zloop·C)|·|Zl|, in dBµV rms. Fixed fsw, so one
    value is compared with every detector limit of a band. Harmonics
    within ±RBW/2 add in amplitude.
  - Margin = limit − reading − EMI margin, lowest over every full-load Vin
    corner. Needed = no-filter reading − (limit − EMI margin). f0 hint =
    min f·10^(−needed/40).
  - The limit tables are ASSUMED until the user checks them against the
    standards (`references/emi-limits.md`). There is no report ground truth
    for EMI.

## Look (template rules)

- Dark theme by default, with the brand tokens in `src/styles/theme.css`.
- Colours come from tokens (`--chart-1`…`--chart-6`, `--status-*`,
  `--destructive`), never raw hex. Plotly gets them through
  `plots/theme-colors.ts`.
- Build pages from cards; long text reads as lists.
- The Tuner page leads with the circuit and the plot card (top right; first
  on narrow screens, before the inputs). New cards go below Results, not
  above the plot. `index.tsx` places the three blocks with grid rows.
- Propose larger visual changes before making them.

## Gotchas

- **Narrow peaks.** A coarse grid steps over high-Q resonances. `peakZout` and
  the Nyquist check bisect each sign change of Im(Zout). Keep that when you
  touch either one.
- **Stage lookup.** Use `sectionOf(st, id)` for anything about one damping
  element (closed form, Rd for Q, Cd hint). `primary` is the stage nearest
  the converter and feeds only the summary tiles.
- **Untrusted input.** `adopt()` in `state/adopt.ts` is the only entry point
  for links, JSON files and localStorage. It whitelists fields and converts
  each one to a number. A new state field needs a line there and a case in
  `adopt.test.ts`. A new block field also needs its name in the skip list
  in `parity.test.ts`, because the legacy fixture has no such key. Render user text as React text; Plotly strings go through
  `esc()` in `plots/traces.ts`.
- **Design links.** `#d=<base64>` is read and cleared in `main.tsx` before the
  router starts, because hash history would treat it as a route.
- **Pure reducer.** New block ids come from `newId()` in event handlers, never
  inside the reducer (StrictMode calls it twice).
- **New block type.** Add it to the `Block` union in `engine/model.ts` and a
  `TYPES` entry, then cover it in `zBlock`, `dcR` (series blocks),
  `isInductive` (if it is a series L), `blockShape` in
  `components/schematic.tsx` and the add-button label in
  `components/settings.tsx`. `adopt` picks up its parameters from
  `TYPES[type].p`.
- **Undo.** Every design change goes through `dispatch`, which records it in
  `history.ts`. Same-key actions within 800 ms join one step; `tab` and
  `sweepId` are not recorded. An action that leaves the design unchanged is
  dropped, or it would clear the redo list.
- **Saved designs.** `library.ts` reads localStorage through `adopt()` per
  item and drops bad items. Overlay curves are cached per design object, so
  never mutate a saved design.
- **Light figures.** Exports read the light tokens from an off-screen
  `.light-scope` element (`theme.css` gives it the `:root` tokens). Keep
  that selector on the light block.
- **Report front matter is not YAML.** The archive's builder
  (`report_figs.py`) reads flat `key: value` lines and stops on an unknown
  key. Use `fmValue()` and only the keys in `export/report.ts`.
- **Routes.** `src/routeTree.gen.ts` is generated by `vite build`; after adding
  a route, run `npx vite build` once before `tsc -b`, and commit the file.
