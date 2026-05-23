# 511 PerfCalc — Session Handoff
**Date:** 2026-05-19b
**Version:** config.js 1.6.16 / sw.js v1.6.16 — no code changes this session

---

## Current App State

Unchanged from morning handoff. No code was modified this session.
This session was entirely chart geometry analysis for the Climb Performance tab.

---

## Priority 1 — Update / Splash Screen Behaviour

Carried forward — not actioned this session. Confirm approach at start of next coding session:
- Remove update banner
- Add persistent splash screen text: *"If an update is available, close and reopen the app to get the latest version."*

---

## Climb Performance Tab — Chart Geometry (LOCKED)

All decisions below were derived from Fig 4-77 (AEO RoC 30 Min AI OFF) and confirmed
against the AFM worked example (OAT 14°C, PA 9000 ft, AUW 14,000 kg → RoC 1120 ft/min)
and a second hand-trace (OAT 0°C, PA 7000 ft, AUW 12,000 kg → ~2280 ft/min;
same conditions AUW 13,500 kg → ~2120 ft/min).

### Upper Panel — Confirmed

- X axis: Rate of Climb (ft/min), 0–3200
- Y axis: OAT (°C), +45 at top to −50 at bottom
- 12 PA curves: PA_neg1000, PA_0, PA_1000 ... PA_10000
- PA_neg1000 curve is short — valid OAT range is approximately +35°C to +40°C only
- All PA curves terminate naturally before 3200 ft/min; chart ceiling is ~2520 ft/min
  regardless of PA or OAT — this is a real chart boundary, not a digitizing gap
- Procedure: enter OAT on Y → move horizontally right to PA curve → drop vertically
  down through reference line into lower panel

### Lower Panel — Confirmed

- X axis: Rate of Climb (ft/min), 0–3200 (shared with upper panel, continuous)
- Y axis: Aircraft mass (kg), 10,000 at top to 16,000 at bottom
- Reference line: 13,000 kg — horizontal line across the full panel
- Correction lines: 6 parallel lines, originating at the 10,000 kg axis and
  terminating at 15,600 kg (Alt AUW) — they do NOT reach 16,000 kg
- Correction lines cross the reference line at approximately:
  800, 1200, 1600, 2000, 2400, 2600 ft/min (left to right)
- Lines slope down and to the LEFT as mass increases (RoC decreases with weight)
- MAX AUM hatched line at 14,600 kg; ALT AUM hatched line at 15,600 kg

### AFM Procedure (confirmed)

1. Drop vertically from upper panel to the 13,000 kg reference line
2. Follow the correction line from the reference line to actual AUW
3. Drop vertically down to the bottom X-axis
4. Read Final RoC (ft/min)

### Sub-13,000 kg Rule (RESOLVED)

The correction lines cross the reference line at distinct RoC values — they are
parallel lines, not a fan pivoting at a common point. The AFM only describes travel
downward (heavier than reference). Hand-trace at 12,000 kg (lighter than reference)
confirms: drop vertically from upper panel, continue straight down through the lower
panel without following a correction line, read RoC directly at the bottom axis.

**Compute rule:**
```
if AUW <= 13,000 kg:
    finalRoC = rawRoC          // no correction, straight vertical drop
else:
    interpolate correction lines from reference line (13,000 kg) to AUW
    finalRoC = corrected value
```

Valid AUW range for correction: 13,000 kg to 15,600 kg.
Out-of-range (AUW > 15,600 kg) returns a flag — do not extrapolate beyond Alt AUW.

### Config.js Data Schema (REVISED from morning handoff)

The lower panel schema in the morning handoff used `{ rocIn, mass }` pairs with
lines anchored at 10,000 kg. This is now superseded.

**Correct schema — lower panel correction lines anchored at reference line (13,000 kg):**

```javascript
climbPerf: {
  aeo_30min_ai_off: {  // and 7 other variants
    upperPanel: {
      PA_neg1000: [{ oat: 40, roc: ... }, { oat: 35, roc: ... }],  // short curve
      PA_0:       [{ oat: 45, roc: ... }, ..., { oat: -50, roc: ... }],
      PA_1000:    [...],
      // ... through PA_10000
    },
    lowerPanel: {
      refMassKg: 13000,  // reference line — no correction applied at or above this mass
      maxMassKg: 15600,  // Alt AUW — correction lines terminate here
      // Each correction line stored as array of { mass, roc } pairs
      // mass runs from 13000 (reference line) to 15600 (Alt AUW)
      // roc is the calibrated X-value at each mass level along that line
      // Lines identified by their roc value at the reference line crossing
      lines: [
        { refRoc: 800,  points: [{ mass: 13000, roc: 800 }, ..., { mass: 15600, roc: ... }] },
        { refRoc: 1200, points: [{ mass: 13000, roc: 1200 }, ..., { mass: 15600, roc: ... }] },
        { refRoc: 1600, points: [{ mass: 13000, roc: 1600 }, ..., { mass: 15600, roc: ... }] },
        { refRoc: 2000, points: [{ mass: 13000, roc: 2000 }, ..., { mass: 15600, roc: ... }] },
        { refRoc: 2400, points: [{ mass: 13000, roc: 2400 }, ..., { mass: 15600, roc: ... }] },
        { refRoc: 2600, points: [{ mass: 13000, roc: 2600 }, ..., { mass: 15600, roc: ... }] },
      ]
    }
  },
  // ... 7 more variants, identical structure
}
```

`refRoc` is the correction line's RoC at the 13,000 kg reference line — this is the
interpolation anchor. The label is the computed value, not a visual estimate.

### Compute Chain (confirmed)

```
1. rawRoC = interpolate upperPanel(PA curve at actual OAT)
2. if AUW <= 13000:
       finalRoC = rawRoC
   else:
       find bracketing correction lines by refRoc vs rawRoC
       for each bracketing line, interpolate points[] to find roc at actual AUW
       finalRoC = linear interpolate between the two roc values weighted by rawRoC
3. apply domain flags:
       - OAT outside digitized range for that PA curve → extrapolation warning
       - AUW > 15600 → out of envelope
       - rawRoC > ~2520 → above chart ceiling (should not occur if upper panel
         is correctly digitized, but guard anyway)
```

### Fig 4-77 Digitizing Status — COMPLETE, NO REWORK REQUIRED

The existing CSV (`AEO_RoC_30MIN_AI_OFF.csv`) captures correction lines from 10,000 kg
to 15,600 kg — which is exactly what is drawn on the chart. The compute layer handles
the reference line logic at runtime; the data does not need to be anchored differently.

- Upper panel (PA curves): ✅ complete, valid, no rework
- Lower panel (correction lines): ✅ complete, valid, no rework

The compute layer ignores points above 13,000 kg at runtime per the sub-13,000 kg rule.
The full digitized range sits in config.js harmlessly and may serve as a QA sanity check.

---

## WPD Calibration Reference (Fig 4-77)

Record these values in the `.meta.yaml` for this chart. All other 7 charts
should have their own calibration values recorded independently.

| WPD Raw Y | Real Value |
|-----------|------------|
| +44.985 | +45°C |
| −49.956 | −50°C |
| −2.485 | 0°C |
| +1.239 | +4°C |
| −112.691 | 13,000 kg (reference line) |
| −55.726 | 10,000 kg |
| −74.787 | 11,000 kg |
| −142.853 | 14,600 kg (Max AUW) |
| −161.841 | 15,600 kg (Alt AUW) |
| −169.729 | 16,000 kg |

| WPD Raw X | Real Value |
|-----------|------------|
| 0.614 | 0 ft/min |
| 601.229 | 600 ft/min |
| 1599.693 | 1600 ft/min |
| 3200.307 | 3200 ft/min |

X axis is shared between upper and lower panels — same calibration applies to both.

---

## Remaining Digitizing Work (7 charts)

All 8 charts share identical panel structure. The geometry decisions above apply
to all of them. Differences to watch for per chart:
- Correction line positions and slopes may differ between AI OFF and AI ON variants
- Confirm reference line mass is 13,000 kg on all 8 charts (assumed, not yet verified)
- Confirm Alt AUW termination point is 15,600 kg on all 8 charts
- Confirm chart ceiling (~2520 ft/min) holds across all variants or note if different
- Record independent WPD calibration values in `.meta.yaml` for each chart

Digitizing order (suggested — lowest risk first):
1. ~~Fig 4-77~~ ✅ complete
2. Fig 4-79 (MCP AI OFF AEO) ← **next action**
3. Fig 4-84 (30 Min AI OFF OEI)
4. Fig 4-85 (MCP AI OFF OEI)
5. Fig 4-80 (30 Min AI ON AEO)
6. Fig 4-82 (MCP AI ON AEO)
7. Fig 4-87 (30 Min AI ON OEI)
8. Fig 4-88 (MCP AI ON OEI)

---

## Version 1.7.0 Checklist

- [ ] Splash screen update messaging confirmed/implemented
- [x] Fig 4-77 (30 Min AI OFF AEO) — upper and lower panels digitized ✅
- [ ] Fig 4-79 (MCP AI OFF AEO) digitized
- [ ] Fig 4-80 (30 Min AI ON AEO) digitized
- [ ] Fig 4-82 (MCP AI ON AEO) digitized
- [ ] Fig 4-84 (30 Min AI OFF OEI) digitized
- [ ] Fig 4-85 (MCP AI OFF OEI) digitized
- [ ] Fig 4-87 (30 Min AI ON OEI) digitized
- [ ] Fig 4-88 (MCP AI ON OEI) digitized
- [ ] `.meta.yaml` files created for all 8 charts with WPD calibration values
- [ ] config.js schema updated to revised lower panel structure (refRoc + points[])
- [ ] compute.js climb lookup implemented with sub-/super-13,000 kg branching
- [ ] app.js Climb tab rendered with MCP/30Min cards
- [ ] AI toggle wired to Climb tab (verify persistence)
- [ ] Trace/touch alignment verified on Climb tab
- [ ] SW ASSETS list audited — version.json absent, new assets present
- [ ] config.js version → 1.7.0
- [ ] sw.js CACHE_NAME → v1.7.0
- [ ] version.json → 1.7.0
- [ ] QA harness updated with Climb tab test cases
- [ ] Validated against AFM worked example: OAT 14°C, PA 9000 ft, AUW 14,000 kg → 1120 ft/min
- [ ] Validated against hand-trace: OAT 0°C, PA 7000 ft, AUW 12,000 kg → ~2280 ft/min
- [ ] Validated against hand-trace: OAT 0°C, PA 7000 ft, AUW 13,500 kg → ~2120 ft/min

---

## Files to Upload at Next Coding Session
- `app.js`
- `index.html`

---

## PAC Export — Parked

Not actioned. Carry forward until Climb tab complete and 1.7.0 shipped.

---

## Key Principles (standing)

- DA-collapse insufficient for TV AI ON — true 2D (PA, OAT) interpolation required
- Raw WPD-Y values must be stored for wind conversion panels — no pre-conversion during CSV parsing
- Curve sort order matters — ascending by TV for HLDF AI ON upper panel
- AEO derives from rounded OEI — matches FE hand-derivation convention
- version.json must never appear in SW ASSETS list
- Commit regularly — rapid iteration without commits creates version ambiguity
- **Climb lower panel: no correction applied for AUW ≤ 13,000 kg — straight vertical drop**
- **Climb lower panel: correction lines anchored at reference line (13,000 kg), not at 10,000 kg**
- **Climb chart ceiling: ~2520 ft/min — real chart boundary, do not extrapolate beyond it**
