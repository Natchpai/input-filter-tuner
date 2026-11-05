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
except the user's check of the EMI limit tables. M4 is done
(`docs/M4-plan.md`).

M5's "several converters on one bus" item is done (`docs/M5-plan.md`);
the other two M5 items (frequency-dependent Zin, GMPM/ESAC) are not
planned yet. M3a and M3b are done (`docs/M3-plan.md`): design assistant,
E-series rounding, sensitivity table, and the optimizer (least Cd, total C
or DC loss). The UX rework is done (`docs/UX-plan.md`). The equation audit
of 2026-11-05 is `docs/equations.md`; check a new equation against an
outside source there, not only against the reports. Size as an optimizer
goal waits for the M8 parts library.

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
- `references/`: app notes, a paper and datasheets, indexed in
  `references/README.md`. Their equations are images: read the pages as
  images (Read with `pages`). The Erickson IEEE paper is local only
  (`.gitignore`, public repo).

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
  search and the Nyquist scan stop there. The check range is
  min(f min, 10 Hz) to `fcheck` (`checkRange`); it never follows the plot
  zoom. "Vin min" is the lowest of the three Vin fields (`vinLow`), so they
  need not be typed in order.
- Several converters (`engine/bus.ts`, `docs/M5-plan.md`): converter 1 is
  `conv` (it also holds the bus fields Vin and k); converters 2 to 6 are
  `loads` items (`BusConv`), counted only while `on`. `converters(st)` is
  the one list every check uses.
  - Bus Rn = −Vin²/Σ(P_i/η_i). Each converter counts up to its own
    `fcheck` (`fcOf`), so the check range is split into bands at each
    f check (`bands`); margin = lowest band margin (`marginBands`), and
    Nyquist judges each crossing against its band's |Rn|. Zin and the
    'conv' H load use the flat bus Rn at Vin nom.
  - A corner sets every converter light or every one full (`pBus`,
    `iBus`). EMI and ripple: one spectrum per converter; lines at the same
    frequency (EMI: within RBW/2) add in phase. Load step: every converter
    steps together, one constant-power source each (also in the netlist).
  - With no extra converter on, every number is today's, bit for bit.
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
  - An option, off by default (`emi.on`). While off: no EMI plot tab, the
    EMI analysis tab shows only its on switch, no EMI section or figure in
    the report, and `emiResult` is not run. Turning it off on the EMI plot
    tab goes to Zout.
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
- Time domain (`engine/transient.ts`, `docs/M4-plan.md`):
  - An option, off by default (`tran.on`), same rules as EMI. Runs in
    `workers/transient.worker.ts` through `components/use-tran.ts`; its key
    leaves out the plot settings. `tabOf()` in `engine/model.ts` is the one
    place that hides the EMI and Time plot tabs.
  - Circuit: the element graph of `engine/circuit.ts` (shared with the
    SPICE export). MNA, trapezoidal steps, one tiny backward-Euler step for
    the 0+ point and two backward-Euler half steps after each step change.
    The step is halved until the peaks agree within 0.1 % (`converge`).
  - Hot-plug: at each Vin, ideal step through Rsrc + Lsrc plus the cable
    (`tran.lCable`, `tran.rCable`, hot-plug only), converter open, C(V) at
    that Vin, L(I) at 0 A. Inrush and I²t are null when the total source L
    is 0: then parasitic spikes set them.
  - Load step: at each Vin with full-load corner values, constant power
    I = P/(η·max(V, Vin/2)), P light → P full at 0, back once settled.
    Droop = V light − V min. Unstable: V leaves [−Vin, 4·Vin] or still
    swings at half its peak after 200 k steps.
  - Ripple: Fourier sum of the signed trapezoid (`harmonicSigned`, edge time
    `emi.tr`) through Hopen at Vin nom, full load.
  - There is no report ground truth; `export/ltspice.test.ts` compares with
    LTspice when `LTSPICE` points to LTspice.exe.
- Design assistant (`engine/design.ts`, `docs/M3-plan.md`):
  - Inputs in `asst` (off by default, Assistant analysis tab only, no plot
    tab or report section). `clampAsst()` is the one set of limits for `adopt()` and the
    reducer. The proposal is UI state: never saved, linked or undone.
  - Target: A dB at fa (fa 0 = lowest N·fsw on the bus), A = −20·log10
    |Hopen(fa)| of the whole design; or EMI margin ≥ 0 in every band.
  - Zmax = lowest band |Rn| at Vin min, full power, × 10^(−k/20);
    Qstab = Zmax/Z0 per stage. Stage 1 is the source side.
  - Per stage the user fixes L or C; f0_i = fa·10^(−A_i/40) starts it, then
    one scale on every f0 is bisected until the exact check holds.
  - Rule 'q' (reports): Rd = Z0²/(Z0/Q − rL); Rd-Cd adds Cd = 5·C (`cdForC`);
    Rd-Ld forms take n from closedForm peak = Q·Z0. Rule 'leastCd'
    (Erickson): peak target Qstab·Z0, then the peak target is lowered until
    the nominal margin is k + 0.1 dB. A DCR that alone gives Q means no
    damping part.
  - E-series: log-nearest, then greedy one-step moves while a target
    fails. Rd is rounded as the part value (total minus Cd ESR).
  - Apply replaces `blocks` (one undo step). Parasitics come from the old
    block in the same role counted from the converter side; `cv`, `li`,
    `tol` and `derate` are dropped. Corners are checked, not designed for.
- Optimizer (`engine/optimize.ts`, `asst.goal` ≠ 'meet', M3b):
  - Goals: Cd = ΣCd; total C = Σ(C + Cd); DC loss = I²·ΣDCR in % of
    pBus(full), I = iBus(vinLow, full), DCR_i = ρ_i·L_i (+ ρ_i·Ld for
    RLser, since the circuit has no Ld DCR). ρ = dcr/L of the old inductor
    in that place (`rhoOf`); Rsrc is not counted.
  - L and C free in `asst.rng` per stage (0 = the part in that place
    ×0.1…×10, `rangesOf`). Damping: least damping for the peak target
    g·min(Qstab, Qpeak)·Z0 (closed forms), g per stage solved exactly.
  - Limits at nominal: target, margin ≥ k (+0.1 dB in the search),
    Nyquist, max|Hopen| ≤ qPeak over [check lo, max(fcheck, fa)], DC loss
    ≤ eps; 0 turns qPeak or eps off. Corners are shown, not designed for.
  - Search: coarse grid, then a compass search with diagonal moves along
    L·C = const, then `roundE` inside the ranges with a goal descent.
    `optimize.test.ts` checks it against an exact grid and the E-series
    neighbours. Apply: `applyOpt` (DCR = ρ·L). Runs in
    `workers/optimize.worker.ts`; the result is UI state, like the M3a
    proposal.
- Sensitivity (`engine/sensitivity.ts`): each main value (`TOL_KEYS` in
  use) +10 % alone; Δmargin at Vin min, full power, and ΔA at the ripple fr
  of the converter with the least attenuation. Sensitivity tab and report
  section.

## Look (template rules)

- Dark theme by default, with the brand tokens in `src/styles/theme.css`.
  The dark surfaces are neutral greys around `#191a1b` (user, 2026-11-04);
  `index.html` and `theme-switch.tsx` carry the same theme-color.
- Colours come from tokens (`--chart-1`…`--chart-6`, `--status-*`,
  `--destructive`), never raw hex. Plotly gets them through
  `plots/theme-colors.ts`.
- Build pages from cards; long text reads as lists.
- The Tuner page (`index.tsx`, `docs/UX-plan.md`) has two panes that
  scroll on their own; the page does not scroll (`<Main fixed>`).
  - Left (`#inputs`): converter, source, block cards, add block, plot
    settings. Block and converter cards start folded (one line of values
    from `block-summary.ts`).
  - Right (`#right`): status strip (sticky), circuit, plot, then the
    analysis tabs (`analysis-tabs.tsx`, bar sticky under the strip). A new
    analysis section is a new tab in `PANELS`, never a card above the plot.
    Panels stay mounted and are hidden with `hidden`.
  - Narrow screens: Inputs / Plot / Analysis area tabs.
- View state (analysis tab, area, hints switch, open cards) lives in
  `components/ui-store.ts`, never in the design, links or undo.
- Help text is a `<Hint>` (hidden unless the toolbar Hints switch or the
  card's (i) is on); status and computed text is a `<Note>`. A card with
  hints passes `hints` to `ToolCard`.
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
