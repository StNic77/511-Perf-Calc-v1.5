# 511 PerfCalc — Session Handoff
**Date:** 2026-05-24
**Version:** v1.7.1 — ready to deploy
**Files changed this session:** app.js, config.js, index.html, sw.js, version.json

---

## What Was Deployed as v1.7.1

### Bug Fix — Max Mass to Hover TM Panel (config.js)
The Thrust Margin correction panel was silently not applying. All four TM datasets (AI OFF 30 Min, AI ON 30 Min, AI OFF MCP, AI ON MCP) stored the TM percentage key as `pct:` but `_hovPanel3()` in compute.js reads `tm:`. Every comparison returned undefined, so the TM correction was being skipped entirely and windMass was passed through as finalMass.

**Fix:** Renamed all 16 `pct:` keys to `tm:` across the four TM curve datasets in config.js.

**Validation:** PA=2500, OAT=10, wind=12kt, TM=5% → app now returns ~14,158 kg vs hand trace 14,200 kg (delta 42 kg, within tolerance). Previous broken result was ~14,757 kg.

---

### Trace Improvements (app.js)

**Diagonal correction curves on HOGE, HLDF, Max Mass to Hover:**
- HOGE lower panel: wind correction now draws diagonally from ref line entry to wind intersection
- HLDF lower panel: same diagonal treatment
- Max Mass to Hover Panel 2 (wind): diagonal from wind ref line to wind kt intersection, then vertical to TM ref line
- Max Mass to Hover Panel 3 (TM): diagonal from TM ref line to TM% intersection, then vertical to bottom axis

**SR lower panel — right-angle steps retained (intentional):**
The SR wind correction curves are genuinely complex (U-shaped in the digitized data for high xRef entries). A diagonal trace approximation would misrepresent the curve path. Right-angle steps correctly show the entry xRef on the reference line and the final SR at the wind level without implying a straight-line path between them. A note appears in the trace summary when wind is non-zero: *"SR wind correction curves are complex — trace shows reference points only, not the curve path."*

**Max Mass to Hover Panel 1:**
Removed the vertical line from the top of the chart to the OAT/PA intersection. The trace now starts with a horizontal from the left edge to the intersection — matching how a pencil enters the chart.

**Safe Reject any-height green traces:**
When SR returns ANY HEIGHT, the chart now shows a green trace explaining why:
- *Upper panel exit* (`xRef: null`): green TV line runs off the right edge with an arrowhead. Label: `TV x.x — ANY HEIGHT`.
- *Lower panel exit* (`xRef` valid): full upper panel in green, then wind correction diagonal exits the right edge with an angled arrowhead. Label: `x ft — ANY HEIGHT` below xRef dot.
Both cases were previously showing no trace at all.

---

### Power Assurance — Copy to Clipboard (app.js, index.html)
Copy button added to the Engine Readings card header. Appears once stage 4 is reached. Captures:
- Mode (In Flight / On Ground)
- Press Alt and OAT
- Per-engine: Q%, Chart TIT, Eng TIT, Margin, PASS/FAIL

Chart TIT exported is always the mode-correct value (`r.chartTIT`) — includes ground correction when On Ground.

Button shows "Copied" for 2 seconds on success, then resets. Fallback for environments where clipboard API is unavailable.

---

### Power Assurance — Chart Band Note (index.html)
Note added to the Conditions card below "Shared across all three engines.":
*"Digitized chart bands: −1,000 to 1,000 ft and 2,000 to 4,000 ft Press Alt. Altitudes outside these bands require the paper charts."*

---

### Press Alt Label Standardisation (app.js, index.html)
"PA" renamed to "Press Alt" across all input field labels and trace summary rows:
- Pre-Take Off tab input field
- SAR Check tab input field
- Power Assurance tab input field
- Max Mass to Hover tab input field
- Climb tab input field
- Pre-Take Off tab "PA Calculator" card renamed "Press Alt Calculator"
- All trace summary label rows
- SAR Check working sheet row

Variable names, STORE keys, and compute logic are untouched — display labels only.

---

### Max Mass to Hover Working Sheet Hidden (index.html, app.js)
The working sheet card is hidden via `hidden` attribute on `#hovWorkingCard`. The `renderHoverWorking()` call is commented out in app.js. Brief card and chart traces cover the same information more clearly. To restore: remove `hidden` from the div and uncomment the call.

---

### SAR Check — Chart HOGE Auto-Update (app.js)
When HOGE source is "chart" (derived from AFM chart, not pilot-entered), the HOGE value now automatically recalculates whenever any condition changes:
- AUW, Press Alt, OAT, Wind inputs — each listener checks `hogeSource` and calls `deriveHOGEFromChart()` instead of `rerender()`
- AI ON/OFF toggle — `setAntiIce()` applies the same check

When `hogeSource === "pilot"`, behaviour is unchanged.

---

## SR Compute Accuracy — Known Limitation

Test case: AUW=13,500 kg, PA=5,000 ft, OAT=0°C, wind=10 kt, AI OFF → app returns 32 ft, hand trace 35 ft.

**Root cause investigated:** The SR lower panel wind correction curves for high xRef entries (curves "60", "70", "80") have limited wind coverage in the digitized data — they don't extend to low winds because SR exceeds 80 ft there. A compute fix was explored (returning xMax when wind exceeds a curve's coverage rather than clamping) but was rejected after broader validation showed most examples return values within tolerance. The 32 vs 35 ft delta is within chart reading variation and is conservative.

The previous 32 ft result was coincidentally close due to bug compensation between the TM bug and the SR curve boundary behaviour. After the TM fix, the SR result for this specific case is correct per the compute logic and the data as digitized.

No code change to compute.js — reverted to v1.7.0 compute.

---

## File State at Deploy

| File | Change |
|------|--------|
| `config.js` | `pct:` → `tm:` in all 4 TM datasets; version → 1.7.1 |
| `app.js` | Trace improvements; SR right-angle + note; PA copy; HOGE auto-update; setAntiIce HOGE trigger; Press Alt labels; hover working hidden |
| `index.html` | Copy button; chart band note; Press Alt labels; Press Alt Calculator; hover working card hidden |
| `sw.js` | CACHE_VERSION → v1.7.1 |
| `version.json` | 1.7.1 |
| `compute.js` | **Unchanged from v1.7.0** |

---

## What's New Text (index.html line ~65)

Editable directly in index.html between the closing `</span>` and closing `</div>` of `splash__whatsnew`. The version prefix is prepended automatically from `AC.version`.

Current 1.7.1 text:
> Trace improvements: correction curves on HOGE, HLDF, SR, and Max Mass to Hover now draw diagonally, matching how a pencil follows the chart. Safe Reject any-height conditions now show a green trace explaining why — TV or wind correction exits the chart envelope. Max Mass to Hover Thrust Margin correction bug fixed: TM panel was silently not applying, results are now correct. Power Assurance: Copy to Clipboard button captures conditions and all three engine results in a format ready to transcribe to MRS or email. Chart band note added (−1,000–1,000 ft and 2,000–4,000 ft digitized; other altitudes require paper charts). Press Alt label standardised across all tabs. Max Mass to Hover working sheet hidden; brief card and chart traces cover the same ground more clearly.

---

## Key Principles (standing)

- DA-collapse insufficient for TV AI ON — true 2D (PA, OAT) interpolation required
- Raw WPD-Y values must be stored for wind conversion panels — no pre-conversion during CSV parsing
- Curve sort order matters — ascending by TV for HLDF AI ON upper panel
- AEO derives from rounded OEI — matches FE hand-derivation convention
- version.json must never appear in SW ASSETS list
- Commit regularly — rapid iteration without commits creates version ambiguity
- Climb trace: pixel calibration must use measured image coordinates, not WPD real-world values
- Each climb chart figure needs independent pixel calibration
- OAT axis: AEO AI OFF climb charts have compression in 45→40°C segment — three-point piecewise
- ISA+25 is the hot boundary on all 8 climb chart variants — hard reject
- SR wind correction curves are U-shaped for high xRef entries — diagonal trace would misrepresent the path, right-angle steps are correct
- TM curve data key must be `tm:` — compute reads `.tm`, config must match
- Chart HOGE auto-recalculates when source is "chart" — all condition inputs and AI toggle trigger `deriveHOGEFromChart()`

---

## Next Session Priorities

1. **QA harness** — qa.html was not rebuilt after v1.6.16. Needs climb tab cases, any-height SR/HLDF cases, Max Mass to Hover TM cases, and boundary condition coverage. Flag gaps as "structural test only" where no validated reference exists.
2. **SAR Check Performance Brief tab** — charts are fully digitised. Tab is a placeholder. Needs implementation.
3. **Version control hygiene** — commit 1.7.1 before starting next feature work.

---

## Files to Upload at Next Session Start

- `app.js`
- `config.js`
- `compute.js`
- `index.html`
