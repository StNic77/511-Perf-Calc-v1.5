# CH-149-511 Performance App — Session Handoff
## App version: v1.4

---

## What this app is

A local HTML/JS performance calculator for the CH-149-511 Cormorant helicopter. Runs from `file://` in Edge/Chrome. No server, no build step. Five files: `config.js`, `compute.js`, `app.js`, `styles.css`, `index.html`.

**User uploads all five current files at the start of every session. Always work from uploaded files — never assume previous session outputs made it in.**

---

## File architecture

| File | Role |
|------|------|
| `config.js` | All chart data as JS constants. Pure data, no logic. |
| `compute.js` | Pure math functions. No DOM. Reads `AC.perf.*`. |
| `app.js` | All DOM, rendering, event wiring. Reads STORE, calls compute. |
| `styles.css` | Styling only. |
| `index.html` | Tab panels, input fields, card skeletons. |

**Separation is absolute.** Never put DOM code in compute.js or data in app.js.

---

## CRLF warning — critical

All JS/CSS files have Windows CRLF (`\r\n`). index.html has LF only. String replacements in Python **must** match the correct line endings or silently fail. Always use binary file I/O. For multi-line blocks with Unicode, write to a temp `.js` file with `cat << 'EOF'`, `node --check`, then binary-insert.

---

## Annex B data architecture — single source of truth

`getAnnexBRefQ()` (used by the trace) and `getPowerAvailable()` (used by the tab display and SAR check) both read from **`AC.perf.powerAvailable.aiOff`** → `PWR_AVAIL_OEI_AI_OFF` in `config.js`.

**`ANNEX_B_PA` no longer exists.** It was removed. There is one dataset. Correct a curve in `PWR_AVAIL_OEI_AI_OFF` and both the data display and the trace update automatically.

Curves use `{x: OAT, y: %Q}` format. `interpAlongCurve(curve, oat)` is the lookup helper.

### Annex B curve validation status

41 reference points verified against the paper chart. Average error 0.25%Q. No errors ≥1.5%Q.

| Curve | Verified anchor OATs | Notes |
|-------|---------------------|-------|
| -2000ft | none — digitised only | Not yet spot-checked |
| 0ft | 10, 20, 30, 35 | Warm end verified |
| 1000ft | -40, -30, -20, 0, 10, 20 | Full range verified |
| 2000ft | 0, 10, 20, 30 | Mid/warm verified |
| 3000ft | -40, -30, -20, 10 | Cold end + OAT=10 verified |
| 4000ft | -40, -30, -10, 0, 10, 20, 40 | Fully verified |
| 5000ft | -40, -30, -20, 5 | Cold end + OAT=5 verified |
| 6000ft | -40, -30, -20, 8, 10 | Cold end + warm spot-checks |
| 7000ft | -40, -30, -10, 0, 10, 20 | Fully verified |
| 8000ft | -40 | Cold spot only — warm end digitised |
| 9000ft | none | Digitised only |
| 10000ft | none | Digitised only |
| 12000ft | none | Digitised only |
| 14000ft | none | Digitised only |

**Priority for next session**: verify 9000–14000ft curves — these are the most safety-critical OEI scenarios.

### Known boundary cases (not errors)

| Condition | App shows | True value | Notes |
|-----------|-----------|------------|-------|
| PA=2500, OAT=10 | 118%Q | 117.5%Q | Rounds up; conservative |
| PA=4600, OAT=5 | 111%Q | 110.6%Q | Rounds up; conservative |

---

## Trace system — architecture (v1.4)

### UX pattern (app-wide, all charts)
1. Chart shown as collapsed `<details>` — thumbnail hidden until expanded
2. Expanding shows **plain thumbnail only** — no trace overlay
3. Tap hint reads *"Tap to expand — trace available fullscreen"*
4. Tapping thumbnail opens **fullscreen overlay** (`openChartViewer`)
5. **Show/Hide Trace** button appears in overlay bottom-centre (gold when active)
6. Trace is OFF by default — pilot sees clean chart first, opts in to trace

### Shared factory
```javascript
buildChartDetailsWithTrace(imgEntry, traceFn, summaryFn)
```
- `traceFn(canvas)` — draws trace on a canvas overlay in fullscreen
- `summaryFn()` — returns a `.trace-summary` DOM node shown below thumbnail
- All `buildXxxChartDetailsWithTrace` wrappers call this factory

### openChartViewer signature
```javascript
openChartViewer(imgEntry, traceFn)
```
- `traceFn` optional — if provided, Show/Hide Trace button appears
- Canvas is sized to natural image dimensions, layered over img
- Toggle clears/draws the canvas; never composites to a dataURL

### Style constants (all traces)
- Black dashed line: `rgba(0,0,0,0.85)` dash [12,8]
- Gold intermediate dots: `#ffcc00`
- Red result: `#ff4444`
- White halo labels: `rgba(255,255,255,0.85)`
- All sizes scaled by `sx = CW/imgW`

### HLDF trace — out-of-envelope behaviour (v1.4)

When TV is below the chart's left edge (aircraft cannot hover AEO at this DA/AUW), `getHeightLoss` returns `{ ok: true, anyHeight: true, xRef: null, tv }`. The trace draws the TV line across the upper panel and stops — no lower panel intersection. The display shows **"HT LOSS EXCEEDS 400 ft"** (not "ANY HEIGHT" — that term is reserved for SR).

When the lower panel runs off the right edge (wind drives HL past 400ft), `xRef` is present but `hlFt` is null. Trace draws normally through the upper panel and into the lower panel as far as it goes.

`buildHLDFChartDetailsWithTrace` enables the trace whenever `tv` is present, regardless of whether the result is a clean value or anyHeight.

---

## Trace status — complete

| Chart | Tab(s) | Status |
|-------|--------|--------|
| Annex B | Pre-Takeoff, SAR Check | ✅ Done — piecewise X calibration (-45 to -40 doubled spacing), `refQExact` used for dot placement |
| HOGE AI OFF (Fig 4-67) | SAR Check | ✅ Done |
| HOGE AI ON (Fig 4-54) | SAR Check | ✅ Done |
| TV AI OFF (Fig 4-66) | SAR Check | ✅ Done |
| TV AI ON (Fig 4-70) | SAR Check | ✅ Done |
| HLDF AI OFF (Fig 4-68) | SAR Check | ✅ Done — anyHeight handled |
| HLDF AI ON (Fig 4-71) | SAR Check | ✅ Done — anyHeight handled |
| SR AI OFF (Fig 4-69) | SAR Check | ✅ Done |
| SR AI ON (Fig 4-72) | SAR Check | ✅ Done |
| Max Mass to Hover Max Cont AI OFF (Fig 4-21) | Hover | ✅ Done |
| Max Mass to Hover Max Cont AI ON (Fig 4-27) | Hover | ✅ Done |
| Max Mass to Hover 30 Min AI OFF (Fig 4-19) | Hover | ✅ Done |
| Max Mass to Hover 30 Min AI ON (Fig 4-25) | Hover | ✅ Done |
| Power Assurance — all four bands | Power Assurance | ✅ Done |
| Height Loss / Min Fwd Reject | SAR Check | ✅ Done |

---

## Pixel calibration — all charts

### Annex B (1700×2200px)
- X (OAT): x=492 (−45°C) → x=591 (−40°C) → x=1373 (+40°C)
  - Segment −45 to −40°C: **19.8 px/°C** (doubled spacing — non-linear axis)
  - Segment −40 to +40°C: **9.775 px/°C** (normal spacing)
- Y (%Q): y=727 (140%) → y=1287 (70%), k=8.0 px/%Q
- `_annexBPx(oat, q, W, H)` uses piecewise X interpolation
- `refQExact` (unrounded float) used for trace dot placement; `refQ` (rounded) for display

### HOGE AI OFF (Fig 4-67, 1700×2200px)
- X (%Q): x=446 (50%) → x=1475 (130%)
- Upper Y (DA): y=1357 (−8000ft) → y=585 (+16000ft)
- Lower Y (wind): y=1395 (0kt) → y=1781 (30kt)

### HOGE AI ON (Fig 4-54, 1700×2200px)
- X (%Q): x=307 (50%) → x=1336 (130%)
- Upper Y (DA): y=1352 (−8000ft) → y=580 (+16000ft)
- Lower Y (wind): y=1392 (0kt) → y=1776 (30kt)

### TV AI OFF (Fig 4-66, 1700×2200px)
- X (TV): x=510 (TV=1) → x=1382 (TV=14)
- Y (OAT): y=633 (+40°C) → y=1776 (−45°C)

### TV AI ON (Fig 4-70, 1700×2200px)
- X (TV): x=383 (TV=1) → x=1229 (TV=14)
- Y (OAT): y=653 (+40°C) → y=1758 (−45°C)

### HLDF AI OFF (Fig 4-68, 1700×2200px)
- X (HL ft): x=492 (0ft) → x=1030 (400ft)
- Upper Y (TV): y=566 (TV=14) → y=1305 (TV=3)
- Lower Y (wind): y=1345 (0kt) → y=1749 (30kt)

### HLDF AI ON (Fig 4-71, 1700×2200px)
- X (HL ft): x=643 (0ft) → x=1167 (400ft)
- Upper Y (TV): y=601 (TV=14) → y=1316 (TV=3)
- Lower Y (wind): y=1355 (0kt) → y=1746 (30kt)

### SR AI OFF (Fig 4-69, 1700×2200px)
- X (SR ft): x=627 (0ft) → x=1176 (80ft)
- Upper Y (TV): y=564 (TV=14) → y=1320 (TV=3)
- Lower Y (wind): y=1360 (0kt) → y=1773 (30kt)

### SR AI ON (Fig 4-72, 1700×2200px)
- X (SR ft): x=504 (0ft) → x=1024 (80ft)
- Upper Y (TV): y=568 (TV=14) → y=1349 (TV=2)
- Lower Y (wind): y=1388 (0kt) → y=1778 (30kt)
- yToWind corrected: yAt0kt=1.18883, yAtMaxKt=−4.07537, maxKt=30

### Hover charts (all 1700×2200px, mass axis 10000–18000kg)

| Chart | x10000 | x18000 | yOAT40 | yOATneg45 | yWind0 | yWind30 | yTM0 | yTM10 |
|-------|--------|--------|--------|-----------|--------|---------|------|-------|
| Fig 4-19 (30Min AI OFF) | 528 | 1373 | 561 | 1457 | 1489 | 1648 | 1680 | 1785 |
| Fig 4-21 (MaxCont AI OFF) | 527 | 1372 | 559 | 1456 | 1487 | 1646 | 1678 | 1783 |
| Fig 4-27 (MaxCont AI ON) | 527 | 1372 | 565 | 1463 | 1494 | 1653 | 1684 | 1790 |
| Fig 4-25 (30Min AI ON) | 523 | 1368 | 559 | 1456 | 1487 | 1646 | 1678 | 1783 |

---

## Planned future tabs

| Tab | Status | Notes |
|-----|--------|-------|
| Climb Performance | Next — awaiting FM figure selection | See below |
| Hover tab rename | Under consideration | May be misleading — being socialised |

### Climb Performance tab — implementation notes

Charts TBD pending pilot input on which FM figures to include. When ready:

1. **Add chart data** to `config.js` as new constants, wire into `AC_PERF`
2. **Add compute functions** to `compute.js` — follow existing pattern: pure math, no DOM, reads `AC.perf.*`
3. **Add tab panel** to `index.html` — follow existing tab skeleton pattern
4. **Add render function** to `app.js` — follow `renderHover()` / `renderSARCheckHOGE()` pattern
5. **Add trace** using `buildChartDetailsWithTrace` factory — see trace architecture above

File architecture separation is absolute: no DOM in compute.js, no data in app.js.

---

## Known issues / future work

| Item | Priority | Notes |
|------|----------|-------|
| Annex B curves 9000–14000ft | ⚠️ High | Not yet spot-checked against paper chart — safety-critical OEI range |
| SR AI ON upper panel AUW=14000 digitisation | Medium | xRef reads 37ft but expected ~44ft for TV=9.34. Needs re-digitisation |
| SR AI ON lower panel (xRef=20–40) | Medium | Some curves have poor digitisation causing non-monotone wind behaviour |
| Hover tab rename | Pending | Being socialised — no code change until decision made |

---

## Working session protocol

1. User uploads current files first
2. `cp` uploaded files to `/home/claude/` as working copies
3. All edits on `/home/claude/` copies
4. `node --check` after every edit
5. Final `cp` to `/mnt/user-data/outputs/`
6. `present_files` to deliver

**String replacement failures**: check line endings with `cat -A`. JS/CSS = CRLF, HTML = LF.

**Validation after compute changes**:
```javascript
const localStorage = { getItem: () => null, setItem: () => {} };
// prepend to combined config+compute file, then node test.js
```

**Full SAR check test harness**:
```javascript
// cat stubs + config.js + compute.js > test.js, then append:
const hl = getHeightLoss({pa, oat, auw, wind, antiIce});
const sr = getSafeReject({pa, oat, auw, wind, antiIce});
const hoge = getHOGE({pa, oat, auw, wind, antiIce});  // note: pa+oat, not da
const pwr = getPowerAvailable(pa, oat, antiIce);
```
