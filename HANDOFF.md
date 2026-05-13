# CH-149-511 Performance App — Session Handoff
## App version: v1.5

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

## Version tracking

`AC.version` in `config.js` is the single source of version truth. The splash screen reads it at runtime. **Increment on every session that produces output files.**

```javascript
// config.js — top of AC object
const AC = {
  variant: "CH-149-511",
  version: "1.5",   // ← bump each session
  ...
}
```

---

## Splash screen & disclaimer (added v1.5)

A full-screen splash loads on every app open. It shows:
- Builder photo (`images/SPLASH_PG_SSN.png`)
- Aircraft variant, app name, "Built by Shawn St Nicolaas"
- Version from `AC.version`
- Large disclaimer box (red border) — must be explicitly accepted to proceed

An explicit **"I Understand — Enter Application"** button dismisses the splash with a fade. There is no tap-anywhere shortcut — button only.

Each tab also has a persistent amber disclaimer strip at the bottom reminding the pilot to hand-trace at close margins.

**`initSplash()`** in `app.js` wires the button and populates the version. It is called alongside `init()` at DOMContentLoaded.

---

## Annex B — single source of truth

`getAnnexBRefQ()` (trace) and `getPowerAvailable()` (tab display, SAR check) both read from **`AC.perf.powerAvailable.aiOff`** → `PWR_AVAIL_OEI_AI_OFF` in `config.js`.

**`ANNEX_B_PA` does not exist.** It was removed. There is one dataset. Correct a curve in `PWR_AVAIL_OEI_AI_OFF` and both the data display and trace update automatically.

Curves use `{x: OAT, y: %Q}` format. `interpAlongCurve(curve, oat)` is the lookup helper in compute.js.

`getAnnexBRefQ` returns both `refQ` (rounded integer, for display) and `refQExact` (raw float, for trace dot placement). `_drawAnnexBTrace` uses `refQExact` so the dot sits at the true interpolated value rather than the rounded one.

### Session-start verification

At the start of any session that touches compute.js, confirm the single-source architecture is intact:

```javascript
// cat stubs + config.js + compute.js > test.js, then:
const ab = getAnnexBRefQ({pa:3000, oat:10});
const pw = getPowerAvailable(3000, 10, 'OFF');
console.log(Math.abs(ab.refQExact - pw.oeiRaw) < 0.001 ? 'OK' : 'MISMATCH');
// Must print OK. If MISMATCH, getAnnexBRefQ is reading a different source.
```

---

## Annex B curve accuracy

Verified against paper chart. Average error well under 1%Q across verified points.

### Curve validation status

| Curve | OAT range in data | Verified anchor OATs | Notes |
|-------|-------------------|---------------------|-------|
| -2000ft | -44.9 to 39.2 | none | Digitised only |
| 0ft | -45.1 to 39.4 | 10, 13, 15, 17, 18, 20, 22 | Warm region corrected v1.5 — see below |
| 1000ft | -45.2 to 39.5 | -40, -30, -20, 0, 10, 20 | Full range verified |
| 2000ft | -45.1 to 39.2 | 0, 10, 20, 30 | Mid/warm verified |
| 3000ft | -45.0 to 39.5 | -40, -30, -20, 10 | Cold end + OAT=10 |
| 4000ft | -45.0 to 39.1 | -40, -30, -10, 0, 10, 20, 40 | Fully verified |
| 5000ft | -45.0 to 39.4 | -40, -30, -20, 5 | Cold end + OAT=5 |
| 6000ft | -45.0 to 39.4 | -40, -30, -20, 8, 10 | Cold end + warm spot-checks |
| 7000ft | -45.1 to 30.2 | -40, -30, -10, 0, 10, 20 | Fully verified — chart ends ~30°C |
| 8000ft | -45.1 to 30.0 | -40 | Cold spot only |
| 9000ft | -45.0 to 30.0 | none | Digitised only |
| 10000ft | -45.1 to 30.1 | none | Digitised only |
| 12000ft | -44.8 to 23.5 | none | Digitised only — chart ends ~24°C |
| 14000ft | -45.1 to 13.0 | none | Digitised only — chart ends ~13°C |

**Priority for next session**: verify 8000–14000ft curves — most safety-critical OEI range, no spot-checks done.

### 0ft curve — v1.5 correction (warm region OAT=13–18°C)

The original digitisation was running ~1–2%Q high in the OAT=13–17°C segment, causing PA≈0/OAT=15 to display 127%Q instead of the correct 126%Q. Additionally, a local maximum at OAT=18 (124%Q, dipping below 17°C and 20°C) was missing entirely.

**Points removed:** `{x:13.1040, y:129.9464}`, `{x:16.1621, y:127.0000}`, `{x:17.8950, y:125.2589}`

**Points added:** `{x:13, y:128}`, `{x:15, y:126}`, `{x:17, y:123}`, `{x:18, y:124}`

All verified by draw-line method on paper chart. OAT=18 → 124 is a genuine local maximum in the FM chart — not a data error.

Post-fix display: PA=94/OAT=15 → **126%Q** ✓

### Known boundary rounding cases

| Condition | App shows | True value | Notes |
|-----------|-----------|------------|-------|
| PA=2500, OAT=10 | 118%Q | 117.5%Q | Rounds up; conservative |
| PA=4600, OAT=5 | 111%Q | 110.6%Q | Rounds up; conservative |
| PA=0, OAT=20 | 123%Q | 122.7%Q | Rounds up; within tolerance |
| PA=0, OAT=22 | 121%Q | 120.8%Q | Rounds up; within tolerance |

### Expected out-of-envelope behaviour (not bugs)

Curves 7000–14000ft have genuine warm-end chart limits where the aircraft hits the 70%Q floor. `getPowerAvailable` correctly returns `!ok, reason: temp_outside_curve` — this is correct behaviour:

| Curves | Warm OAT chart limit |
|--------|---------------------|
| 7000–10000ft | ~30°C |
| 12000ft | ~24°C |
| 14000ft | ~13°C |

---

## TV AI OFF curve — v1.5 correction

The single DA→TV curve (`TV_AI_OFF` in `config.js`) had 8 stored points running systematically low by +0.09 to +0.27 TV in the DA=5000–8650ft range. Root cause: digitisation calibration drift in that region.

**Spot-check method**: draw-line on Fig 4-67, read TV at intersections of known PA curves and OATs, cross-reference with computed DA. A non-collapse anomaly was identified at DA≈8100–8200 (PA=7000/OAT=+10 vs PA=7800/OAT=+3 sit 156ft apart in DA but 0.23 TV apart) — this is genuine chart behaviour at that chart density, not a data error. The two points were averaged to DA=8130, TV=6.32 for the correction.

**Corrected points (DA → old TV → new TV):**

| DA | Old | New | Delta |
|----|-----|-----|-------|
| 5028 | 7.336 | 7.579 | +0.243 |
| 5602 | 7.156 | 7.312 | +0.156 |
| 6034 | 6.899 | 7.111 | +0.212 |
| 6424 | 6.816 | 6.906 | +0.090 |
| 6898 | 6.572 | 6.689 | +0.117 |
| 7486 | 6.376 | 6.500 | +0.124 |
| 8075 | 6.067 | 6.336 | +0.269 |
| 8648 | 5.782 | 5.979 | +0.197 |

Post-fix worst residual ±0.18 TV at the averaged non-collapse point. All other verified points within ±0.03.

**Verification method for future sessions**: draw-line on Fig 4-67 at a known TV value, read which PA curve it intersects at which OAT, compute DA, compare to app output.

---

## Figure number corrections — v1.5

The config `fig:` labels for two AI OFF charts were wrong. Corrected:

| Chart | Was | Now |
|-------|-----|-----|
| TV AI OFF | Fig 4-66 | **Fig 4-67** |
| HOGE AI OFF | Fig 4-67 | **Fig 4-53** |

All other figure numbers confirmed correct:
HLDF AI OFF = Fig 4-68, SR AI OFF = Fig 4-69, TV AI ON = Fig 4-70, HOGE AI ON = Fig 4-54, HLDF AI ON = Fig 4-71, SR AI ON = Fig 4-72.

---

## Trace system — architecture (v1.5)

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

### HLDF out-of-envelope behaviour

`getHeightLoss` returns `{ ok:true, anyHeight:true, hlFt:null, xRef:null, tv }` when TV is below the chart's left edge (aircraft cannot hover AEO — HLDF would exceed 400ft). Also returns `anyHeight` when the lower panel runs off the right edge.

- Tab and brief display: **"HT LOSS EXCEEDS 400 ft"**
- Trace draws the TV line across the upper panel and stops when `xRef` is null
- `buildHLDFChartDetailsWithTrace` enables trace whenever `tv` is present

**"ANY HEIGHT" is SR-only.** HLDF uses "HT LOSS EXCEEDS 400 ft". Never conflate these.

---

## Trace status — complete

| Chart | Tab(s) | Status |
|-------|--------|--------|
| Annex B | Pre-Takeoff, SAR Check | ✅ Done — piecewise X calibration, `refQExact` dot placement |
| HOGE AI OFF (Fig 4-53) | SAR Check | ✅ Done |
| HOGE AI ON (Fig 4-54) | SAR Check | ✅ Done |
| TV AI OFF (Fig 4-67) | SAR Check | ✅ Done |
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
- `refQExact` used for dot placement; `refQ` for labels

### HOGE AI OFF (Fig 4-53, 1700×2200px)
- X (%Q): x=446 (50%) → x=1475 (130%)
- Upper Y (DA): y=1357 (−8000ft) → y=585 (+16000ft)
- Lower Y (wind): y=1395 (0kt) → y=1781 (30kt)

### HOGE AI ON (Fig 4-54, 1700×2200px)
- X (%Q): x=307 (50%) → x=1336 (130%)
- Upper Y (DA): y=1352 (−8000ft) → y=580 (+16000ft)
- Lower Y (wind): y=1392 (0kt) → y=1776 (30kt)

### TV AI OFF (Fig 4-67, 1700×2200px)
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
| Climb Performance | **Next** — awaiting FM figure selection | See below |
| Hover tab rename | Under consideration | Being socialised — no code change until decided |

### Climb Performance tab — implementation pattern

When FM figures are confirmed:

1. Add chart data to `config.js` as new constants, wire into `AC_PERF`
2. Add compute functions to `compute.js` — pure math, no DOM, reads `AC.perf.*`
3. Add tab panel to `index.html` — follow existing tab skeleton
4. Add render function to `app.js` — follow `renderHover()` pattern
5. Add trace using `buildChartDetailsWithTrace` factory

---

## Spot-check methodology — draw-line technique

The most reliable way to verify chart data against the paper FM is the **draw-line method**: draw a vertical (or horizontal) line at a known axis value in the PDF viewer, then read where it intersects the PA/OAT curves of interest. This eliminates the free-hand interpolation error that caused several misreads this session.

Always use draw-line for:
- TV chart verification (draw vertical at TV value, read OAT intersections)
- Annex B verification (draw horizontal at %Q value, read OAT intersections)
- Any condition where two adjacent PA curves are visually close

When a hand-read conflicts with the app by more than ~0.3 TV or ~1%Q, re-read using draw-line before concluding there is a data error.

---

## Known issues / future work

| Item | Priority | Notes |
|------|----------|-------|
| Annex B curves 8000–14000ft | ⚠️ High | No spot-checks against paper chart — safety-critical OEI range |
| TV AI OFF non-collapse residual | Low | DA≈8100–8200 has ±0.18 TV residual — genuine chart ambiguity, averaged |
| SR AI ON upper panel AUW=14000 digitisation | Medium | xRef reads 37ft, expected ~44ft for TV=9.34 — needs re-digitisation |
| SR AI ON lower panel xRef=20–40 | Medium | Some curves non-monotone wind behaviour |
| Annex B 0ft OAT=20/22 rounding | Low | Displays 123/121, true ~122.7/120.8 — within tolerance |
| Hover tab rename | Pending | Awaiting decision |

---

## Working session protocol

1. Upload all five current files
2. `cp` uploaded files to `/home/claude/` as working copies
3. All edits on `/home/claude/` copies
4. `node --check` after every edit
5. Final `cp` to `/mnt/user-data/outputs/`
6. `present_files` to deliver

**String replacement failures**: check line endings with `cat -A`. JS/CSS = CRLF, HTML = LF.

**Test harness**:
```javascript
const localStorage = { getItem: () => null, setItem: () => {} };
// cat stubs + config.js + compute.js > test.js, append test code, node test.js
```

**Function signatures** (common source of bugs — note pa+oat, not da):
```javascript
getHOGE({pa, oat, auw, wind, antiIce})
getHeightLoss({pa, oat, auw, wind, antiIce})
getSafeReject({pa, oat, auw, wind, antiIce})
getPowerAvailable(pa, oat, antiIce)
getAnnexBRefQ({pa, oat})          // returns refQ (rounded) + refQExact (float)
getTransferValue(pa, oat, antiIce)
getMaxMassToHover({pa, oat, wind, tm, antiIce, rating})  // rating: 'maxCont' | '30min'
evaluateSAROEISafety({pa, oat, auw, wind, antiIce})      // returns {tv, hoge, power, safeOEI, margin, marginRule}
```

**Stress test** — run at end of any session touching compute or config:
```javascript
// 117 should pass, 9 are expected chart limits (correct behaviour)
for(const pa of [-2000,0,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000,12000,14000]){
  for(const oat of [-45,-30,-20,-10,0,10,20,30,40]){
    const r = getPowerAvailable(pa, oat, 'OFF');
    if (!r.ok) console.log('!ok PA='+pa+' OAT='+oat+': '+r.reason);
  }
}
// Expected !ok (genuine chart limits, not bugs):
// 7000-10000ft at OAT=40
// 12000ft at OAT=30 and 40
// 14000ft at OAT=20, 30, and 40
```
