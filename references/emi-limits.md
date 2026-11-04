# EMI limits and artificial networks: sources

Status: **ASSUMED.** These values come from public summaries, not from the
IEC texts. Check each table against your copy of CISPR 25 and CISPR 32 and
then mark it VERIFIED here. The code is in
`src/features/filter/engine/emi-limits.ts`.

Collected 2026-11-04.

## CISPR 25, conducted emissions, voltage method (AN)

Source: emccalc.com, CISPR 25 CEV limits page,
<https://emccalc.com/limits/cispr25-cev>. The page says the Ed. 5 (2021)
voltage limits are the same as Ed. 4 (2016), and tells you to check them
against the IEC text. No second source was read in full. A search snippet
of TI SLYY136 showed the same class 5 values for LW, MW, CB and VHF
30-54 MHz.

dBµV, peak / QP / average. "–" means no limit for that detector.

| Band | MHz | RBW | Class 5 | Class 4 | Class 3 | Class 2 | Class 1 |
|---|---|---|---|---|---|---|---|
| LW | 0.15-0.30 | 9 kHz | 70/57/50 | 80/67/60 | 90/77/70 | 100/87/80 | 110/97/90 |
| MW | 0.53-1.8 | 9 kHz | 54/41/34 | 62/49/42 | 70/57/50 | 78/65/58 | 86/73/66 |
| SW | 5.9-6.2 | 9 kHz | 53/40/33 | 59/46/39 | 65/52/45 | 71/58/51 | 77/64/57 |
| CB | 26-28 | 9 kHz | 44/31/24 | 50/37/30 | 56/43/36 | 62/49/42 | 68/55/48 |
| VHF | 30-54 | 120 kHz | 44/31/24 | 50/37/30 | 56/43/36 | 62/49/42 | 68/55/48 |
| TV I | 41-88 | 120 kHz | 34/–/24 | 40/–/30 | 46/–/36 | 52/–/42 | 58/–/48 |
| VHF | 68-87 | 120 kHz | 38/25/18 | 44/31/24 | 50/37/30 | 56/43/36 | 62/49/42 |
| FM | 76-108 | 120 kHz | 38/25/18 | 44/31/24 | 50/37/30 | 56/43/36 | 62/49/42 |

To check:
- Whether your edition has more bands up to 108 MHz (for example mobile
  service bands) for the voltage method.
- The RBW per band. The fetch tool took this column from a second table on
  the page.

## CISPR 32, AC mains port, 0.15-30 MHz

dBµV, quasi-peak / average. Class B falls linearly with log f from 0.15 to
0.5 MHz. At 0.5 and 5 MHz the lower limit applies.

| Band (MHz) | Class A QP / AV | Class B QP / AV |
|---|---|---|
| 0.15-0.5 | 79 / 66 | 66→56 / 56→46 |
| 0.5-5 | 73 / 60 | 56 / 46 |
| 5-30 | 73 / 60 | 60 / 50 |

Sources:
- QP: IB Lenhardt, EN 55032 / CISPR 32 glossary,
  <https://ib-lenhardt.com/kb/glossary/en-55032-cispr-32>.
- Class B AV: Tom's Hardware PSU review (search snippet only),
  <https://www.tomshardware.com/uk/reviews/corsair-rm850x-v2-psu,5568-10.html>.
- Class A AV: Tekbox, "Pre-Compliance Conducted Emission Measurements"
  (search snippet only),
  <https://cdn.shopify.com/s/files/1/0094/4878/3972/files/Pre-Compliance_Conducted_Emission_Measurements.pdf>.

Note: these are the AC mains port limits. CISPR 32 Ed. 2 seems to have no
DC power port conducted voltage limits (a Mean Well snippet says Ed. 3 adds
them). This is not verified.

## Artificial networks

The tool uses the nominal impedance each standard defines, not a component
schematic:

| Standard | Network | Nominal impedance |
|---|---|---|
| CISPR 25 | 5 µH / 50 Ω AN (CISPR 16-1-2 Table 5 network) | (jω·5 µH + 1 Ω) ∥ 50 Ω |
| CISPR 32 | 50 µH / 50 Ω V-AMN, 0.15-30 MHz (CISPR 16-1-2 Table 4) | jω·50 µH ∥ 50 Ω |

Sources (search snippets, not read in full):
- Tekbox TBL05100-1 and The EMC Shop LISN-CISPR25-200 describe the CISPR 25
  AN as (5 µH + 1 Ω) ∥ 50 Ω.
- CISPR 16-1-2 sample PDF (iTeh, Amd. 2): impedance tolerance ±20 % in
  magnitude and ±11.5° in phase; Table 4 is the 50 Ω / 50 µH V-AMN for
  0.15-30 MHz, Table 5 the 5 µH + 1 Ω network.

To check: the Table 4 and Table 5 magnitude rows against the formula above.
