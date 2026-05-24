# 511 PerfCalc — Session Handoff
**Date:** 2026-05-22
**Version:** v1.7.0 — deployed
**Working files:** config.js, compute.js, app.js, index.html, styles.css — all at v1.7.0

---

## What Was Deployed in v1.7.0

### Climb Performance Tab — complete
- Rate of Climb at 75 KIAS, AEO and OEI, MCP and 30 Min Intermediate
- 8 chart variants digitized and validated: Figs 4-77, 4-79, 4-80, 4-82, 4-84, 4-85, 4-87, 4-88
- AI ON/OFF driven by global toggle
- Card layout: AEO and OEI as primary cards, MCP and 30 MIN nested within each
- Out-of-envelope: left edge → red CANNOT CLIMB / DESCENT EXCEEDS CHART; right edge → yellow EXCEEDS CHART
- Traces working and validated on all 8 charts

### UI Changes
- Climb result rows: bold abbreviation (MCP / 30 MIN) with full name below, large monospaced RoC value in green
- Card headers: **AEO** *(All Engines Operating)* and **OEI** *(One Engine Inoperative)* — bold abbreviation, muted full name
- Hover Performance tab renamed to **Max Mass to Hover** throughout — tab button, pull button, aria-label, footer, all comments. Internal key `"hover"` and all IDs unchanged.
- Splash screen: update hint added below Enter button — *"If this button does not respond, an update is available — swipe the app fully closed and relaunch to update."*
- What's New text updated for v1.7.0
- Author name removed from splash screen; photo alt text neutralised

### Compute Fixes
- `interpLine` now returns `{ roc, exitedLeft }` — when AUW exceeds the last digitized point on a correction line the result is `cannot_climb`, not a silently clamped value. Fixes cases where heavy AUM conditions on AI ON charts were returning small positive RoC instead of a red banner.
- ISA+25 hot boundary: hard reject on all 8 climb chart variants.
- Right-side boundary (AI OFF charts only): see below.

---

## Right-Side Boundary — Key Architecture Decision

### The Problem
The four AI OFF climb charts (4-77, 4-79, 4-84, 4-85) have a right-side chart boundary that the digitized PA curves approach but do not cleanly terminate at in the WPD data. Two failure modes:

1. **Warm-of-boundary OAT:** conditions close to but inside the chart produced rawRoC values slightly exceeding the true chart boundary — ~40 ft/min overshoot in some cases.
2. **Cold-end clamping overshoot:** at very cold OAT where PA curves don't reach, the compute clamps to the curve's coldest digitized point. That clamped roc can exceed the boundary roc at that OAT — same overshoot, different cause.

### The Fix
`rightBoundary` — a single `[{oat, roc}]` array per AI OFF chart variant, stored in config.js. This is the boundary curve traced along the right edge of the chart — the locus where each PA curve terminates. Points are the (OAT, RoC) pairs at each PA curve terminus, hand-read with a reference line.

In compute.js, after rawRoC is calculated from the upper panel, the boundary curve is interpolated at the entered OAT to get `boundaryRoc`. If `rawRoc > boundaryRoc`, it is clamped and `extrapolationWarning` is set, which surfaces as the **AT COLD LIMIT** badge.

This single check handles both failure modes — it doesn't care whether the overshoot came from a warm condition or a cold-end clamp.

### Boundary Data (hand-read, reference-line verified)

**4-77 (aeo_30min_ai_off):** OAT range 35°C to −37°C, RoC 2510 down to 2460
**4-79 (aeo_mcp_ai_off):** OAT range 26°C to −36°C, RoC 2290 down to 2240. PA_10000 does not reach boundary.
**4-84 (oei_30min_ai_off):** OAT range 30°C to −39°C, RoC 1760 down to 1600. Flat segment at 1680 from −2°C to −15°C — confirmed with reference line. −20°C = 1660.
**4-85 (oei_mcp_ai_off):** OAT range 15°C to −34°C, RoC 1740 down to 1620. PA_8000+ do not reach boundary.

### AI ON Charts
AI ON charts (4-80, 4-82, 4-87, 4-88) have no `rightBoundary` — their chart shape is fundamentally different and the WPD digitization captured the curve termini accurately. Validated and confirmed clean.

---

## Lower Panel Data — 4-77 Specific Corrections

### Correction Line Structure (4-77 aeo_30min_ai_off)
Reference line: 13,000 kg. 6 correction lines, refRoc: 800, 1200, 1600, 2000, 2400, 2600.

Key differences from 4-79:
- Reference line crossings are shifted up by ~200 ft/min vs 4-79
- L5 (refRoc=2400): starts at mass=10000, roc=3170; mass=10500, roc=3040. Does NOT start at 10500/3200 as was previously wrong.
- L6 (refRoc=2600): starts at mass=10450 (chart exit), roc=3200; mass=10500, roc=3190; then descends to 13000=2600. Lower section hand-read: 13500=2440, 14000=2290, 14500=2140, 15000=1980, 15500=1840, 15600=1800.

**Critical principle:** the interpolation corridor between L5 and L6 at light AUM (10000–11000 kg) is narrow and steep. Getting the light-end anchors right on both lines is essential — errors here cause the final RoC to be pulled toward 3200 ft/min regardless of rawRoC.

### 4-79 Lower Panel
Verified value-by-value in the previous session. Ground truth:
- 6 lines, refRoc: 400, 800, 1200, 1600, 2000, 2400
- Lower section exit points confirmed (refRoc 400 exits ~14000 kg, 800 exits ~15000 kg, 1200–2400 exit at 15600 kg)

---

## Validation Cases (confirmed passing at deployment)

| Chart | PA | OAT | AUM | Expected | Status |
|-------|----|-----|-----|----------|--------|
| 4-77 aeo_30min_ai_off | 9000 | 14°C | 14000 | 1120 ft/min | ✅ |
| 4-77 aeo_30min_ai_off | 5000 | −15°C | 10500 | ~3100 ft/min | ✅ |
| 4-79 aeo_mcp_ai_off | 8000 | −10°C | 13500 | ~1840 ft/min | ✅ |
| 4-84 oei_30min_ai_off | 5000 | −15°C | any | 1680 ft/min (boundary) | ✅ |
| 4-84 oei_30min_ai_off | 3000 | −15°C | any | 1680 ft/min (boundary) | ✅ |
| All AI ON charts | various | various | various | Within validation limits | ✅ |
| All AI OFF charts | boundary OAT | various | various | AT COLD LIMIT badge | ✅ |
| Heavy AUM AI ON | 10000 | 5°C | 14000 | cannot_climb (no positive RoC) | ✅ |

---

## Key Principles Added This Session

- **rightBoundary is a single OAT→RoC curve, not per-PA:** the right-side chart boundary is one continuous curve. Interpolate by OAT only. PA is irrelevant to the boundary check.
- **Cold-end clamping can overshoot the boundary:** when all PA curves terminate warm of the entered OAT, the compute clamps to their coldest points and can produce rawRoC above the boundary. The boundary check must fire unconditionally on rawRoC, not conditionally on OAT direction.
- **Flat boundary segments must be explicitly represented:** if the boundary roc is constant across a range of OATs, anchor points at both ends of the flat segment are required. Interpolating between points outside the flat zone will produce wrong values in between.
- **interpLine exitedLeft:** when AUW exceeds the last digitized mass point on a correction line, return exitedLeft=true. Never silently clamp — the line has left the chart.
- **4-77 and 4-79 lower panels are not interchangeable:** same chart series but different correction line geometry. 4-77 refRocs are ~200 ft/min higher at the reference line. L5 and L6 light-end anchors differ significantly.
- **AI ON chart digitization was clean:** the different chart shape (wider, flatter envelope) meant WPD captured termini accurately without boundary overshoot. No rightBoundary needed.
- **Config data must never be manually transcribed from generated blocks:** always insert generated data directly. Manual transcription corrupted data in earlier sessions.

---

## Standing Key Principles (carried forward)

- DA-collapse insufficient for TV AI ON — true 2D (PA, OAT) interpolation required
- Raw WPD-Y values must be stored for wind conversion panels — no pre-conversion during CSV parsing
- Curve sort order matters — ascending by TV for HLDF AI ON upper panel
- AEO derives from rounded OEI — matches FE hand-derivation convention
- version.json must never appear in SW ASSETS list
- Commit regularly — rapid iteration without commits creates version ambiguity
- Trace calibration: pixel coordinates as anchors, not WPD real-world values
- Each figure needs independent pixel calibration — layout varies per image
- OAT axis: AEO AI OFF charts have compression in 45→40°C segment — three-point piecewise

---

## v1.7.1 — Next Session

### Priority 1 — Diagonal Traces on Non-Climb Tabs
Currently HLDF, SR, TV, and HOGE traces draw right-angle steps (horizontal then vertical) between waypoints. The climb tab already draws diagonal correction lines correctly. Applying the same approach to other tabs would match how a pencil traces the nomogram — visually cleaner and operationally more intuitive.

**Scope:** purely a drawing change in the trace functions in app.js. No impact on computed values, config, or compute logic. Each trace function draws line segments between computed waypoints — change from step-wise to direct diagonal between entry and exit points on each panel transition.

**Approach:** identify the waypoints already computed for each trace (they are correct), then replace the horizontal+vertical segment drawing with a single diagonal `lineTo()` between each pair. The HLDF and SR lower panel wind correction is the most visually impactful change — the wind correction line on the chart is diagonal and the trace currently approximates it with steps.

### Priority 2 — QA Harness Climb Test Cases
qa.html needs climb tab test cases added covering:
- Normal cases across AI ON and AI OFF for each of the 4 power/engine combinations
- Boundary cases: AT COLD LIMIT, CANNOT CLIMB, EXCEEDS CHART, OAT EXCEEDS CHART
- Sub-reference-line AUM cases (lighter than 13000 kg AEO AI OFF, lighter than 11000 kg all others)
- Heavy AUM exitedLeft cases

### Priority 3 — SAR Check Performance Brief Tab
Pending chart digitisation. Not started.

---

## Files at Deployment

All files at v1.7.0:
- `config.js` — AC_CLIMB_PERF with all 8 variants, rightBoundary on 4 AI OFF charts
- `compute.js` — boundary check, exitedLeft, ISA+25 reject, interpLine fix
- `app.js` — climb tab, result rows, AT COLD LIMIT badge, Max Mass to Hover rename
- `index.html` — card headers, splash hint, What's New
- `styles.css` — climb result row styles appended
- `sw.js` — CACHE_NAME v1.7.0
- `version.json` — 1.7.0
- `manifest.json` — unchanged
