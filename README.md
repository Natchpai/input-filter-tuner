# Input Filter Tuner

A one-file browser tool for tuning DC-DC converter input filters.
Open `index.html` in Chrome or Edge. Plotly loads from cdnjs the first time;
after that the browser cache is enough.

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
- Damping helpers:
  - "Rd for Q" (NP-DR-26001 equation).
  - "Optimum Rd", a numeric search with all parasitics included.
  - "Closed-form Rd" (lossless Middlebrook/Erickson optimum).
- Other tools:
  - Tolerance curves (ΔL, ΔC).
  - Snapshots to compare designs.
  - Save/load JSON, copy a link that holds the design, and CSV export.
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
node test/engine.test.mjs      # engine vs. report numbers and regression cases, 75 checks
python test/browser_check.py   # headless Chrome: presets, tabs, edits, hostile links, phone width
```

The engine test checks the report values for D1, D3, D4, LQRx 02, LQRx 03
and D6. It also checks that the closed-form optimum damping matches the
numeric optimizer, and that S21 gives the expected results.

## References

The `references/` folder holds TI SNVA538, TI SLVAFE0, the Kollman Power
Tip #4 (input filter damping) and Flex AN323. Their equations are images, so
the closed forms in the tool were checked against the tool's numeric
optimizer, not read from these PDFs.
