# References

Outside sources for the engine equations. The PDFs keep their equations as
images: read them as page images (the Read tool's `pages`), not as text.
`docs/equations.md` says which equation each source checks.

| File | Source | Used for |
| --- | --- | --- |
| `Erickson_APEC1999_Optimal-Single-Resistor-Damping.pdf` | R. W. Erickson, "Optimal Single Resistor Damping of Input Filters", Proc. IEEE APEC 1999, pp. 1073-1079 | Closed-form optimum Rd-Cd, parallel Rd-Ld, series Rd∥Ld (eqs. 6-20); two-section design (§VI). **Not in git**: a licensed IEEE copy, kept local only (`.gitignore`). Get it from IEEE Xplore. |
| `snva538.pdf` | M. Sclocchi, "Input Filter Design for Switching Power Supplies", National Semiconductor / TI SNVA538, 2010 | Rd-Cd filter transfer function. Its "n = 4 → Rd = Z0" uses Erickson's Rd/R0 as ζ, so it is not the optimum (see `docs/equations.md`). |
| `Kollman_PowerTip4_input-filter-damping.pdf` | R. Kollman, "Power Tip #4: Damping an Input Filter, Part 2 of 2", Power Management DesignLine, 2008-09-30 | Rd-Cd damping, 6 dB margin rule. |
| `slvafe0.pdf` | F. Shafique, J. Neuhaeusler, "Using the Filters with the DC/DC Step-Down Converter", TI SLVAFE0, 2023 | Input filter stability and damping methods. |
| `Flex_AppNote323_Input-Filter-Design.pdf` | Flex Power Modules, Application Note 323, "Input Filter Design - 3E POL Regulators" | Input filter design for POL regulators. |
| `Schwarzbeck_5uH-LISN_CISPR16-1-2.pdf` | Schwarzbeck Mess-Elektronik, "Impedance and phase of automotive LISNs according to CISPR16-1-2", app note rev. A | CISPR 16-1-2:2014 §4.5 AN: (5 µH + 1 Ω) ∥ 50 Ω (`zLisn`, CISPR 25). |
| `Coilcraft_XAL7070_datasheet.pdf` | Coilcraft XAL7070, Document 856-1, rev. 05/14/19 | DCR vs L in one footprint: DCR ∝ L^1.01 from 1 to 6.8 µH, L^0.85 from 0.16 µH. |
| `Bourns_SRP7028A_datasheet.pdf` | Bourns SRP7028A series datasheet | DCR vs L in one footprint: DCR ∝ L^0.91 from 0.15 to 33 µH. |
| `Pappala-Naredla_BTH-thesis_Input-Filter-Buck.pdf` | R. Papppala, R. R. Naredla, "Input Filter Design to Prevent Line Oscillations in Buck Converter", MSc thesis, Blekinge Institute of Technology | Background on input filter stability. |
| `emi-limits.md` | Notes on the CISPR 25 and CISPR 32 limit tables | EMI limits (ASSUMED until checked against the standards). |
