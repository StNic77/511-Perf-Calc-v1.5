# 511 PerfCalc — Session Handoff
**Date:** 2026-05-21
**Version:** config.js / app.js / compute.js / index.html — v1.7.0 (not yet deployed)
**Working in:** separate development folder, not impacting live v1.6.16 app

---

## What Was Accomplished This Session

### 1. Chart Data — All 8 Climb Charts Digitized and Validated

All 8 RoC chart variants digitized, analysed, and integrated into `config.js` as `AC_CLIMB_PERF`:

| Variant key | Figure | Status |
|---|---|---|
| `aeo_30min_ai_off` | Fig 4-77 | ✅ data correct, OAT calibration fixed |
| `aeo_mcp_ai_off` | Fig 4-79 | ✅ data correct, OAT calibration fixed |
| `aeo_30min_ai_on` | Fig 4-80 | ✅ data correct |
| `aeo_mcp_ai_on` | Fig 4-82 | ✅ data correct |
| `oei_30min_ai_off` | Fig 4-84 | ✅ data correct |
| `oei_mcp_ai_off` | Fig 4-85 | ✅ data correct |
| `oei_30min_ai_on` | Fig 4-87 | ✅ data correct |
| `oei_mcp_ai_on` | Fig 4-88 | ✅ data correct |

### 2. Config.js Data Integrity — Root Cause Found and Fixed

**Bug:** Session 1 generated a correct `climbPerf_config_block.js`. Session 2 manually transcribed the data into the config rather than inserting the generated block directly. This corrupted 6 of 8 lower panel datasets with wrong roc values at mass breakpoints.

**Fix:** Session 3 replaced the entire `AC_CLIMB_PERF` block in `config.js` using the authoritative generated file as source of truth. All 8 variants now verified against raw CSV data.

### 3. OAT Calibration Bug — AEO AI OFF Charts Fixed

**Bug:** `aeo_30min_ai_off` (Fig 4-77) and `aeo_mcp_ai_off` (Fig 4-79) had a systematic ~2°C OAT error. The WPD axis calibration used the printed axis endpoints (45°C / −50°C) which gave a scale of 1.000. The intermediate calibration points in the notepad docs (0°C → −2.485 raw, 4°C → +1.239 raw for Fig 4-77) reveal the true local scale is **1.074** — the physical chart OAT axis is slightly compressed relative to the printed scale labels.

**Fix:** Re-ran upperPanel OAT conversion using the intermediate calibration pair (0°C and 4°C anchors) instead of the axis endpoints. Only the upperPanel OAT values changed; all roc values and lowerPanel data unchanged.

**Result:** AEO MCP AI OFF test case (PA=8000, OAT=−10, AUM=13500):
- Before fix: 1793 ft/min (delta −47 from expected 1840)
- After fix: ~1832 ft/min (delta −8)

AEO 30Min AI OFF same test case:
- Before fix: 2061 ft/min (delta −59 from expected 2120)
- After fix: ~2097 ft/min (delta −23)

**Note:** The remaining delta is genuine chart-reading variation, not a calibration or logic issue.

### 4. Climb Tab — Core Functionality Working

- Inputs: AUM, PA, OAT with native focus/typing, ± sign toggles on PA and OAT
- AI ON/OFF toggle: syncs correctly, re-runs all four lookups via `rerender()`
- AEO card: MCP and 30 Min rows
- OEI card: MCP and 30 Min rows
- Reference charts: collapsible `<details>`, thumbnail, tap-to-fullscreen — **working**
- Validated compute results (AI OFF): OEI within ~10–23 ft/min, AEO within ~8–23 ft/min

### 5. Known Issues Carried Forward (see below)

---

## Current File State

All four files in the development folder are at v1.7.0 (undeployed):
- `config.js` — AC_CLIMB_PERF integrated, OAT calibration corrected, version 1.7.0
- `compute.js` — `_climbLookup()` and `getClimbPerf()` added
- `app.js` — Climb tab: STORE, showTab, rerender, syncAntiIceButtons, clearTab, renderClimb, trace infrastructure all wired
- `index.html` — Climb tab button + static panel added

---

## Outstanding Issues

### Issue 1 — Trace Not Drawing (PRIORITY)

**Symptom:** Clicking "Show Trace" in the fullscreen chart viewer on the Climb tab does nothing. All other tabs (HOGE, TV, HLDF, SR, HOV) are unaffected.

**Root cause identified:** `CLIMB_TRACE_CAL` stores real-world values (°C, ft/min, kg) as if they were pixel coordinates. This is wrong.

The other charts in the app (Annex B, HOGE, TV, etc.) store **actual pixel positions** as anchor points — e.g. `xOATneg45: 492` means pixel X=492 on the image. The climb charts' WPD notepad files store real-world calibration values (e.g. `45°C y=44.985`) because WPD was set to display in real units, not pixels. The `_climbOAT2py()`, `_climbRoC2px()`, and `_climbMass2py()` functions treat these as pixel coords, producing coordinates far outside the canvas.

**Fix required:**

For each calibration group (aeo_ai_off, aeo_ai_on, oei_ai_off, oei_ai_on), need **true pixel positions** of axis anchor points. These are measured by opening the `.png` at 100% in an image editor and reading pixel coordinates.

Required pixel anchors (per calibration group — charts within a group share the same layout):

```
For each axis:
  X axis (RoC):    pixel X at RoC=0 ft/min,   pixel X at RoC=max ft/min
  Y upper (OAT):   pixel Y at OAT=+40°C,       pixel Y at OAT=−30°C (or any two OAT gridlines)
  Y lower (mass):  pixel Y at mass=10,000 kg,   pixel Y at mass=15,000 kg (or any two mass gridlines)
```

**Measurement guide:**
- AEO AI OFF group (Figs 4-77, 4-79): one set of pixel anchors covers both
- AEO AI ON group (Figs 4-80, 4-82): one set covers both
- OEI AI OFF group (Figs 4-84, 4-85): one set covers both
- OEI AI ON group (Figs 4-87, 4-88): one set covers both

All chart images are 1700×2200px. If the layout is consistent across all 8 charts (same pixel positions for same axis values), a single set of 6 anchor values may cover all charts. Looking at Fig 4-88 (image shared this session), the layout appears identical to Fig 4-84/4-85. Measure one per group and check consistency.

**Once pixel anchors are provided:**
Replace `CLIMB_TRACE_CAL` in `app.js` with the correct pixel-based calibration and update the three coordinate functions accordingly. This is a straightforward substitution — no logic changes needed.

---

### Issue 2 — Right-Side Chart Boundary (PA Curve Termination)

**Observation (from session):** The PA curves on all 8 climb charts terminate at a near-vertical boundary on the right side of the upper panel. This boundary is where the chart envelope ends — higher OATs and lower PAs can still reach high RoC values at that boundary. The digitized data has points along this boundary but the termination behavior is not explicitly modeled.

**Effect:** For conditions that approach or hit this right-side boundary, the compute may clamp or extrapolate incorrectly. Currently no specific out-of-envelope flag for this condition.

**Priority:** Low — most operational conditions won't approach this boundary. Flag for tuning pass.

---

### Issue 3 — Example Verification (Fig 4-88 OEI MCP AI ON)

**Unverified case:** OAT=−10°C, PA=0 ft, AUM=13,000 kg → expected ~1080 ft/min climb.

This was cited this session as a verification case. Not yet checked against the app. The PA_0ft curve on OEI AI ON charts may also have the intermediate calibration issue (or not — the OEI/AI ON charts had <0.1°C error in the calibration check). Run this case when the trace is working to compare with a hand trace.

---

### Issue 4 — AI ON Charts Not Yet Validated

All AI ON results have been accepted based on data integrity checks against the raw CSVs, but no hand-trace validation has been done. Schedule a validation pass once the trace is drawing correctly (it will make hand-trace comparison much easier).

---

### Issue 5 — AEO Residual Delta (~23 ft/min)

AEO 30Min AI OFF still shows ~−23 ft/min vs hand-trace at the test conditions. This is within acceptable tolerance for a digitized chart but worth rechecking during a tuning pass. Add additional OAT points to PA_7000–PA_9000 curves in the −10 to 0°C zone if needed.

---

## Architecture Notes (for trace fix)

The correct pixel calibration structure used by all other trace functions in the app:

```javascript
// Example from ANNEX_B_TRACE (how it should be done):
const ANNEX_B_TRACE = {
  xOATneg45: 492,   // pixel X where OAT=-45°C axis label sits
  xOATneg40: 591,   // pixel X where OAT=-40°C axis label sits  
  xOAT40:   1373,   // pixel X where OAT=+40°C axis label sits
  yQ140:     727,   // pixel Y where %Q=140 gridline sits
  yQ70:     1287,   // pixel Y where %Q=70 gridline sits
  imgW:     1700,   imgH: 2200,
  ...
};

// Then in coordinate functions:
function _annexBPx(oat, q, W, H) {
  const sx = W / t.imgW;  // scale from natural to canvas size
  const sy = H / t.imgH;
  const rawX = /* linear interp between pixel anchors using real OAT value */
  const rawY = /* linear interp between pixel anchors using real %Q value */
  return { px: rawX * sx, py: rawY * sy };
}
```

The climb trace `CLIMB_TRACE_CAL` must follow the same pattern — store pixel positions, not real-world values.

---

## Compute Logic Notes (correct, do not change)

`_climbLookup(variantKey, pa, oat, auw)` in `compute.js`:
1. Upper panel: bracket PA, interp OAT along each bracketing PA curve → rawRoC
2. Lower panel: bracket rawRoC between correction lines, interp each line at AUW → finalRoC
3. Out-of-envelope: xMin exit → `cannot_climb`, xMax exit → `exceedsChart`

OAT calibration for compute: uses intermediate anchor pair (0°C/4°C) for aeo_ai_off charts, axis endpoints for all others — correct as-is.

---

## Key Principles (standing)

- DA-collapse insufficient for TV AI ON — true 2D (PA, OAT) interpolation required
- Raw WPD-Y values must be stored for wind conversion panels — no pre-conversion
- Curve sort order matters — ascending by TV for HLDF AI ON upper panel
- AEO derives from rounded OEI — matches FE hand-derivation convention
- version.json must never appear in SW ASSETS list
- Commit regularly — rapid iteration without commits creates version ambiguity
- **Climb lower panel: correction always begins at reference line, travels to actual AUW in either direction**
- **Climb ref line: 13,000 kg (AEO AI OFF), 11,000 kg (all others)**
- **OAT axis: −50 to +45°C (Figs 4-77/4-79 AEO AI OFF), −50 to +40°C (all other 6 charts)**
- **Trace calibration: must use pixel coordinates as anchors, not real-world values**
- **Config data integrity: always insert generated data blocks directly — never manually transcribe**

---

## Files to Upload at Next Session Start

**Upload these BEFORE any coding:**
- `app.js` (current dev version)
- `config.js` (current dev version)
- `compute.js` (current dev version)
- `index.html` (current dev version)

Then provide pixel anchor measurements for the trace calibration (see Issue 1 above), and we can fix the trace first, then move on to validation.

---

## Checklist for v1.7.0 Completion

- [x] All 8 climb charts digitized
- [x] Config data integrity verified (all 8 variants match raw CSV)
- [x] OAT calibration corrected (aeo_ai_off charts)
- [x] Climb tab: inputs, AI toggle, result cards — working
- [x] Reference charts: collapsible, fullscreen — working
- [ ] **Trace drawing** — pixel calibration needed (Issue 1)
- [ ] Fig 4-88 verification case: OAT=−10, PA=0, AUM=13000 → ~1080 ft/min
- [ ] AI ON hand-trace validation pass
- [ ] AEO residual delta tuning (optional, within tolerance)
- [ ] Splash screen update text (carried from v1.6.16)
- [ ] SW ASSETS list audited — version.json absent, climb images present
- [ ] sw.js CACHE_NAME → v1.7.0
- [ ] version.json → 1.7.0
- [ ] QA harness updated with climb test cases
- [ ] Deploy
