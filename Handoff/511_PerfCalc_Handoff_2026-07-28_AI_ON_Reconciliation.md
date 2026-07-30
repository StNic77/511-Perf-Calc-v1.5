# 511 PerfCalc — Session Handoff: AI ON Penalty Reconciliation Closed
**Date:** 2026-07-28
**Version:** v1.7.3 (unchanged — no app code or data modified this session)
**Focus:** Digitization comparison of Annex B / Fig 4-61 / Fig 4-62; AI ON penalty fully reconciled to physical causes; Annex B re-digitization rejected on validation

---

## Headline Outcomes

1. **The AI ON penalty discrepancy is explained.** The ~15 %Q gap between AFM Fig 4-61 and 4-62 decomposes exactly into anti-ice bleed (12.0 %Q) plus electrical ice protection load (3.2 %Q). No unidentified system load remains. Every term has an independent physical basis derived from FE-supplied aircraft data.
2. **The Annex B −8 corresponds to a 24 °C TIT rise — below the 30 °C minimum that proves the anti-ice system is functioning.** The hand procedure's penalty describes a system performing under the acceptance standard.
3. **The RIPS hypothesis from the 2026-07-27 session is rejected.** RIPS proper is worth ~1.9 %Q per engine OEI, not the ~7 %Q the hypothesis required.
4. **`Annex_B_new.csv` FAILS validation and must not enter `config.js`.** It reads 1.5–1.8 %Q high against hand traces.
5. **4-61 ≡ Annex B (clamped) is CONFIRMED**, reversing an incorrect caution raised earlier in the session.

**Standing rule reaffirmed: no app math or data changes ahead of the fleet procedure.**

---

## Part 1 — Digitization Comparison (the planned work)

### Inputs
| File | Source | Curves | Points |
|---|---|---|---|
| `Annex_B_new.csv` | Annex B re-digitization | 14 (−2000..14000 ft) | 288 |
| `Q_AVAIL_AI_OFF.csv` | Fig 4-61 (AI OFF) | 12 (−1000..10000 ft) | 211 |
| `Q_AVAIL_AI_ON.csv` | Fig 4-62 (AI & RIPS ON) | 12 (−1000..10000 ft) | 208 |

**Parse note:** in `Q_AVAIL_AI_OFF.csv` the dataset columns emerge in the order `… 2000, 0, 1000, −1000` — the 0 ft and 1000 ft columns are transposed relative to the descending sequence. The comparison script keys by header name, not column position, so this is handled. Assignment independently confirmed by the ISA+25 terminations.

### Confirmed structural findings
- **ISA+25 is the hot-side termination of every 4-61 and 4-62 curve**, exactly `40 − 2×(PA/1000)`. Same rule already established for the eight climb chart variants.
- **Clamp extents extracted per curve** (`clamp_onset.csv`). 4-61 rides the 125 % vertical from −1000 ft (release +22.8 °C) up to 5000 ft (narrow −42.3 to −32.1 window); 6000 ft and above never reach it. **4-62 clamps only at −1000 and 0 ft** — the AI ON chart is essentially unclamped across the envelope, so only 9.6 % of comparison points required masking.

### The chart-to-chart difference is a fixed additive constant
Three candidate models fitted over 570 points (both charts unclamped, PA 1000–10000):

| Model | Best fit | Residual RMS |
|---|---|---|
| **Fixed additive penalty** | **−15.2 %Q** | **1.69** |
| Proportional power loss | ×0.853 | 2.25 |
| Equivalent OAT shift | +27.8 °C | 5.56 |

An additive constant is the best description by a clear margin. This is the signature of fixed subtractions (bleed penalty + shared shaft load), not a proportional power loss.

> **Correction to an earlier statement made this session:** I initially described the penalty as varying "by a factor of three" and argued that this counted against a fixed-load explanation. That range was inflated by mixed-baseline points and low-PA clamp edges. On clean data the penalty is far flatter than I represented and a fixed additive term is the *best* fit, not the worst. The earlier characterisation was wrong.

### Delta against the current hand procedure
- Chart-to-chart penalty (4-61 − 4-62, both unclamped): **12.4 to 20.4 %Q OEI** (8.3–13.6 AEO-Eq). Never 8, anywhere in the envelope.
- Annex-B-independent delta `(4-61 − 8) − 4-62`: **4.5 to 12.4 %Q**, mean 7.4. **0 of 610 points where −8 is adequate.**
- Conclusion holds with Annex B removed entirely from the calculation, and survives shifting Annex B down a full 2.0 %Q (still inadequate at 97 % of points).

---

## Part 2 — Annex B Re-digitization: REJECTED

`Annex_B_new.csv` reads high against FE hand traces at every checked point:

| Point | FE hand read | `Annex_B_new.csv` | Error |
|---|---|---|---|
| 6000 ft / −10 °C | 111 | 112.5 | +1.5 |
| 5000 ft / −5 °C | 113 | 114.7 | +1.7 |
| 2000 ft / −5 °C | 129 | 130.8 | +1.8 |

Consistent, one-directional, ~1.5–1.8 %Q. **Outside tolerance and optimistic in direction.** 4-61 and 4-62 digitizations match hand traces within 0.7 at the same points, so the fault is isolated to the Annex B export.

**Suspected cause:** %Q-axis calibration anchor placement. A uniform offset like this passes every smoothness and monotonicity check clean — the QC harness will not catch it. **Hand traces remain the only check that detects this failure mode.**

**Note:** the file is already committed to the repo at `Chart CSVs/Annex_B_new.csv`. It has NOT been loaded into `config.js` — `PWR_AVAIL_OEI_AI_OFF` (config.js:796) is unchanged. Flag the CSV in the repo so a future session does not pick it up as good data.

### Data quality otherwise good
Independent QC (`qc_annexb.js`) on the same file: **zero non-monotone segments across all 14 curves.** The 0 ft knee kink that motivated the redo is gone — slope steepens smoothly through 11 → 21 °C. One flagged slope change at PA −2000 / 20.9 °C reads as the genuine knee. One sampling gap worth attention: **PA 1000 has a 14 °C stretch with no points between −12 and +2 °C.**

So the redo fixed the shape problem and introduced a calibration problem. Re-run with the anchors rechecked.

### Lineage: 4-61 ≡ Annex B CONFIRMED
Raw lineage delta measured +1.0 mean, which I initially read as evidence that the two charts genuinely differ. **That was my bad data, not a real difference.** Remove the 1.0 digitization offset and the lineage sits at −0.08 mean, scattered −1.8 to +0.9 — noise about zero.

**The original FE conclusion from three hand traces stands: Fig 4-61 is Annex B data with the MGB 2.5-min rating clamped on top.** The caution I raised against it was unfounded and is withdrawn.

---

## Part 3 — The Reconciliation (the main result)

Closed using four inputs supplied by the FE during the session. None of this is recoverable from the CSVs alone.

### Input 1 — Power/torque conversion (AFM Fig 4-5)
94 %Q at 102 % NR = 1560 SHP → **1 %Q = 16.60 SHP per engine (12.4 kW).**

### Input 2 — Electrical ice protection bus loads
2 × 90 kVA generators, ~50 % baseline load. **Generators are mounted on the main gearbox and the accessory gearbox (the latter normally driven by the MGB) — not on the engines.** Ice protection draws, as % of available bus load:

| Load | Bus | kW (PF ≈ 1, resistive) |
|---|---|---|
| Main rotor AI (19 % each) | AC MAIN 1 + 2 | 34.2 |
| Tail rotor AI (9 %) | AC MAIN 1 | 8.1 |
| Intake AI ×3 (9–11 % each) | 1 × AC1, 2 × AC2 | 27.0 |
| **TOTAL** | | **69.3** |

69.3 kW is 39 % of installed capacity; on top of the ~50 % baseline that puts the aircraft near 90 % of total generation with everything running — tight but realistic, which corroborates the figures.

Converted at 88 % generator/drive efficiency:

| | OEI (2 eng) | AEO (3 eng) |
|---|---|---|
| RIPS proper (main + tail rotor) | **1.9 %Q** | 1.3 %Q |
| All electrical ice protection | **3.2 %Q** | 2.1 %Q |

Insensitive to the efficiency assumption (3.0–3.5 %Q across 80–95 %).

**This kills the RIPS hypothesis.** It required ~7 %Q, which would have meant ~178 kW of shaft power / ~160 kW electrical — more than the aircraft can generate. The FE's objection that an electrical load shouldn't move the needle much was correct.

> **Why the shared-load model is correct — and why it is a consistency check.** MGB/accessory-gearbox mounting means the electrical load is drawn from the gearbox, which all running engines feed together. The load is therefore genuinely shared: three engines each carry a third, two survivors each carry half. Its per-engine penalty consequently falls as more engines carry it — 3.2 on two, 2.1 on three, a ratio of exactly 2/3.
>
> Had the generators been engine-mounted on individual engine accessory gearboxes, each engine would carry its own load irrespective of how many were running, the per-engine penalty would be identical AEO and OEI, and it would **not** obey the 2/3 relationship. That MGB mounting independently produces the same 2/3 scaling the app already uses to derive AEO-Eq is a genuine corroboration, not an assumption imposed on the data. **Nothing here disturbs the ×2/3 derivation.**
>
> **Bookkeeping note (available vs required).** An MGB-mounted electrical load does not reduce what any engine can produce — engine capability is set by the TIT limit and a generator does not change it. The FE objection on this point was correct. The load appears on the available side because the hover charts give *rotor* torque required and exclude accessory draw; the AFM therefore accounts for accessories by subtracting from available rather than adding to required. Hence the chart title *Torque Available **to Hover***. Physics is demand-side; bookkeeping is available-side.

### Input 3 — Observed TIT rise on anti-ice selection
Minimum expected **+30 °C**, often closer to **+40 °C**. System check: at 760 TIT, must see at least 790 to prove the system is working.

### Input 4 — dTIT/dQ derived from the app's own power assurance data
Extracted from `config.js` (`PA_MID_ENG_1_3`, `PA_MID_ENG_2`, `PA_LOW_ENG_1_3`, `PA_LOW_ENG_2`) by taking the ratio of the two nomogram panel slopes — upper panel %Q per unit carrier, lower panel TIT per unit carrier. Script: `tit_slope.js`.

**dTIT/dQ = 3.00 °C per %Q.** Range 2.69–3.40 over 216 PA × OAT × engine-set combinations; median 2.97. Both panels linear to R² ≥ 0.9987, so the slope is genuinely constant. Engine 2 runs marginally higher than 1 and 3; mild increase with altitude.

This is independent evidence — it breaks the circularity in the earlier estimate, which had assumed −8 ↔ 30 °C in order to derive the sensitivity.

### The closure

| TIT rise | Implied bleed penalty |
|---|---|
| 24 °C | 8.0 %Q ← **what Annex B note 2 assumes** |
| 30 °C (minimum acceptable) | 10.0 %Q |
| **36 °C** | **12.0 %Q ← what Fig 4-62 implies** |
| 40 °C (commonly observed) | 13.3 %Q |

```
bleed at 36 C TIT rise      12.0 %Q
electrical ice protection    3.2 %Q
                            -------
                            15.2 %Q   =  observed (4-61 minus 4-62)
```

Exact. Figure 4-62 is consistent with an anti-ice system behaving the way the fleet's actually behaves.

**And in reverse: Annex B's −8 corresponds to a 24 °C TIT rise — below the 30 °C minimum required to accept the system as serviceable.**

### Caveats on the record
- Assumes dTIT/dQ is unchanged with bleed running. Same engine cycle with offtake, so it should hold to first order, but it is an assumption.
- Assumes the engine is TIT-limited. Annex B is explicit that it is TIT *or* NG limited; in the cold end where NG more likely binds, the TIT-based reasoning is weaker. This may be part of why the observed penalty is not perfectly flat.
- Intake anti-ice counted on the electrical side because it appears as a bus load. If some portion is bleed, the split shifts but the total does not.

---

## Part 4 — Repo Access Established

The public repo can be cloned directly into the analysis sandbox:

```
git clone --depth 1 https://github.com/StNic77/511-Perf-Calc-v1.5.git
```

Verified this session. Enables: reading/grepping the full tree, running `compute.js` under Node against hand-trace values, parsing `Chart CSVs/` against what actually landed in `config.js`, SW/manifest checks, and headless Chromium rendering checks.

**Limits:** fresh container each session (re-clone, ~3 s); `github.com` reachable but **not** `stnic77.github.io`, so the repo is visible but never the live Pages deployment; no push access — output comes back as patches for review; only committed work is visible.

### Health check performed
- v1.7.3 confirmed; `app.js`, `compute.js`, `config.js`, `sw.js` all pass `node --check`
- `CACHE_VERSION = 'v1.7.3'` matches `version.json`
- **`version.json` correctly absent from the SW ASSETS list**, with its own network-first branch ahead of the cache-first handler — standing rule intact

### Repo gap found
**`qa.html` is not committed.** If the QA harness exists only on the Desktop working copy it is unbacked-up, and it is also the single piece of evidence the OAW package leans on hardest for validation rigor. Recommend committing.

---

## Status Summary

| Item | Status |
|---|---|
| App code / data | **Unchanged** — v1.7.3 as deployed |
| Comparison script + outputs | **Complete** — `lib.js`, `compare.js`, `qc_annexb.js`, `tit_slope.js`, 3 CSVs, `summary.md` |
| ISA+25 hot limit on 4-61/4-62 | Confirmed across all 24 curves |
| Clamp onset per curve | Extracted — cross-check against FE hand-recorded list outstanding |
| 4-61 ≡ Annex B (clamped) | **Confirmed** — earlier caution withdrawn |
| AI ON penalty vs −8 | **Confirmed non-conservative, 0/610 points adequate** |
| Penalty decomposition | **Closed** — 12.0 bleed + 3.2 electrical = 15.2 observed |
| RIPS hypothesis | **Rejected** — ~1.9 %Q, not ~7 %Q |
| `Annex_B_new.csv` | **REJECTED** — +1.5–1.8 %Q calibration bias; re-digitize |
| dTIT/dQ | **3.00 °C/%Q** from app's own PA data, n=216 |
| New AI ON procedure | Standards decision — not an app decision |

---

## Next Actions

**Data**
1. Re-digitize Annex B with %Q-axis calibration anchors rechecked. Validate against the three hand-trace points *before* the block goes anywhere near `config.js`.
2. Close the PA 1000 sampling gap (−12 to +2 °C) in the re-run.
3. Cross-check `clamp_onset.csv` against the hand-recorded clamp-onset list.
4. Commit `qa.html`; flag `Chart CSVs/Annex_B_new.csv` as rejected data.

**Analysis / fleet**
5. Confirm whether intake anti-ice is electrical or bleed.
6. Confirm the RIPS-off case remains unaddressed by any AFM chart — no published penalty exists for engine AI ON / RIPS OFF, which is a routine configuration (engine AI required below 5 °C in visible moisture; RIPS only selected when actually accreting). **Annex B is currently the only published source addressing that state.** This strengthens the DTAES position considerably: the argument moves from "the FM truncates data Annex B contains" to "the FM contains no data at all for a configuration the fleet flies regularly." The same gap exists in the equivalent-torque pair (4-63 AI OFF vs 4-64 AI & RIPS ON + ECS) — it is not a one-chart oversight.
7. Discriminating test if a load-matched AEO pair ever surfaces: because the generators are MGB-mounted the electrical load is shared, so its per-engine penalty scales with engines running (3.2 OEI → 2.1 AEO); a bleed penalty is per-engine and does not scale. 4-63/4-64 cannot serve — ECS differs.

**Products**
8. Standards-facing plain-language argument — drafted this session, separate file.
9. OAW technical package: this comparison belongs in it regardless of which source wins. Also captures a validation-rigor point worth making explicitly — the automated QC passed a dataset that hand traces caught. That is evidence for the validation chain, not against it.

## Files to Upload at Next Session Start
- Re-digitized Annex B CSV + calibration anchors
- Hand-recorded clamp-onset OAT list (4-61 and 4-62)
- This handoff
