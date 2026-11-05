# Engine equations and their sources

Audit of 2026-11-05, before M3b. The user asked to check each equation
against outside sources, not only against the design reports. Files are in
`references/` (index: `references/README.md`).

Verdicts:
- **CORRECT**: matches the source or an exact derivation.
- **APPROXIMATE**: holds under the stated condition.
- **RULE**: a design rule of thumb, not an exact result.
- **MODEL**: this tool's own modelling choice.
- **UNVERIFIED**: no outside source read yet.

Sources:
- [E99] Erickson, "Optimal Single Resistor Damping of Input Filters", APEC
  1999 (local only).
- [S10] Sclocchi, TI SNVA538 (`snva538.pdf`).
- [XAL] Coilcraft XAL7070 datasheet. [SRP] Bourns SRP7028A datasheet.
- [SB] Schwarzbeck, automotive LISN app note.
- "Derivation" means worked out by hand from circuit laws, shown in short.

## Damping (`engine/closed-form.ts`, `lib/damping.ts`)

| Equation (code) | Verdict | Basis |
| --- | --- | --- |
| `closedForm` rc, n = Cd/C: Rd/Z0 = √((2+n)(4+3n)/(2n²(4+n))), peak/Z0 = √(2(2+n))/n | CORRECT | [E99] eqs. 19, 20 (Qopt = R/R0) |
| `closedForm` RLpar, n = Ld/L: Rd/Z0 = √(n(3+4n)(1+2n)/(2(1+4n))), peak/Z0 = √(2n(1+2n)) | CORRECT | [E99] eqs. 6, 8, 12 |
| `closedForm` RLser, n = Ld/L: Rd = Z0·n/(1+n)·√((2+n)(4+3n)/(2(1+n)(4+n))), peak/Z0 = √(2(1+n)(2+n))/n, never below √2 | CORRECT | [E99] eqs. 15, 16 (Qopt = R0/R) |
| `nForPeak`: inverse of each peak formula | CORRECT | algebra on the rows above |
| zBlock RLpar = L ∥ (Rd + jωLd); RLser = L + (Rd ∥ jωLd) | CORRECT topology | [E99] Fig. 3(b), 3(c) |
| [S10] "n = 4 gives Rd = Z0, Cd = 4C" (also quoted by Belfuse) | WRONG in the app note: it uses Erickson's Rd/R0 as ζ. At n = 4, Rd = 0.612·Z0 gives peak 0.866·Z0 at fm = f0·√(2/(2+n)); Rd = Z0 gives more than 1.02·Z0 near 0.7·f0. The code follows [E99]. | [E99], derivation |
| `cdForRd`: Cd = 10/(2π·f0·Rd), i.e. Xcd = Rd/10 at f0 | RULE from NP-DR-26001; no outside source for "/10". About 10·C at Q = 1, the top of the 3-10× C range app notes give; larger than the optimum. | — |
| `rdForQ`: Rd = Z0²/(Z0/Q − rL); `drForQ`: Δr = Z0/Q − rL | APPROXIMATE: 1/Q ≈ Z0/Rd + rL/Z0 when rL ≪ Rd and rL ≪ Z0, with Cd ≫ C. Exact for R across C with rL = 0. | derivation |
| `qSeriesOf`: Q = Re(Zout(f0))/Z0 | Report definition. Equals the pole Q to first order only. Textbooks judge peak |Zout|/Z0, shown as Peak/Z0. | [E99], derivation |
| Peak |Zout| ≈ Q·Z0 (reports' Qstab = |Rn|/(k·Z0), k as a ratio) | Exact for R across C; for R in series with L the peak is about Z0·√(Q²+1). The tool's margin uses the exact peak. | derivation |
| Gain peak ≈ Q (reports: Qpeak 2 → 6 dB) | APPROXIMATE: |H|max = Q/√(1 − 1/(4Q²)) for parallel R damping, +0.3 dB at Q = 2. M3b uses the exact H peak. | derivation |
| Qloss = Z0/(ε·Vin²/P + Z0²/Rp) (NP-DR-26004) | CORRECT for Rp ≫ Z0, with P the input power (Pout/η). | derivation |
| Ld has no DCR | MODEL gap: in RLser, Ld carries the full DC current ([E99] §IV) but gets 0 Ω. M3b's loss goal counts ρ·Ld and warns. | [E99] |

## Circuit and stability (`ladder.ts`, `bus.ts`, `metrics.ts`, `peak.ts`)

| Equation (code) | Verdict | Basis |
| --- | --- | --- |
| zBlock: ind (dcr + jωL) ∥ Cp; bead2 rdc + (jωLb ∥ rb); bead4 rs + (jωLb ∥ rp ∥ Cb); cap bank (esr + jωesl + 1/(jωC))/n; rc leg rd + esr + jωesl + 1/(jωCd) | CORRECT (n equal parts in parallel; standard part models) | derivation |
| `dcR`: dcr ∥ dR for dmode R and RLpar, dcr for RLser | CORRECT (inductors short at DC) | derivation |
| ABCD: series [1 z; 0 1], shunt [1 0; 1/z 1], cascaded source to converter | CORRECT | derivation |
| Zout = (B + Zs·D)/(A + Zs·C); Hopen = 1/(A + Zs·C); H = 1/(A + Zs·C + (B + Zs·D)/ZL); Zin = (A·ZL + B)/(C·ZL + D) | CORRECT (reciprocal, AD − BC = 1; Hopen is both Vout/Vsrc open and source current per converter ampere) | derivation |
| S21 = 2/(A + B/Z0 + C·Z0 + D) | CORRECT | derivation; Pozar Table 4.2 |
| Rn = −Vin²·η/Pout = −Vin²/Pin; bus Rn = −Vin²/Σ(P_i/η_i) | CORRECT | [E99] §I (−R/M²), Electronic Design (18 V, 13.5 A → −1.33 Ω) |
| Margin = 20·log10(|Rn|/peak|Zout|) ≥ k, up to `fcheck` | CORRECT: constant-power behaviour holds inside the control bandwidth; `fcheck` is the user's value for it. | [S10], EDN Power Tips |
| Nyquist: unstable when Re(Zout) > |Rn| where Im(Zout) = 0 | CORRECT: Tm = Zout/Rn = −Zout/|Rn| crosses −1 there | derivation |

## Ripple and EMI (`metrics.ts`, `emi.ts`)

| Equation (code) | Verdict | Basis |
| --- | --- | --- |
| iacRms = (Io/N)·√((N·D − k)(k + 1 − N·D)), k = ⌊N·D⌋ | CORRECT: a two-level current, p = N·D − k; N = 1 gives Io·√(D(1 − D)) | Flex AN 323 p8 eq. 8; derivation |
| ih = 2·Io·|sin(NπD)|/(Nπ), peak at N·fsw | CORRECT (c_n at n = N) | derivation |
| c_n = 2·Io·|sin(nπD)|/(nπ)·|sinc(nπ·tr·fsw)| for n = m·N, else 0 | CORRECT: one phase 2(Io/N)·D·sinc(nπD)·sinc(nπ·tr/T); N shifted phases add only at n = m·N | derivation (Paul's trapezoid spectrum) |
| `zLisn` CISPR 25: (jω·5 µH + 1 Ω) ∥ 50 Ω | CORRECT nominal network | [SB], CISPR 16-1-2:2014 §4.5 |
| `zLisn` CISPR 32: jω·50 µH ∥ 50 Ω (R = 0); RBW 9 kHz / 120 kHz | UNVERIFIED (the 50 µH + 5 Ω form is the 9 kHz-30 MHz V-network). Part of the user's open check of the EMI tables. | R&S ENV216 (search snippet) |
| 2 lines: loop sees 2·Zl, receiver reads |Zl|·I | CORRECT for a pure DM current | derivation |
| f0 = fa·10^(−A/40) (assistant start value) | CORRECT asymptote of an LC section; only a start value, the exact check follows | derivation |

## Time domain (`transient.ts`)

| Equation (code) | Verdict | Basis |
| --- | --- | --- |
| Trapezoidal companion: C geq = 2C/h, ieq = geq·v_n + i_n; L dual, req = 2L/h | CORRECT | derivation |
| Backward-Euler steps after each step change | Common simulator practice (trapezoidal rule rings on stiff modes); no source text read. `export/ltspice.test.ts` matches LTspice within 2 %. | LTspice comparison |
| Constant-power load I = P/(η·max(V, Vin/2)) | MODEL: a low-voltage clamp is common (LTspice folds back below 1 V by default); Vin/2 is this tool's choice. | Cadence, LTspice notes (snippets) |

## Parts (M3b DCR model)

| Item | Verdict | Basis |
| --- | --- | --- |
| DCR ∝ L in one footprint | APPROXIMATE: XAL7070 L^1.01 from 1 to 6.8 µH, L^0.85 from 0.16 µH; SRP7028A L^0.91 from 0.15 to 33 µH. Below about 1 µH, scaling down underestimates DCR. Isat falls about as L^−0.5 to L^−0.6 (not modelled). | [XAL], [SRP] |

## App-note rules checked against [E99]

From the page images of the PDFs in `references/`.

| Source | Rule | Verdict |
| --- | --- | --- |
| Flex AN 323 p12 eq. 24 | "Optimum" Rd = √(Lf/Cf), Cd = 4·Cf | NOT the optimum: at n = 4 [E99] gives Rd = 0.612·Z0, peak 0.866·Z0; Rd = Z0 peaks higher. Same error as [S10]. |
| TI SLVAFE0 p5 eqs. 10-11 | Rd = Z0 (from the series-R case, Q = 1) reused for Rd-Cd, Cd ≥ 5·C | RULE, not the optimum: at n = 5 [E99] gives Rd = 0.544·Z0, peak 0.748·Z0. |
| Flex AN 323 p4 eq. 2 | Zi,min = Vi²/(η·Vo·Io) | WRONG η placement: |Rn| = Vin²/Pin = Vin²·η/Pout. Vin²/(η·Pout) is larger by 1/η² and not conservative. The code uses Vin²·η/Pout. |
| Flex AN 323 p9 eq. 17 | Peak Zout taken as √(L/C) | APPROXIMATE: a lower bound; the damped peak is the exact one. |
| TI SLVAFE0 p3 eq. 6 | Zout < Zin/8 (18 dB) | A stricter margin than k = 6 dB, not an error. |
| Kollman Power Tip 4 p1 | Zout at least 6 dB below the converter Zin | CORRECT (k = 6 dB). |
| Kollman Power Tip 4 p3 example | Zmax/Z0 = 6 read from a chart as Cd/C = 0.1, Rd/Z0 = 3 | UNVERIFIED chart read: [E99] gives n = 0.36 and Rd/Z0 = 3.24 for a 6·Z0 peak; n = 0.1 would peak near 20·Z0. Rd agrees; Cd/C was likely misread from the log chart. |
| Flex AN 323 p8 eq. 8 | IC,rms = Io·√((D − m/N)((m+1)/N − D)), m = ⌊N·D⌋ | CORRECT: the same as `iacRms`. Confirms that row from a source. |
| TI SLVAFE0 p3 eq. 5 | Zin = Vin²·η/Pout | CORRECT (the same as `rnOf`, sign dropped). |
| Flex AN 323 p12 eq. 22 | Frequency-dependent buck Zin | Not used. The flat Rn is its low-frequency limit (M5 item). |

Many app notes print "Rd = Z0, Cd = 4C (or 5C)" as the optimum. It is not
the optimum. The tool follows [E99], and `engine.test.ts` checks the closed
forms against the numeric optimizer.

## Two-stage filters

[E99] §VI staggers the sections. The converter-side section gets the lower
f0 and more of the dB (45 of 80 dB in its example). The source-side peak
sits about 2× higher, so |Za| stays well below |ZN| and |ZD|. M3a splits
the dB equally by default with no stagger rule. M3b searches L and C
freely, so a stagger appears when it helps.
