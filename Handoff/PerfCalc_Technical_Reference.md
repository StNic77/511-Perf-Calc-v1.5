# CH-149 (-511) Performance Calculator — Technical Reference
**Version 1.7.0 | For technical and engineering audiences**

---

## 1. What This Is

The CH-149 (-511) Performance Calculator is a standalone, offline-capable web application built for Flight Engineer use. It computes helicopter performance values — Power Assurance check (TIT limits), HOGE, Transfer Value, Height Loss during Flyaway, Safe Reject distance, and Rate of Climb — directly from digitized AFM chart data. It replaces manual chart tracing with a software implementation of the same nomogram mathematics.

There is no estimation, no statistical modelling, and no machine learning. Every output is produced by the same interpolation process a trained FE applies to a paper chart — implemented in code and validated against hand-traced reference values.

---

## 2. Architecture and Technology Choices

### 2.1 Static HTML/CSS/JS — No Framework, No Build Step

The app is a static web application: plain HTML, CSS, and JavaScript. No Node runtime, no build pipeline, no framework. This was a deliberate early-stage decision driven by the deployment context — the app must run on an iPad with no internet access, potentially served from a thumb drive or a home screen shortcut, and maintained by a single custodian without developer tooling. A build step would have added complexity with no operational benefit.

### 2.2 Progressive Web Application (PWA)

The app is installed as a PWA on device home screens. A service worker (`sw.js`) caches all assets on first load and serves them from cache on every subsequent request, including after refresh with no network connectivity. This solved a real operational problem: Safari without a service worker would fail on refresh when there was no signal, even though the app needs no connectivity to function.

Critical constraint: `version.json` must never appear in the service worker's ASSETS cache list. It must always be fetched live so the app can detect when an update is available. All other assets are cached.

### 2.3 File Separation

| File | Role |
|------|------|
| `config.js` | All aircraft data, chart data, constants. No logic. |
| `compute.js` | Pure math functions. No DOM access, no side effects. |
| `app.js` | UI, state management, rendering. Calls compute functions. |
| `index.html` | Structure only. |
| `styles.css` | Presentation only. |
| `sw.js` | Service worker. Cache management and offline serving. |
| `qa.html` | Automated test harness against compute.js. |

This separation was modelled on a sibling W&B Calculator app already in operational use by the same squadron. It ensures chart data can be updated without touching application logic, compute functions can be tested independently of the UI, and a non-programmer custodian can update `config.js` for a new AFM edition without risk.

### 2.4 STORE-Driven Render Pattern

All session state lives in a global `STORE` object. The two primary render functions — `showTab()` and `rerender()` — read from STORE and render the full current state. There is no partial update logic. This was chosen for simplicity and because it eliminated an entire class of bugs where individual DOM updates got out of sync with each other.

A discovered consequence: `rerender()` must also call `syncAntiIceButtons()` to keep the AI toggle pill state consistent across tab switches. This was identified and fixed during a render audit session in late April 2026.

### 2.5 CSS Architecture — Specificity Bug History

A significant early bug: all three tab panels rendered simultaneously instead of toggling. Root cause was a CSS specificity conflict — `.tab-panel { display: flex }` overrode the browser's default `[hidden] { display: none }` rule because class selectors and attribute selectors share equal specificity, and the class rule appeared later in the cascade.

Fix: add `.tab-panel[hidden] { display: none }` explicitly to `styles.css`. This pattern was already present for `.hint[hidden]` and `.engine__chartTit-note[hidden]` elsewhere in the file. Verified using headless Chromium via Playwright, confirming inactive panels dropped to zero rendered height.

---

## 3. Data Source and Digitization Pipeline

### 3.1 Source Material

All chart data originates from the CH-149 (-511) Aircraft Flight Manual (AFM) and the associated Annex B (Engine Power Available). No data has been invented, estimated, or derived from generic helicopter models.

### 3.2 Digitization Method

Charts are digitized using **WebPlotDigitizer (WPD)**, a browser-based tool that allows precise coordinate extraction from chart images. The operator calibrates WPD's axis system against known printed axis values, then traces each curve on the source chart. WPD exports (x, y) coordinate pairs in real engineering units (°C, ft/min, kg, %Q, etc.) for each curve.

**What WPD produces:**
- One dataset per curve per chart
- Each dataset is an array of (x, y) coordinate pairs sampled along the curve
- Point density is operator-controlled — typically 8–15 points per curve, higher at inflection regions
- Exported as CSV

**What is then done with the CSV data:**
- Coordinate pairs are parsed and converted into JavaScript objects
- Each curve becomes an array `[{ axis1: value, axis2: value }, ...]` in `config.js`
- Axis calibration values and metadata are recorded in `.meta.yaml` files alongside CSVs

### 3.3 Calibration Verification

WPD's axis calibration is validated against multiple known points before tracing begins. For charts where intermediate gridlines are printed, these are used as secondary calibration anchors — not just the axis endpoints.

**Example — Fig 4-77 OAT axis:**
Using only the printed axis endpoints (+45°C to −50°C) as calibration anchors produced a systematic ~2°C error across the AEO AI OFF climb charts. Intermediate anchor points (0°C and +4°C, which have visible gridlines) revealed that the physical OAT axis on the printed chart has slight compression in the upper 5°C segment (45→40°C zone). The corrected calibration uses a piecewise linear fit across three anchor points. This reduced OAT-driven RoC error from ~±50 ft/min to ~±23 ft/min on the affected charts.

**Example — Power Assurance TIT axis (mid-band charts):**
WPD-Y values for TIT were converted to °C using the calibration:
`TIT_C = 550 + (Y/50) × 400`
Eng 1&3 anchors: WPD-Y 14.97548 = 600°C, WPD-Y 45.04904 = 900°C (scale ×9.9755 °C/WPD-unit).
Eng 2 anchors: WPD-Y 14.9073 = 600°C, WPD-Y 44.97273 = 900°C (scale ×9.9782).

### 3.4 Data Integrity Controls

Manual transcription of generated data blocks into `config.js` has been demonstrated to introduce errors (value drift between adjacent correction lines, transposed entries). A corruption event in May 2026 corrupted 6 of 8 lower panel climb chart datasets through manual transcription. The established discipline is:

- WPD exports → generation script → data block inserted directly into `config.js` via copy-paste, never retyped
- Post-integration: each variant's correction line exit points are hand-read from the WPD project and checked against `config.js` values; delta tolerance is ≤15 ft/min

### 3.5 Raw WPD-Y Values for Wind Panels

A critical constraint for HLDF and SR lower panels: **raw WPD-Y values must be stored, not pre-converted.** The WPD export produces coordinates in the native axis units of the panel. If wind-panel Y-values are converted to knots during CSV parsing, they will be double-converted when `compute.js` applies its own transformation at runtime. This bug was discovered in May 2026 when HLDF and SR AI ON lower panel curves had been pre-converted, causing systematic wind-correction errors. The config stores raw WPD-Y values; compute applies the single correct conversion at runtime.

Wind calibration anchors for AI ON charts:
- HLDF AI ON lower panel: yAt0kt=2.40084, yAt25kt=−2.59218, maxKt=25
- SR AI ON lower panel: yAt0kt=−1.39309, yAt25kt=−3.60819, maxKt=25
- HOGE AI ON lower panel: yAt0kt=−9227.97172, yAt25kt=−19238.34197, maxKt=25

Note: wind calibration anchors were read at the 25 kt gridline (not 30 kt), making maxKt=25 mathematically correct for those calibrations even though the maximum chart headwind is 30 kt.

---

## 4. Compute Architecture

### 4.1 Fundamental Interpolation Primitives

All chart lookups reduce to two primitives:

**`interp1(x, xa, ya, xb, yb)`** — Linear interpolation between two known points:
```
result = ya + (x - xa) * (yb - ya) / (xb - xa)
```

**`interp2D(curves, inputA, inputB)`** — 2D interpolation across a family of curves:
1. Find the two curves that bracket `inputA` (e.g. PA curves above and below the entered PA)
2. For each bracketing curve, use `interp1` along `inputB` to find the intermediate result
3. Use `interp1` again to interpolate between the two intermediate results weighted by `inputA`

### 4.2 Chart Pattern A — Chained Nomogram (HLDF, SR, Climb)

The dominant chart pattern in the AFM is a two-panel chained nomogram. The upper and lower panels share an X-axis. Computation proceeds in two steps:

**Step 1 — Upper Panel:**
Enter the first condition on the Y-axis, move horizontally to the appropriate curve, drop vertically to a **Reference Line**. The X-value at the Reference Line is the raw intermediate result.

**Step 2 — Lower Panel:**
From the same X-position on the Reference Line, follow the correction curve family to the actual second condition. Drop vertically to the bottom axis. Read the final result.

The two panels **chain** — they do not add. The lower panel correction is a geometric transformation of the X-position, not an additive delta. In code:

```
rawResult = upperPanelInterpolation(input1, input2)
finalResult = lowerPanelCorrection(rawResult, input3)
```

For HLDF and SR, the lower panel correction variable is wind — higher headwind shifts the line left, reducing both Height Loss and Safe Reject distance, which matches physical intuition.

This architecture was confirmed by reviewing an actual HL AI OFF chart image in April 2026. Prior to that review, the design assumed an additive model (main surface + wind delta). The chained nomogram structure requires the two lookup steps to chain, not add — an important distinction for both the compute logic and the data storage schema.

### 4.3 Chart Pattern B — 2D Lookup Surface (TV AI ON)

Transfer Value AI ON cannot be reduced to a single Density Altitude-indexed lookup (DA-collapse). At cold OAT, DA is far below true PA — for example, PA=4000 ft at OAT=0°C gives DA≈688 ft. A DA-indexed lookup would serve this condition from the PA=0 ft zone of the chart, which is wrong. The error introduced by DA-collapse on the AI ON chart reached ±0.9 TV units.

The correct implementation uses true 2D (PA, OAT) interpolation across 12 digitized PA curves. DA-collapse works for TV AI OFF because that chart's curves, when plotted against DA, collapse onto a single monotone line within digitization noise — a property confirmed by computing DA for every digitized point and verifying the collapse. The AI ON chart does not share this property.

Rebuilding TV AI ON as true 2D interpolation reduced TV error from ±0.9 to ±0.11 units.

### 4.4 Lower Panel Correction Lines — Labelling Convention

The HOGE lower panel CSV columns are named `Headwind_55`, `Headwind_60`, etc. These labels caused early confusion: they do not represent headwind values. Each label represents the baseline AEO Q% required to hover at zero headwind (the reference line crossing). The curves show how that Q% changes as headwind increases from 0 to 30 kt. This was clarified in a session focused on digitizing the HOGE nomogram in April 2026 and is recorded in the project's key principles.

### 4.5 Reference Line Handling (Climb Charts)

The climb chart reference line is the mandatory computational entry point onto the lower panel correction curves. rawRoC from the upper panel always lands on the reference line first; from that intersection the correction curve is followed to actual AUW in either direction (up for lighter, down for heavier).

Reference line positions by chart variant:
- AEO AI OFF charts: 13,000 kg
- All OEI and AI ON charts: 11,000 kg (lighter baseline — failed engine or AI penalty)

Only `refMassKg` in `config.js` differs between variants; the compute logic is identical.

---

## 5. Out-of-Envelope Handling

The app does not silently clamp out-of-range inputs. Every boundary condition is detected and surfaced explicitly.

### 5.1 Hard Boundaries (Result Undefined)

- **OAT above ISA+25:** `oatMax = (15.0 − 2.0 × (pa_ft / 1000)) + 25` — hard reject, red banner. ISA lapse rate exactly 2.0°C per 1,000 ft. OAT ceiling is per-PA, computed from actual input PA.
- **Correction line left-edge exit:** AUW too heavy, RoC trace exits left of chart — `cannot_climb`, red banner.
- **Correction line right-edge exit:** `exceedsChart`, yellow advisory banner.
- **AUW above Alt AUW (15,600 kg):** immediate envelope flag.
- **`interpLine.exitedLeft`:** when AUW exceeds the last digitized mass point on any correction line, returns `exitedLeft:true`. Never silently clamps — the line has left the chart.

### 5.2 Right-Side Chart Boundary (AI OFF Climb Charts)

The four AI OFF climb charts (Figs 4-77, 4-79, 4-84, 4-85) have a near-vertical right-side boundary where the PA curve envelope terminates. Two failure modes required explicit handling:

1. Conditions near but inside the chart produced rawRoC values marginally exceeding the true boundary (~40 ft/min overshoot).
2. At very cold OAT where PA curves don't extend, clamping to the curve's coldest digitized point also overshot the boundary.

**Fix:** A `rightBoundary` array `[{oat, roc}]` stored per AI OFF variant. This is the locus of curve termini along the right edge, hand-read with a reference line. After upper panel interpolation, `rawRoC` is checked against the boundary interpolated at entered OAT. If `rawRoC > boundaryRoc`, it is clamped and `extrapolationWarning` is set, which surfaces as the AT COLD LIMIT badge. This single check handles both failure modes regardless of cause.

AI ON charts do not require this check — their chart geometry is fundamentally different and WPD captured curve termini cleanly.

### 5.3 Soft Boundaries (Result with Warning)

- OAT below ISA−40: `extrapolationWarning` flag — result returned with AT COLD LIMIT badge.
- Inputs at or near digitized curve extremes: extrapolation flag propagated to UI.

---

## 6. AEO Derivation Convention

AEO torque is derived from the **rounded OEI integer**, not from the raw computed OEI value. This matches the FE hand-derivation convention — the FE reads and speaks a rounded OEI value, then derives AEO from that spoken number. Using the raw value would produce AEO figures that diverge from what an FE would compute by hand, which would undermine confidence in the app's results even when it is technically more precise.

The rounding step is applied before AEO computation, not after. This decision is logged in `PERF_APP_DESIGN.md` to prevent future reversion.

---

## 7. Power Assurance — Chart Band Structure

Power Assurance uses two PA bands, each with separate chart data:
- Low band: 0–1,000 ft PA
- Mid band: 2,000–4,000 ft PA

Engine groups differ:
- Engines 1 & 3 (share a chart)
- Engine 2 (separate chart)

Ground corrections apply to observed TIT before comparison with chart max TIT:
- Engines 1 & 3: +5°C
- Engine 2: +2°C

These corrections apply to both PA bands and are applied in compute.js, not baked into the config data.

AI is locked to OFF during Power Assurance. This is enforced by the app, not advisory.

---

## 8. Validation Methodology

### 8.1 Primary Validation: Hand-Trace Comparison

For every chart variant, computed results are compared against hand-traced values by an FE using the physical chart independently of the software. Agreement within ±20–30 ft/min on RoC charts is considered acceptable.

**Established validation cases:**

| Tab | Chart / Variant | PA | OAT | AUM | Expected | Method |
|-----|----------------|----|-----|-----|----------|--------|
| Climb Performance | 4-77 aeo_30min_ai_off | 9,000 ft | +14°C | 14,000 kg | 1,120 ft/min | AFM worked example |
| Climb Performance | 4-77 aeo_30min_ai_off | 5,000 ft | −15°C | 10,500 kg | ~3,100 ft/min | Hand-trace |
| Climb Performance | 4-79 aeo_mcp_ai_off | 8,000 ft | −10°C | 13,500 kg | ~1,840 ft/min | Hand-trace |
| Climb Performance | 4-84 oei_30min_ai_off | 5,000 ft | −15°C | any | 1,680 ft/min (boundary) | Hand-trace |
| SAR Check Perf Brief | TV AI ON | PA=2000, OAT=−2 | — | 14,000 kg | 9.1 (chart: 9.0) | Hand-trace |
| SAR Check Perf Brief | Height Loss during Flyaway | PA=2000, OAT=−2 | — | 14,000 kg | 184 ft (chart: 180) | Hand-trace |
| SAR Check Perf Brief | Safe Reject | PA=2000, OAT=−2 | — | 14,000 kg | 33 ft (chart: 33) | Hand-trace |

### 8.2 QA Harness

A dedicated `qa.html` test harness runs 128 automated tests across 12 suites against `compute.js` without requiring UI interaction. Tests cover normal case accuracy, boundary detection, edge cases (reference line mass exactly, extrapolation at coldest valid OAT), and regression coverage for previously discovered bugs.

### 8.3 Visual Trace

Every calculation renders a visual trace overlay on the chart image — the path the app followed from inputs to result, overlaid on the chart image. This serves as a visual sanity check that the interpolated path is geometrically consistent with the chart. Trace coordinates are computed in real-world units and mapped to pixel positions using per-figure pixel calibration anchors measured directly from chart images at 100% in an image editor.

A critical lesson: trace calibration anchors must be pixel coordinates measured from the image, not WPD real-world values. The two coordinate systems are unrelated. An early implementation stored WPD real-world values (°C, ft/min) as if they were pixel coordinates, producing traces that drew entirely off-canvas.

Each of the 8 climb chart figures has independently measured pixel anchor values — shared group calibration was found not to be viable because chart image placement varies per figure.

---

## 9. Service Worker and Offline Capability

The app runs as a PWA with a service worker managing asset caching. The service worker pattern was added when it was identified that Safari would fail on page refresh with no network access — even though the app requires no connectivity to compute. A service worker intercepts fetch requests and serves all assets from cache, making the app fully offline-capable after first load.

Critical constraints:
- `version.json` must never appear in the SW ASSETS cache list — it must always be fetched live to detect updates
- Cache version is updated in `sw.js CACHE_NAME` and `version.json` simultaneously with each release
- Update procedure: if the splash screen "Enter" button is unresponsive, a new version is available — force-close and relaunch

---

## 10. Future Enhancements (Post v1.7.0)

The application is complete and validated across all current tabs at v1.7.0. The following enhancements are identified for future iterations:

- **Trace drawing improvement:** HLDF, SR, TV, and HOGE tabs currently draw right-angle step segments between waypoints. The climb tab already draws diagonal correction curves matching the physical chart geometry; the same approach will be applied to the remaining tabs. Display refinement only — computed values are not affected.
- **Hand-trace validation pass (climb AI ON/OEI variants):** Lower panel data for the 6 non-AEO-AI-OFF climb chart variants has been validated via data integrity checks. A dedicated hand-trace pass against the physical charts is scheduled.
- **PAC export:** Population of PAC fields directly from computed values. Parked pending operational validation feedback from v1.7.0 use.

---

## 11. Version History Summary

| Version | Key Changes |
|---------|-------------|
| Early builds (Apr 2026) | Static HTML/CSS/JS scaffold; tab structure; design token system; STORE-driven render pattern |
| ~1.0 (Apr 2026) | Power Assurance tab (Annex B backed); AI toggle; tab switching; CSS specificity fix; AEO rounding convention established |
| ~1.3–1.5 (Apr–May 2026) | TV AI OFF digitized and wired; HOGE AI OFF digitized; HLDF and SR AI OFF integrated; nomogram chaining model confirmed; PWA service worker added |
| 1.6.16 (May 2026) | All Pre-Take Off and SAR Check charts (TV, HLDF, SR, HOGE) AI ON and AI OFF integrated; TV AI ON rebuilt as true 2D (PA, OAT) interpolation; mid-band PA charts wired; Fuel Management tab; QA harness (128 tests, 12 suites) |
| 1.7.0 (May 2026) | Climb Performance tab (8 chart variants, AEO/OEI, MCP/30 Min, AI ON/OFF); out-of-envelope boundary detection; ISA+25 hard reject; right-side boundary curve; per-figure pixel trace calibration; OAT axis piecewise correction for AEO AI OFF charts; Max Mass to Hover tab renamed |

---

*This document reflects the state of the application at v1.7.0 deployment.*
