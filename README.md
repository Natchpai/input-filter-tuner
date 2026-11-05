# Input Filter Tuner

A browser tool for tuning DC-DC converter input filters. Built with Vite,
React and TypeScript from the web-site-starter template.

## Open it

- **One file, no server:** `npm run build:single`, then double-click
  `dist-single/index.html` in Chrome or Edge. Everything is inside the file,
  Plotly included, so it works offline.
- **GitHub Pages:** pushing to `main` runs `.github/workflows/pages.yml`.
  Set Settings > Pages > Source to "GitHub Actions" once. The URL path is
  `base` in `vite.config.ts` (`/input-filter-tuner/`).
- **While editing:** `npm install`, then `npm run dev`.

## What it does

The page has two panes that scroll on their own:

- Left: the converter, the source and the filter blocks. Block cards start
  folded to one line with their main values; the chevron opens one.
- Right: the status strip, the circuit and the plots, then the analysis
  tabs (Results, Corners, Tolerance, Sensitivity, EMI, Time, Assistant,
  Designs). The strip and the tab bar stay at the top while you scroll. A
  strip chip opens its tab.
- On a phone: Inputs, Plot and Analysis tabs show one area at a time.
- Help text is hidden. The Hints button in the toolbar shows all of it, and
  each card's (i) shows that card's hints.

- Builds the filter as a ladder of blocks from source to converter. Each block
  is series or shunt, and you can add, remove, reorder, duplicate or switch it off.
  - Series blocks: inductor (L, DCR, Cp), 2-element bead (Rdc + Lb∥Rb),
    4-element bead (Rs + Lb∥Rp∥Cb), and series R (with ESL).
  - Shunt blocks: capacitor bank (C, ESR, ESL, count, DC-bias loss %) and
    Rd-Cd leg (Rd, Cd, Cd ESR, Cd ESL).
  - Inductor damping: R across L, parallel Rd-Ld, or series Rd∥Ld.
- Draws the circuit with every parasitic. Click a part to open its card and
  jump to its value.
- Plot tabs:
  - |Zout| against |Rn| at Vin min/nom/max, with the margin line.
  - H or 50 Ω S21.
  - Zin.
  - Minor loop gain Tm as Bode and Nyquist.
  - Impedance of each element.
  - Rd sweep.
  - Conducted EMI (only while EMI is on): predicted harmonics against the
    limit lines, and the filter attenuation against the attenuation needed.
  - Time domain (only while it is on): hot-plug, load step or source ripple.
- Results:
  - Peak |Zout| and the Middlebrook margin, plus a Nyquist check.
  - Z0, f0 and Q.
  - Attenuation at fsw and N·fsw.
  - Source ripple current, DC drop and loss, and per-block AC loss.
- Operating-point corners:
  - Vin min/nom/max × {light load, full load}. |Rn| always uses full power.
  - C vs DC bias per capacitor and L vs DC current per inductor or bead.
    Paste points one per line, or a Murata SimSurfing CSV.
  - A Corners tab with peak, |Rn|, margin, Q and attenuation at fsw per
    corner, the worst one marked, and its |Zout| on the Zout tab.
- Part tolerances:
  - ± % on each main L, C and R value, in the block card.
  - A Tolerance tab: every ± extreme (up to 8 tolerances) and a seeded
    Monte Carlo (uniform, N draws) at every corner, run in a Web Worker.
  - Worst, 1st percentile and median margin per corner, and a histogram of
    the board margin (lowest over the corners).
- Conducted EMI, an option that is off by default. The checkbox in the
  card header turns it on; the setting is saved with the design.
  - The converter input current as a trapezoid (D, edge time, N phases),
    with harmonics up to 108 MHz.
  - The LISN follows the standard: CISPR 25 (5 µH / 50 Ω AN, class 1 to 5)
    or CISPR 32 (50 µH / 50 Ω V-AMN, class A/B). 1 or 2 lines.
  - An EMI tab with pass or fail per band, the worst harmonic and its
    corner, the margin, the attenuation needed and the LC corner frequency
    that would meet the limits.
  - The limit values come from public summaries and are not yet checked
    against the standards (`references/emi-limits.md`).
- Time domain, an option that is off by default (checkbox in the card
  header), run in a Web Worker at every Vin:
  - Hot-plug: Vin steps on through Rsrc + Lsrc and a cable (L and R, default
    1 µH and 0 Ω), converter off. V peak and overshoot at the converter pins,
    inrush peak, I²t and the peak voltage at each shunt part.
  - Load step: the converter as constant power, P light → P full and back.
    V min, dip, V max, ringing frequency and settle time. A design that is
    unstable under constant power is flagged.
  - Source ripple: the steady-state source current over three switching
    periods, with its peak to peak.
  - Checked against closed forms, the frequency response and LTspice
    (within 5 % on D1 Rd-Cd and D4).
- Several converters on one bus, up to 6 ("+ Converter" under the converter
  card). Each one has its own P, P light, η, Vout, fsw, phases and f check;
  Vin and k are shared.
  - Each converter counts in the bus |Rn| up to its own f check, so the
    limit line is a staircase. The margin is the lowest over these bands,
    and Results names the band that limits.
  - Corners, EMI, ripple and the load step include every converter.
- Design assistant, off by default (checkbox in its card header).
  - Input: an attenuation in dB at a frequency (default N·fsw) or the EMI
    limits, 1 or 2 stages, the fixed L or C per stage, and the damping form
    (Rd-Cd, parallel or series Rd-Ld, R across L).
  - Damping sized for a target Q (as in the reports) or to just meet
    margin k (Erickson).
  - Shows exact and E-series values (E6 to E96 per part type), margin,
    attenuation and the worst corner. Apply replaces the filter blocks as
    one undo step.
  - Optimizer (Goal: least Cd, least total C or least DC loss): L and C
    free inside ranges per stage, DCR = the old inductor's Ω per µH times
    L. Limits: the target, margin k, the gain peak max|H| ≤ Qpeak and the
    DC loss limit (the Q window of NP-DR-26004, checked exactly). Shows the
    goal, the Q window and the limits that hold the goal. Runs in a worker
    with Cancel.
- Sensitivity table: the margin and attenuation change for +10 % in each
  part, largest first. Also in the report.
- Damping helpers, under each damping part:
  - Rd-Cd leg: type Q, then "Set Rd for Q" (NP-DR-26001 equation).
  - The Rd menu: "Optimum (numeric)", a search with all parasitics
    included, and "Closed form" (lossless Middlebrook/Erickson optimum).
  - One line shows the closed-form Rd and peak, and warns when Cd is more
    than one E12 step below 5·C. The section details are in the block's
    hints.
- Other tools:
  - Tolerance curves (ΔL, ΔC).
  - Undo and redo (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y). A slider drag is one
    step.
  - Saved designs in the browser, with notes. Each one can be drawn as a
    grey overlay, loaded, renamed, or compared with the current design.
    Snapshot saves the current design with its overlay on.
  - Save/load JSON, copy a link that holds the design, and CSV export.
  - SPICE netlist (`.cir`) with two copies of the filter: one gives H, the
    other Zout.
  - SVG/PNG of the current plot, in light colours.
  - Design report: a zip with `report.md` and the SVG figures for the
    report archive's PDF builder. With the time domain on, it also holds
    LTspice netlists of the hot-plug and the load step.
- Presets come from the design reports:
  - NP-DR-26001 (undamped, Rd-Cd, and methods A, B, D).
  - NP-DR-26003 and NP-DR-26004 (bead filters).
  - AOH-DR-26006 (TPS62142 bus).
  - LQRx 02 and LQRx 03.
  - Also parallel and series Rd-Ld, Pi/CLC, and 2-stage LC.

Value inputs take SI prefixes: `22u`, `4u7`, `1.5m`, `10k`. Escape puts the
value back. Arrow Up/Down, or the wheel while the box has focus, steps a
value:

- L, C and R: one E24 value (Shift: one E6 value).
- Other values: 5 % (Shift: 25 %), or 1 % of the range on linear fields.

The slider covers ÷10 to ×10 around the value and re-centres when you let
go, so small moves stay fine.

## Definitions

- The converter input is Rn = −Vin²·η/P, a flat negative resistance. This
  holds only below the converter loop crossover, so the peak search stops at
  "f check max".
- Several converters: the bus Rn is −Vin²/Σ(P/η) over the converters whose
  f check is at or above the frequency. Ripple and EMI lines at the same
  frequency add in phase (worst case); in the load step every converter
  steps at the same time.
- Zout is seen from the converter with the source voltage shorted. Rsrc and
  Lsrc stay in the path.
- H = Vout/Vsrc with the source impedance included. The load can be open
  (as in the reports), the converter Rn, or a resistor.
- S21 covers the filter blocks only, between two 50 Ω ports.
- Q is the series form, Q = Z0/r = Re(Zout(f0))/Z0. This matches the
  reports' Q.
- Peak/Z0 is shown next to Q.
- EMI: the AN replaces Rsrc and Lsrc. Each harmonic of the input current
  goes through the filter into the AN; the reading is the voltage on its
  50 Ω, in dBµV rms. With a fixed fsw one harmonic reads the same on every
  detector, so it is compared with every limit of its band.
- Time domain: the same R, L, C elements, solved by modified nodal analysis
  with fixed-step trapezoidal integration. The step is halved until the
  peaks agree within 0.1 %. C(V) and L(I) are taken at each corner and held
  fixed; no tolerances and no converter loop.

## Tests

```
npm test                          # Vitest: engine, parity, SI parsing, adopt()
npm run build && npm run build:single
python -I test/browser_check.py   # headless Chrome on vite preview and the single file
npm run lint
npx prettier --check .
npm run knip
```

- `engine.test.ts` checks the report values for D1, D3, D4, LQRx 02,
  LQRx 03 and D6 (75 checks). It also checks that the closed-form optimum
  damping matches the numeric optimizer, and that S21 gives the expected
  results.
- `parity.test.ts` checks every preset against
  `engine/__fixtures__/legacy-presets.json`, the numbers of the old
  single-file tool, to 1e-9.
- `browser_check.py` loads every preset and tab, edits values, uses the
  helpers, tries a hostile link, and checks 1440 px and 390 px in dark and
  light: both panes, the analysis and area tabs, folded cards, hints, E-series
  stepping and the slider window. It also checks undo/redo, saved designs and overlays after a
  reload, and every export (SPICE, plot SVG/PNG, report zip). Screenshots
  go to `%TEMP%\filter-shots`.

## Layout

- `src/features/filter/engine/`: the math, pure TypeScript with no DOM
  access.
- `src/features/filter/state/`: presets, `adopt()`, reducer, store,
  localStorage and links.
- `src/features/filter/plots/`: sweeps, Plotly traces per tab.
- `src/features/filter/components/`: cards, schematic, results, toolbar.
- `src/features/filter/export/`: SPICE netlist, report text, report zip,
  and SVG/PNG figures.
- The rest of `src/` is the template: layout, sidebar, theme, shadcn/ui.

## References

The `references/` folder holds app notes, datasheets and a thesis, indexed
in `references/README.md`. Erickson's APEC 1999 paper is kept local only
(IEEE copy); get it from IEEE Xplore. `docs/equations.md` lists each engine
equation with its verdict and source (audit of 2026-11-05). The closed-form
damping matches Erickson's equations and his own numbers, and the tool's
numeric optimizer. Several app notes give "Rd = Z0, Cd = 4C" as the
optimum; it is not. `references/emi-limits.md` lists the sources of the
EMI limits and networks.
