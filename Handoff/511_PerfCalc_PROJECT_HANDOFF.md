# 511 PerfCalc — Complete Project Handoff

**Prepared:** 2026-07-29
**Prepared by:** Shawn (Flight Engineer, project originator) with Claude (AI development assistant)
**Purpose:** Complete transfer document for whoever picks up development next — whether continuing the -511 app, building the -615 sibling app, or simply maintaining what exists. Written to stand alone, without requiring the reader to dig through prior session files.

---

## 1. What This Project Is

The **511 PerfCalc** is a standalone, offline-capable Progressive Web App (PWA) that digitizes CH-149 Cormorant (-511 variant) Aircraft Flight Manual (AFM) performance charts into interactive JavaScript calculations. It replaces manual paper-chart tracing with software that performs the same nomogram interpolation math a trained Flight Engineer (FE) would do by hand — nothing more.

It is built for real operational use: SAR Check performance briefs, pre-takeoff briefs, power assurance checks, and climb performance planning, used by Flight Engineers on actual missions. It is currently pursuing **Operational Airworthiness Clearance (OAW)** through formal channels — this is not a hobby project or prototype, it is aimed at fleet-wide operational authorization.

A **Weight & Balance (W&B) app** exists as a sibling/reference build in the same architectural family. A **-615 performance app** is the intended long-term successor once the CH-149 fleet transitions to the -615 variant; the -511 app is explicitly designed to also serve as a training tool building FE muscle memory ahead of that transition.

### Why this document exists

The project originator (Shawn) is stepping back from active development. This document is written so a new developer — with or without an AI coding assistant — can pick up the codebase, understand every architectural decision and *why* it was made, avoid re-making mistakes that were already found and fixed, and continue toward OAW clearance or begin the -615 build with the accumulated lessons already in hand.

---

## 2. People & Institutional Context

- **Shawn** — Flight Engineer, project originator, sole author of chart digitization work, holds all domain/operational ground truth. Not a professional software developer; directed all development via an AI coding assistant (Claude).
- **SARSET Pilot** — submitting the OAW clearance request on the app's behalf.
- **SSOSAR** (under Director Fleet Readiness, 1 Canadian Air Division) — the standards authority the OAW package is headed toward.
- **Senior standards pilots and FEs** — have reviewed and endorsed the app; fleet-wide buy-in from standards personnel already exists.
- **DTAES** — auditing Structural/Systems Maintenance Manuals (SMMs) against Flight Manuals, with the rule that data in Flight Manuals shall not be recreated in SMMs. This audit surfaced a significant safety-relevant finding — see §9.

**Key operational fact:** this app is not intended to be more precise than the hand-procedure it replicates. Matching the FE's paper workflow — including its known simplifications — is a deliberate design goal, not a limitation to be engineered away.

---

## 3. Architecture (Read This Before Touching Code)

### 3.1 Technology choices — and why

- **Static HTML/CSS/JS. No framework. No build step.** Chosen because the app must run offline on an iPad, potentially from a home-screen shortcut, maintained by a single non-programmer custodian. A build pipeline would add complexity with zero operational benefit. **Do not introduce a framework or bundler without a very deliberate, separately-discussed decision** — this is a standing architectural rule, not an oversight.
- **PWA with service worker (`sw.js`).** Solves a real problem: Safari fails on refresh with no connectivity unless a service worker is present, even though the app needs no network to function.
- **Strict file separation:**

| File | Role |
|---|---|
| `config.js` | All aircraft/chart data. No logic. |
| `compute.js` | Pure math functions only. No DOM access, no side effects. |
| `app.js` | UI, state management, rendering. Calls compute functions. |
| `index.html` | Structure only. |
| `styles.css` | Presentation only. |
| `sw.js` | Service worker, cache management. |
| `qa.html` | Automated test harness against `compute.js`. |

This separation means chart data can be updated without touching logic, compute functions are independently testable, and a non-programmer custodian can safely update `config.js` for a new AFM edition.

- **STORE-driven render pattern.** All session state lives in a global `STORE` object. `showTab()` and `rerender()` are the only two render entry points and always render full current state — there is no partial-update logic. This eliminated an entire bug class where individual DOM updates fell out of sync. Known gotcha: `rerender()` must also call `syncAntiIceButtons()` or the AI toggle pill goes stale across tab switches.

### 3.2 Recurring CSS trap (will bite again if not remembered)

`.tab-panel { display: flex }` overrides the browser's default `[hidden] { display: none }` because class and attribute selectors share specificity and the class rule comes later in the cascade. **Fix pattern:** always add an explicit `.tab-panel[hidden] { display: none }` override. This same trap applies to any component using both a flex/grid display class and the `[hidden]` attribute — check for it whenever a "should be hidden but isn't" bug appears.

### 3.3 PWA / service worker rules (standing, never violate)

- `version.json` must **never** appear in the service worker's ASSETS cache list — it must always be fetched live so the app can detect available updates. Every other asset is cached.
- `CACHE_VERSION` (in `sw.js`) must be bumped on **every** push — iOS's service worker update behavior depends on this.
- Confirmed field update cycle on iOS: open app while connected → swipe away (force close) → reopen. If the splash "Enter" button is unresponsive, that's the signal a new version is available and a relaunch is needed.
- The orange "connect to Wi-Fi" banner is a genuine degraded-connection indicator, **not a code bug** — confirmed via field diagnostic. Always check data connection quality before assuming this is an app defect.

### 3.4 The wider app family (shared conventions)

The -511 app shares a visual/architectural language with a sibling W&B Calculator app, and this convention is intended to extend to a future -615 app:

- **Data lives in `config.js`, referenced by ID, never duplicated by value.** E.g., an item references a stowage location by ID and the arm is looked up from the stowage table — never copied inline. Prevents drift.
- **No external runtime dependencies.** Libraries (e.g. jsPDF) are saved locally in the app folder and loaded from there — no CDN calls, no Google Fonts, no analytics, no tracking. The app must work fully offline from a locked-down EFB or thumb drive.
- **Every critical operation is error-trapped with a hard cap and a user-facing explanation** — not just at calculation time, at every input. Pattern: clamp the value, update the field, alert the user with the specific reason.
- **The app produces a record, not just an answer.** PDF output (via jsPDF, `PDFContext` class pattern) is the actual deliverable — same document feeds the screen and the printed/saved record.
- **A custodian can maintain data without touching code**, via a password-gated Editor tab that edits `AC.*` config sections and persists to `localStorage`.
- **Dark theme is default**; CSS custom properties (not hardcoded hex) drive all component colors so light-theme override works automatically. Full palette is in `APP_FAMILY_SYNOPSIS.md` (§4.2) if that file is retained — see §12 below for what to preserve.
- **File layout template** for any new app in the family: `index.html`, `styles.css`, `config.js`, `compute.js`, `render.js`/`app.js`, `pdf.js`, `editor.js`, `app.js`, vendored libs, `PROJECT_NOTES.md`, `.git/`. Script load order matters: external libs → config → compute → pdf → editor → app (boot last).

---

## 4. Core Domain Physics & Conventions (Do Not Re-Derive These)

These are hard-won, validated facts about how the CH-149-511 performance charts and FE brief procedure work. Getting any of these wrong silently breaks correctness.

- **OEI / AEO-Equivalent relationship:** `3 × AEO-Eq = 2 × OEI`, i.e. `AEO-Eq = OEI × 2/3`. AEO-Eq is **never digitized separately** from its own chart — it is always derived from OEI.
- **AEO is derived from the *rounded* OEI integer**, not the raw computed OEI value. This deliberately matches how an FE reads a rounded number aloud and mentally derives AEO from it — using the more "precise" raw value would produce results that diverge from what a human would get by hand, undermining trust in the app even though it would technically be more accurate. **Rounding happens before the AEO computation, not after.** This is logged in `PERF_APP_DESIGN.md` specifically to prevent future reversion.
- **AI ON penalty (standing hand-procedure, currently unresolved — see §9):** `AI ON = OEI − 8`. As of the most recent session (2026-07-27), this flat −8 constant has been found to be **non-conservative** against current AFM Rev 11 data by roughly 5–7 %Q. This is a live, unresolved fleet-procedure question, not yet an app change. See §9 for full detail — this is likely the single most important open item for whoever inherits this project.
- **The reference line is always the mandatory computational entry point** in any nomogram chain — correction always travels from the reference line toward the actual AUW, in either direction as needed.
- **TV (Transfer Value) AI ON and AI OFF are both true 2D (PA, OAT) lookups.** An earlier DA-collapse approach (reducing PA+OAT to a single density-altitude value first) was found to introduce systematic error and was explicitly replaced — do not reintroduce DA-collapse for TV.
- **OAT axis non-linearity exists on some charts.** Example: AEO AI OFF climb charts have a physically doubled/compressed segment between 45°C and 40°C on the printed OAT axis. This requires piecewise linear interpolation using intermediate gridline anchors, not just the axis endpoints — endpoint-only calibration produced a systematic ~2°C error (see §5.3 for the specific fix and numbers).
- **Right-side chart boundary on climb charts is a single OAT-interpolated boundary curve**, not per-PA-curve ceilings. Stored as a `rightBoundary` array of `{oat, roc}` points, hand-read off the chart along a reference line at the termination of each PA curve.
- **`exitedLeft` flag** is needed for correction lines that terminate before reaching the target AUW — without it, the compute silently extrapolates past where the chart actually has data.
- **ISA+25 is the hard hot-side OAT limit on all 8 climb chart variants:** `isaTemp = 15.0 - 2.0 * (pa / 1000)`. Any input above ISA+25 for the given PA is out of envelope and must be rejected/flagged, not silently computed.
- **Trace pixel calibration must store actual pixel positions measured from the chart image**, never real-world chart values (°C, ft/min, kg). These are two unrelated coordinate systems. An early bug stored WPD real-world values as if they were pixel coordinates, producing traces that rendered entirely off-canvas. Each of the 8 climb chart figures required independently measured pixel anchors — a shared/group calibration did not work because image placement varies per figure.

---

## 5. Data Digitization — Process, Rules, and Known Failure Modes

### 5.1 Tooling

**WebPlotDigitizer (WPD)** — browser-based tool, calibrated against known printed axis values (endpoints *and* intermediate gridlines where available), then traced curve-by-curve. Exports (x, y) pairs per curve as CSV.

### 5.2 Standing data-integrity rules (never violate)

- **No manual data insertion into chart datasets.** Every value must come from WPD digitization — no hand-typed "round number" points, ever, even to smooth a curve or fill a gap.
- **Knee regions and inflection points require dense click sampling** in WPD (every 1–2°C where curves bend sharply), not the coarser 8–15-points-per-curve default used on straight sections.
- **Config data must never be manually retyped between files.** The generated data block goes from WPD export → generation script → pasted directly into `config.js`. Manual transcription has caused real corruption events (see §5.4).
- **Raw WPD-Y values must be stored for lower-panel wind axes — never pre-converted to physical units during CSV parsing.** If wind-panel Y-values are converted to knots at parse time, they get double-converted when `compute.js` applies its own transformation at runtime. This exact bug was found and fixed in HLDF and SR AI ON lower panel curves in May 2026.
- **A 1 %Q delta is NOT within tolerance for this application.** Do not accept "close enough" on power/torque values — this app supports real operational decisions.

### 5.3 Calibration lessons already paid for

- **Fig 4-77 OAT axis:** endpoint-only calibration (+45°C to −50°C) produced ~2°C systematic error. Adding intermediate anchors at 0°C and +4°C (visible gridlines) revealed real compression in the 45→40°C segment of the printed axis. A piecewise linear fit across three anchor points reduced RoC error from ~±50 ft/min to ~±23 ft/min. **Lesson: always calibrate against intermediate gridlines when available, not just axis endpoints — printed charts are not always linear.**
- **Power Assurance TIT axis:** WPD-Y to °C conversion `TIT_C = 550 + (Y/50) × 400`. Eng 1&3 anchors: WPD-Y 14.97548 = 600°C, WPD-Y 45.04904 = 900°C. Eng 2 anchors: WPD-Y 14.9073 = 600°C, WPD-Y 44.97273 = 900°C.
- **Wind calibration anchors (AI ON charts), all read at the 25 kt gridline** (not 30 kt, even though max chart headwind is 30 kt — the calibration point and the chart's max value are different things):
  - HLDF AI ON lower panel: yAt0kt=2.40084, yAt25kt=−2.59218, maxKt=25
  - SR AI ON lower panel: yAt0kt=−1.39309, yAt25kt=−3.60819, maxKt=25
  - HOGE AI ON lower panel: yAt0kt=−9227.97172, yAt25kt=−19238.34197, maxKt=25

### 5.4 A real corruption event (learn from this, don't repeat it)

In May 2026, manual transcription of generated data blocks corrupted 6 of 8 lower-panel climb chart datasets — value drift between adjacent correction lines, transposed entries. The recovery discipline established afterward: post-integration, hand-read each variant's correction-line exit points from the WPD project and check against `config.js` values, tolerance ≤15 ft/min. **The rule that came out of this: never retype a generated data block by hand, ever, no exceptions.**

### 5.5 Currently in progress / outstanding at handoff

**`PWR_AVAIL_OEI_AI_OFF` re-digitization (highest-priority outstanding data item):** bad digitized data was found in this dataset — hand-inserted round-number points in the 0 PA curve's knee region (13–18°C OAT) caused a non-monotone kink and roughly 3 %Q of localized error. Full re-digitization of all 14 Power Assurance curves from the Annex B simplified chart image, using WPD with dense knee-region sampling, was decided but **had not been completed as of the last handoff**. This is the top data-quality item for whoever continues the work.

---

## 6. Compute Architecture

### 6.1 Fundamental primitives

- `interp1(points, x)` — 1D linear interpolation between digitized (x, y) points, with clamping at the ends and extrapolation warnings.
- `interp2D` / `interp2(curveFamily, x, parameter)` — for chart families of curves: find bracketing curves by the family parameter, interpolate along each, then interpolate between the two results.
- `densityAltitudeFt` and similar helpers exist for standard atmospheric conversions.

### 6.2 Nomogram chaining model

Charts with a top panel (main surface) and bottom panel (correction, e.g. wind) joined at a reference line are modeled as **two chained 2D lookups**, not an additive main-plus-delta model. This was confirmed for Height Loss (HL) and Safe Reject (SR) AI OFF charts via direct chart image review — an earlier additive assumption was wrong and was corrected. Always verify chart structure against the actual printed chart before assuming additive vs. chained — do not assume based on what a similar chart elsewhere in the AFM does.

### 6.3 Out-of-envelope / boundary handling

Two known failure modes for chart boundary detection, both handled by a single mechanism:
1. Conditions near-but-inside the chart edge produced values marginally exceeding the true boundary (~40 ft/min overshoot on RoC charts).
2. At very cold OAT where a PA curve doesn't extend far enough, clamping to the curve's coldest digitized point also overshot the true boundary.

**Fix:** a `rightBoundary` array (`[{oat, roc}]`) per AI OFF variant, hand-read as the locus of curve termini along the right edge using a reference line. After upper-panel interpolation, the raw result is checked against this boundary interpolated at the entered OAT; if it exceeds the boundary, it's clamped and an `extrapolationWarning` flag is set, surfaced in the UI as an "AT COLD LIMIT" badge. AI ON charts do not need this — their geometry is different and WPD captured clean curve termini directly.

Soft boundaries (result returned with a warning, not rejected): OAT below ISA−40 sets `extrapolationWarning`; inputs at or near digitized curve extremes propagate the same flag to the UI.

---

## 7. Application Design — Workflow & UX Conventions

### 7.1 Core design principle: replicate the paper workflow verbatim

The single most important design rule in this project: **the app mirrors the FE's existing paper working-sheet process exactly — same terminology, same row order, same brief format.** This is a deliberate "training wheels" goal: adopt the current workflow, don't improve it, until operational use has validated the baseline. A prior draft introduced a "dead-man band" concept that turned out to be an editorial fabrication not used operationally — it was removed. **If future work is tempted to introduce new terminology or reorder things for UI polish, don't, until the FE community has explicitly signed off.**

### 7.2 Fixed working-sheet row order (non-negotiable)

```
TV
AUW
PWR
HOGE
HL
SR
PA
TEMP
WIND
```

This is the order FEs read from muscle memory on the current paper sheet — not alphabetical, not grouped, not "improved." Preserving it is why the app is trusted.

### 7.3 Fixed brief-string format

- **SAFE OEI:** `AUW / PWR / HOGE / SAFE OEI`
- **NOT SAFE OEI:** `AUW / PWR / HOGE / NOT SAFE OEI / HL / SR`

Slash-separated, numerical values only (no units — pilots know the units), produced verbatim by the app and read back over intercom. A copy-to-clipboard affordance is appropriate; the PDF reproduces this string prominently.

### 7.4 Inputs (Vertical Ops workflow)

Five pilot-supplied values, all editable fields: **AUW, PA, TEMP, WIND (always headwind component — the FE resolves crosswind to headwind before entry, the app does no vector math), HOGE.**

**HOGE is an editable input, not a pure computed output** — pilots own this number from the aircraft computer; the FE types it in. A "calculate from chart" affordance can derive it from the AI-appropriate HOGE chart as a cross-check, populating the field, which the FE can accept or overwrite. Whatever ends up in the field — computed or pilot-supplied — is what drives the downstream SAFE OEI decision.

### 7.5 Anti-Ice (AI) state

Session-global, not per-calculation — set once (Home tab or header pill), every calculation reads `STORE.antiIce`. Changing it triggers recalculation of all visible results. **Power Assurance locks AI to OFF** — enforced by the app, not just advisory — because AI ON is not a valid power-assurance condition.

### 7.6 Power Assurance specifics

- Two PA bands, separate chart data: 0–1,000 ft and 2,000–4,000 ft.
- Engine groups: Engines 1 & 3 share a chart; Engine 2 has its own.
- Ground TIT corrections applied in `compute.js` (not baked into config data): +5°C for Engines 1 & 3, +2°C for Engine 2. Applied to both PA bands.
- AI locked to OFF, enforced.

---

## 8. Validation Methodology

### 8.1 Primary method: hand-trace comparison

For every chart variant, computed results are checked against values an FE hand-traces from the physical chart, independently of the software. Acceptable tolerance on RoC charts: ±20–30 ft/min. **Established validation cases** (reproduce these if the compute engine is ever refactored):

| Tab | Chart / Variant | PA | OAT | AUM | Expected | Method |
|---|---|---|---|---|---|---|
| Climb Performance | 4-77 aeo_30min_ai_off | 9,000 ft | +14°C | 14,000 kg | 1,120 ft/min | AFM worked example |
| Climb Performance | 4-77 aeo_30min_ai_off | 5,000 ft | −15°C | 10,500 kg | ~3,100 ft/min | Hand-trace |
| Climb Performance | 4-79 aeo_mcp_ai_off | 8,000 ft | −10°C | 13,500 kg | ~1,840 ft/min | Hand-trace |
| Climb Performance | 4-84 oei_30min_ai_off | 5,000 ft | −15°C | any | 1,680 ft/min (boundary) | Hand-trace |
| SAR Check Perf Brief | TV AI ON | PA=2000, OAT=−2 | — | 14,000 kg | 9.1 (chart: 9.0) | Hand-trace |
| SAR Check Perf Brief | Height Loss during Flyaway | PA=2000, OAT=−2 | — | 14,000 kg | 184 ft (chart: 180) | Hand-trace |
| SAR Check Perf Brief | Safe Reject | PA=2000, OAT=−2 | — | 14,000 kg | 33 ft (chart: 33) | Hand-trace |

### 8.2 QA harness

`qa.html` runs 128 automated tests across 12 suites against `compute.js`, no UI interaction required. Covers normal-case accuracy, boundary detection, edge cases (reference-line mass exactly, extrapolation at coldest valid OAT), and regression coverage for every previously discovered bug. **Outstanding item:** Climb tab QA harness test cases still need to be added (identified as future work, not yet done as of last handoff).

### 8.3 Visual trace overlay

Every calculation renders a visual trace on the chart image showing the path the app followed from inputs to result — a geometric sanity check. Currently: HLDF, SR, TV, and HOGE tabs draw right-angle step segments; the Climb tab already draws proper diagonal correction curves matching real chart geometry. **Outstanding item:** apply the diagonal-drawing approach to the remaining tabs (display refinement only, does not affect computed values).

---

## 9. ⚠️ The Most Important Open Issue: AI ON Penalty Discrepancy

This is the single highest-priority substantive item for whoever inherits this project — it is a **fleet safety/procedure question**, not just a software task, and needs to be resolved with standards before any app code changes.

### 9.1 Background

DTAES is auditing SMMs (Structural/Systems Maintenance Manuals) against Flight Manuals under a rule that data in Flight Manuals shall not be recreated in SMMs. Annex B (SMM 60-149-1000 CH 6, a Westland-era engine performance chart) is potentially in scope. While comparing AFM Rev 11 charts against Annex B for this audit, a significant discrepancy was found in the AI ON penalty.

### 9.2 Finding 1 — Fig 4-61 (OEI Torque Available to Hover, AI OFF) is Annex B data, clamped

Three hand-traced comparison points showed Fig 4-61 matches Annex B exactly where unclamped, and diverges only where engine capability exceeds the 125% MGB (main gearbox) 2.5-minute contingency rating — a transmission limit, not an engine limit. Annex B contains capability data ("regardless of transmission limits") that the Flight Manual's clamped chart simply does not — meaning the FM cannot answer "what will the remaining engines actually deliver if I lose one" in the transmission-limited region.

### 9.3 Finding 2 — the AI ON penalty is actually ~13–15 %Q, not the briefed 8

Using the unclamped engine value as baseline, at three hand-traced points the actual measured penalty between AI OFF and AI ON & RIPS ON configurations was 13, 13, and 15 %Q — against a hand-procedure that assumes a flat −8. **The current fleet hand procedure is optimistic by roughly 5–7 %Q in icing conditions** — a crew planning an icing departure using Annex B −8 believes they have more OEI reserve than the AFM's min-spec engine will actually deliver. This is in the wrong direction for a conservative safety margin, and needs to go in front of standards as a fleet procedural issue, independent of the Annex B audit-source question.

### 9.4 Working hypothesis — why the gap exists

RIPS (rotor ice protection system) is **electrical, not bleed air** — it doesn't rob air from the engines the way anti-ice bleed does. The hypothesized load path: heavy electrical demand → generators under load → increased horsepower extraction from the accessory/gear train → reduced torque available at the rotor. So the total AI & RIPS ON penalty may decompose as: `8 (engine AI bleed) + ~5–7 (RIPS electrical → generator HP extraction)`. This is currently a hypothesis from 3 data points plus systems knowledge — a full digitized delta surface (see next section) would show whether the penalty is flat (consistent with a fixed electrical load on top of a bleed penalty) or varies with OAT/PA (bleed penalties typically grow hot/high; generator load should be roughly constant).

### 9.5 Candidate resolutions (for discussion with standards — NOT app changes until resolved)

1. **Revised flat constant** (e.g. −14 or −15) — keeps hand-procedure simplicity, only defensible if the digitized delta surface is flat within ~1 %Q.
2. **Two-term penalty** — `−8 (engine AI) − X (RIPS)`, applied per system actually ON. More honest, more brief complexity.
3. **Digitize Fig 4-62 (AI & RIPS ON) directly** as its own dataset — most accurate but ties the app to Rev 11 and inherits its 125% clamp, losing the capability information Annex B currently preserves.
4. **Hybrid (currently assessed as the strongest technical answer):** keep Annex B (unclamped capability) as the AI OFF basis, derive the AI ON penalty from a digitized (baseline − Fig 4-62) delta surface. Preserves capability information *and* uses the accurate Rev 11 penalty. Open question: whether Annex B as a source survives the DTAES audit.

### 9.6 Standing rule — reaffirmed and must not be violated

**The app does not change its math ahead of the fleet procedure.** Whatever the fleet ultimately briefs as the correct procedure is what the app computes — the app follows standards decisions, it does not get ahead of them, however clear the technical case looks.

### 9.7 The planned next step (work that was queued but not yet done at handoff)

A full digitization comparison was planned:
- **Digitize** all PA curves of Fig 4-61 and Fig 4-62 (dense sampling every 1–2°C through knees and along the bend into the 125% clamp vertical; record the clamp-onset OAT explicitly per PA curve).
- **Digitize** the remaining Annex B curves (ties into the already-outstanding 14-curve Power Assurance re-digitization in §5.5 — combine sessions if practical).
- **Build a comparison script** (Node, QA-harness style pattern) walking a dense (PA, OAT) grid across the shared envelope (500 ft × 2°C, finer at 1°C in the 10–25°C low-PA clamp-transition band), computing Annex B value, Annex B−8 (current procedure), Fig 4-61, Fig 4-62, the derived penalty, and the delta between current procedure and reality at each grid point.
- **Outputs:** CSV (machine-readable), markdown table, and summary stats (worst case, mean, fraction of envelope where −8 remains adequate, worst-case conditions) — feeding directly into the OAW technical package's validation/conservative-directionality section, and into a standards submission on the AI ON penalty independent of the audit.
- **Ground rules:** Fig 4-61/4-62 CSVs are evidence datasets for this analysis — they are **not** operational app data and must not go into `config.js`; keep them in a separate analysis folder with no provenance mixing. All standard data-integrity rules (§5.2) still apply. Fig 4-64 (AI & RIPS ON **+ ECS ON**) is not bleed/load-matched to Fig 4-62 and must not be used as a ×2/3 check pair against it — Fig 4-63 (AI OFF/ECS OFF) is the valid check pair for Fig 4-61.

### 9.8 Files needed to resume this specific work

- Fig 4-61 WPD export CSV(s) + calibration anchors
- Fig 4-62 WPD export CSV(s) + calibration anchors
- Annex B re-digitization CSV (if the §5.5 work is done by then)
- A clamp-onset OAT list per PA curve, for both Fig 4-61 and Fig 4-62
- The original 2026-07-27 session handoff, if retained (see §12)

---

## 10. Version History Summary

| Version | Key changes |
|---|---|
| Early builds (Apr 2026) | Static HTML/CSS/JS scaffold, tab structure, design tokens, STORE-driven render pattern |
| ~1.0 (Apr 2026) | Power Assurance tab (Annex B backed), AI toggle, tab switching, CSS specificity fix, AEO rounding convention established |
| ~1.3–1.5 (Apr–May 2026) | TV AI OFF digitized/wired, HOGE AI OFF digitized, HLDF/SR AI OFF integrated, nomogram-chaining model confirmed, PWA service worker added |
| 1.6.16 (May 2026) | All Pre-Takeoff/SAR Check charts (TV, HLDF, SR, HOGE) AI ON + AI OFF integrated; TV AI ON rebuilt as true 2D (PA, OAT); mid-band PA charts wired; Fuel Management tab; QA harness (128 tests, 12 suites) |
| 1.7.0 (May 2026) | Climb Performance tab (8 chart variants: AEO/OEI × MCP/30Min × AI ON/OFF, Figs 4-77/4-79/4-80/4-82/4-84/4-85/4-87/4-88); out-of-envelope boundary detection; ISA+25 hard reject; right-side boundary curve; per-figure pixel trace calibration; OAT axis piecewise correction |
| 1.7.1 | Trace diagonal drawing (Climb tab) |
| 1.7.2 | TV AI OFF 2D rebuild + resampling snap fix |
| 1.7.3 (most recent deployed version) | Fixed bad hand-inserted data in `PWR_AVAIL_OEI_AI_OFF` 0 PA curve knee region; decided full 14-curve Annex B re-digitization is needed (not yet done); added "→ All" button to Power Assurance engine card headers |
| Post-1.7.3 (2026-07-27 session) | **Analysis only, no app changes.** AFM Rev 11 vs Annex B comparison; AI ON penalty discrepancy discovered (§9). App remains at v1.7.3. |

---

## 11. Outstanding Work — Prioritized

1. **AI ON penalty resolution (§9)** — safety-relevant, needs standards input before any app change. Digitization comparison work is the immediate next technical step, independent of the standards conversation.
2. **`PWR_AVAIL_OEI_AI_OFF` re-digitization (§5.5)** — all 14 Power Assurance curves from the Annex B simplified chart, dense knee-region sampling. Top data-quality item.
3. **OAW technical package** for the SSOSAR/SARSET submission — must cover methodology, math, clamping/out-of-envelope logic, limitations, accuracy validation, conservative-directionality of known errors, and the full validation chain (what bench testing missed vs. what operational beta testing caught). The existing QA harness and hand-trace validation results are directly usable evidence. The §9 findings belong in this package's conservative-directionality section regardless of which side of the Annex B audit question prevails.
4. **CHANGELOG** — was offered as a deliverable at the v1.7.0 milestone; draft from full session history when someone has time.
5. **Trace diagonal-drawing** — extend from Climb tab (already done) to HLDF, SR, TV, and HOGE tabs. Display-only, no compute impact.
6. **Climb tab QA harness test cases** — need to be added to `qa.html`.
7. **PA Certificate (PAC) feature** — parked for a future standalone build in a separate folder. Captures In Flight/On Ground status, Flight Segment (from MRS), Press Alt, OAT, per-engine Torque, Chart TIT, Engine TIT, TIT Margin. FE manually enters actual Engine TIT; app computes the rest.
8. **Reverse-solving in Hover Performance** (given on-site mass, solve for maximum density-altitude ceiling) — deferred pending pilot consultation on whether this is operationally wanted.

---

## 12. What to Preserve From This Project (Export Checklist)

If continuity depends on files rather than institutional memory, prioritize preserving:

1. **All source files**: `index.html`, `app.js`, `compute.js`, `config.js`, `styles.css`, `sw.js`, `version.json`, `qa.html` — already in Git (`StNic77/511-Perf-Calc-v1.5` on GitHub Pages), so this should already be safe, but confirm a final `git pull` matches the last deployed version.
2. **`PERF_APP_DESIGN.md`** — living design log with the full decision history, chart scope (9 Tier-1 charts), UI mockups for every tab, and an open-questions list that documents what's still genuinely unresolved vs. settled.
3. **`APP_FAMILY_SYNOPSIS.md`** — the cross-app architectural conventions (color palette, component inventory, PDF pattern, editor pattern) that a -615 app or any future sibling app should inherit rather than re-derive.
4. **`PerfCalc_Technical_Reference.md`** and **`PerfCalc_Operator_Briefing.md`** — the two audience-specific reference documents (technical vs operator-facing).
5. **All dated handoff files** (`511_PerfCalc_Handoff_*.md`) — each is a session-level record; together they're the only complete account of *why* specific decisions were made, especially the corruption event (§5.4) and the AI ON penalty discovery (§9), which are not fully captured anywhere else.
6. **This document** — intended as the single-file entry point for a new developer, but it is a *compression* of the above, not a full replacement. Keep the source documents too if at all possible.
7. **Raw WPD digitization assets** — WPD project/calibration files and the original chart images (especially the Annex B image needed for the pending re-digitization). These live on Shawn's own machine (`C:/Users/sstni/Desktop/615 APPs/511 Charts/511 Performance Calculator/`) and are not otherwise backed up anywhere — this is the most at-risk category of asset if not deliberately copied somewhere durable.

---

## 13. A Note on Working With This Project

This app was built through an unusual but effective process: a domain expert with deep, exact knowledge of both the aircraft performance charts and the real FE hand-procedure, directing an AI assistant that wrote the code but held no independent authority over chart values or procedure interpretation. Every number in this app has been checked against a hand trace by someone who has actually flown the procedure. That discipline — never accept a plausible-looking number without checking it against the physical chart or the person who reads it operationally — is the reason this app has fleet-wide standards buy-in and is headed toward formal clearance. Whoever continues this work, human or AI-assisted, should preserve that discipline above all else: **the chart and the operational procedure are ground truth; the software is a faithful translation of them, never an improvement on them, until the people who fly with it say otherwise.**

---

*End of handoff document.*
