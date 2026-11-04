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

- Builds the filter as a ladder of blocks from source to converter. Each block
  is series or shunt, and you can add, remove, reorder, duplicate or switch it off.
  - Series blocks: inductor (L, DCR, Cp), 2-element bead (Rdc + Lb∥Rb),
    4-element bead (Rs + Lb∥Rp∥Cb), and series R (with ESL).
  - Shunt blocks: capacitor bank (C, ESR, ESL, count, DC-bias loss %) and
    Rd-Cd leg (Rd, Cd, Cd ESR, Cd ESL).
  - Inductor damping: R across L, parallel Rd-Ld, or series Rd∥Ld.
- Draws the circuit with every parasitic. Click a part to jump to its value.
- Plot tabs:
  - |Zout| against |Rn| at Vin min/nom/max, with the margin line.
  - H or 50 Ω S21.
  - Zin.
  - Minor loop gain Tm as Bode and Nyquist.
  - Impedance of each element.
  - Rd sweep.
- Results:
  - Peak |Zout| and the Middlebrook margin, plus a Nyquist check.
  - Z0, f0 and Q.
  - Attenuation at fsw and N·fsw.
  - Source ripple current, DC drop and loss, and per-block AC loss.
- Operating-point corners:
  - Vin min/nom/max × {light load, full load}. |Rn| always uses full power.
  - C vs DC bias per capacitor and L vs DC current per inductor or bead.
    Paste points one per line, or a Murata SimSurfing CSV.
  - A Corners card with peak, |Rn|, margin, Q and attenuation at fsw per
    corner, the worst one marked, and its |Zout| on the Zout tab.
- Part tolerances:
  - ± % on each main L, C and R value, in the block card.
  - A Tolerance card: every ± extreme (up to 8 tolerances) and a seeded
    Monte Carlo (uniform, N draws) at every corner, run in a Web Worker.
  - Worst, 1st percentile and median margin per corner, and a histogram of
    the board margin (lowest over the corners).
- Damping helpers:
  - "Rd for Q" (NP-DR-26001 equation).
  - "Optimum Rd", a numeric search with all parasitics included.
  - "Closed-form Rd" (lossless Middlebrook/Erickson optimum).
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
  - Design report: a zip with `report.md` and four SVG figures for the
    report archive's PDF builder.
- Presets come from the design reports:
  - NP-DR-26001 (undamped, Rd-Cd, and methods A, B, D).
  - NP-DR-26003 and NP-DR-26004 (bead filters).
  - AOH-DR-26006 (TPS62142 bus).
  - LQRx 02 and LQRx 03.
  - Also parallel and series Rd-Ld, Pi/CLC, and 2-stage LC.

Value inputs take SI prefixes: `22u`, `4u7`, `1.5m`, `10k`. Arrow Up/Down
steps a value by 5 %, and Shift+Arrow by 25 %.

## Definitions

- The converter input is Rn = −Vin²·η/P, a flat negative resistance. This
  holds only below the converter loop crossover, so the peak search stops at
  "f check max".
- Zout is seen from the converter with the source voltage shorted. Rsrc and
  Lsrc stay in the path.
- H = Vout/Vsrc with the source impedance included. The load can be open
  (as in the reports), the converter Rn, or a resistor.
- S21 covers the filter blocks only, between two 50 Ω ports.
- Q is the series form, Q = Z0/r = Re(Zout(f0))/Z0. This matches the
  reports' Q.
- Peak/Z0 is shown next to Q.

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
  light. It also checks undo/redo, saved designs and overlays after a
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

The `references/` folder holds TI SNVA538, TI SLVAFE0, the Kollman Power
Tip #4 (input filter damping) and Flex AN323. Their equations are images, so
the closed forms in the tool were checked against the tool's numeric
optimizer, not read from these PDFs.
