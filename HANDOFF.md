# CH-149-511 Performance App — Session Handoff
## App version: v1.3

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

## Trace system — architecture (v1.3)

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
- All six `buildXxxChartDetailsWithTrace` wrappers call this factory

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

---

## Trace status — complete

| Chart | Tab(s) | Status |
|-------|--------|--------|
| Annex B | Pre-Takeoff, SAR Check | ✅ Done — pixel-calibrated, bottom-entry direction, AI ON note in summary |
| HOGE AI OFF (Fig 4-67) | SAR Check | ✅ Done |
| HOGE AI ON (Fig 4-54) | SAR Check | ✅ Done |
| TV AI OFF (Fig 4-66) | SAR Check | ✅ Done |
| TV AI ON (Fig 4-70) | SAR Check | ✅ Done |
| HLDF AI OFF (Fig 4-68) | SAR Check | ✅ Done |
| HLDF AI ON (Fig 4-71) | SAR Check | ✅ Done |
| SR AI OFF (Fig 4-69) | SAR Check | ✅ Done |
| SR AI ON (Fig 4-72) | SAR Check | ✅ Done |
| Max Mass to Hover Max Cont AI OFF (Fig 4-21) | Hover | ✅ Done |
| Max Mass to Hover Max Cont AI ON (Fig 4-27) | Hover | ✅ Done |
| Max Mass to Hover 30 Min AI OFF (Fig 4-19) | Hover | ✅ Done |
| Max Mass to Hover 30 Min AI ON (Fig 4-25) | Hover | ✅ Done |
| Power Assurance — all four bands | Power Assurance | ✅ Done (existing) |
| Height Loss / Min Fwd Reject | SAR Check | ✅ Done (existing) |

---

## Pixel calibration — all charts

### Annex B (1700×2200px)
- X (OAT): x=544 (−45°C) → x=1373 (+40°C)
- Y (%Q): y=728 (140%) → y=1286 (70%)
- White margin extensions: horizontal to x=252, OAT label at y=1389

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
| Climb Performance | Pending | Charts TBD — awaiting pilot input on which FM figures to include |

---

## Known issues / future work

| Item | Priority | Notes |
|------|----------|-------|
| SR AI ON upper panel AUW=14000 curve digitisation | Medium | xRef reads 37ft but expected ~44ft for TV=9.34. Needs re-digitisation of that specific curve |
| SR AI ON lower panel curve data (xRef=20–40) | Medium | yToWind fixed but some curves have poor digitisation causing non-monotone wind behaviour |
| Max Mass to Hover 30 Min — wind panel field name | ✅ Fixed | `kt:` renamed to `wind:` in HOV_30MIN_AI_OFF_WIND and HOV_30MIN_AI_ON_WIND |

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
const localStorage = { getItem: () => null };
// prepend to combined config+compute file, then node test.js
```
