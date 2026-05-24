# CH-149 (-511) Performance Calculator — Operator Briefing
**Version 1.7.0**

---

## What This App Does

The Performance Calculator computes the helicopter performance numbers you brief before a vertical operation and check during Power Assurance. It replaces tracing lines on paper charts — but it does not replace the charts themselves, and it does not use shortcuts to get there.

Every number the app produces comes from the same source, follows the same procedure, and uses the same math as a trained FE working the physical charts by hand. The difference is that it does it in under a second, every time, without reading error, and it shows you exactly where it went on the chart.

---

## Where the Numbers Come From

### The Source

All data in the app comes from the CH-149 (-511) Aircraft Flight Manual. Nothing has been invented, estimated, or borrowed from another aircraft type. The AFM charts were digitized — meaning the curves printed on the chart were traced point-by-point using a specialized tool that records their coordinates — and those coordinates are what the app uses when it computes.

### What Digitizing Means

Think of it this way: a chart is a printed picture of a mathematical relationship. Digitizing reads that picture back into numbers. The tool (WebPlotDigitizer) is calibrated against the chart's own axis markings — the same gridlines you'd use to read the chart by hand — and then each curve is traced to capture its shape across its full range.

The result is a table of values for each curve that the app can interpolate between, exactly the way your pencil interpolates between gridlines when you read a chart. There is no formula derived from theory — the shape of the relationship is taken directly from the AFM as drawn.

### How It Handles Conditions Between Chart Lines

Charts show discrete reference lines — PA at 0, 1000, 2000 ft, and so on. When your PA is 1450 ft, you interpolate between the 1000 and 2000 ft lines. The app does this mathematically: it finds the two bracketing lines, computes the value on each at your exact OAT, and blends the results in proportion to how far your PA sits between them. This is the same linear interpolation a trained FE applies by eye — the app just does it precisely.

---

## How Each Calculation Works

### Power Assurance

PA computes the maximum permissible TIT for your engine conditions (PA band, OAT) and compares it against your observed TIT. It produces a PASS or FAIL with the margin. AI is locked OFF for PA — this is enforced by the app, not advisory. Ground corrections (+5°C for engines 1 & 3, +2°C for engine 2) are applied automatically.

The PA check covers two pressure altitude bands (0–1,000 ft and 2,000–4,000 ft) with separate chart data for each, matching the AFM's two-chart structure.

### SAR Check Performance Brief (Transfer Value, Height Loss during Flyaway, Safe Reject, HOGE)

These charts are two-panel nomograms — the same format used in the AFM. The app chains the two panels exactly as the AFM procedure describes:

1. Enter the first condition in the upper panel → get an intermediate value at the Reference Line
2. Take that intermediate value into the lower panel, apply the AUW and/or wind correction → read the final result

The two panels are linked through a shared Reference Line, just as they are on the paper chart. The app doesn't simplify this or take a shortcut through a combined formula — it runs both steps in sequence, using the digitized curve data for each.

**Transfer Value (AI ON)** required special attention. On the AI OFF chart, TV can be looked up using Density Altitude alone — one input, one output. On the AI ON chart, cold temperatures push DA far below actual Pressure Altitude, which means the same DA maps to a different part of the chart depending on temperature. The SAR Check tab looks up TV against both PA and OAT simultaneously, using 12 PA curves across the full OAT range. This is more work computationally but it's what the chart requires. The improvement this produced was a reduction in TV error from ±0.9 to within ±0.1 TV units.

### Climb Performance (Rate of Climb at 75 KIAS)

Eight chart variants — AEO and OEI, MCP and 30 Min Intermediate, AI ON and AI OFF. The app computes all four results simultaneously from your entered AUM, PA, and OAT.

The chart structure is the same two-panel nomogram format. The upper panel gives a raw Rate of Climb based on PA and OAT. The lower panel applies the AUW mass correction. The Reference Line is the mandatory entry point onto the correction curves — the app always enters at the reference line mass and follows the correction to actual AUW in either direction, whether lighter or heavier.

---

## Trustworthiness — What Was Done to Get Here

### This Was Not Built in an Afternoon

The app was developed over several weeks across multiple sessions, with each session focused on a specific chart group or capability. Every chart was digitized, integrated, validated, found to have issues, corrected, and re-validated. The version history reflects that arc — the app reached its current state through iteration driven by real discrepancies, not by assumption.

### Calibration Was Verified, Not Assumed

After digitizing the AEO AI OFF climb charts, testing revealed a systematic ~2°C error in the OAT axis. Investigation showed the physical chart has slight axis compression in the top 5°C of the OAT scale — the printed gridlines are physically closer together than the rest of the axis. The app was corrected to use three calibration anchors in that region instead of two, removing the systematic error.

This is typical of the process: compute, compare against a hand-trace, find the discrepancy, trace it to its source, fix it, re-validate. Every chart variant went through this cycle.

### Wrong Approaches Were Tried and Corrected

Transfer Value AI ON was initially implemented using Density Altitude as the sole input — a reasonable assumption that turned out to be wrong for the AI ON chart. Cold temperature conditions pushed DA far below actual PA, causing the lookup to draw from the wrong region of the chart. The error reached ±0.9 TV units. This was caught through validation, the approach was rebuilt as a true two-dimensional lookup across 12 PA curves, and the error dropped to ±0.1 units.

The Height Loss and Safe Reject nomogram structure was initially assumed to be additive (main surface plus wind correction). A review of the actual HL AI OFF chart confirmed it is a chained nomogram — the wind correction is not added, it is applied geometrically through the lower panel. The compute layer was rewritten accordingly.

These are not embarrassing mistakes — they are the reason the validation process exists. The final results are correct because discrepancies were found and resolved, not because the first implementation was assumed to be right.

### Every Chart Was Hand-Traced to Confirm

Known validation cases (AFM worked examples, independent hand-traces by an FE) are used to verify computed results. For Rate of Climb, the AFM worked example is OAT +14°C, PA 9,000 ft, AUM 14,000 kg → 1,120 ft/min. The app produces 1,120 ft/min. Similar checks were done across the full chart set.

Residual deltas (where the app and a hand-trace don't agree exactly) are understood: they reflect the inherent reading resolution of the printed chart, which a trained FE couldn't improve on either. The app's results are within the band that an experienced FE would consider the same answer.

### Envelope Violations Are Flagged, Not Hidden

If you enter conditions outside the chart envelope, the app tells you — it does not produce a number and hope for the best. Specific banners:

- **CANNOT CLIMB** — the aircraft cannot maintain any positive rate of climb at this AUM; rate of descent is undefined on this chart.
- **EXCEEDS CHART** — rate of climb exceeds the chart limit; actual value is undefined.
- **OAT EXCEEDS CHART** — entered OAT is above the hot boundary for this PA (ISA+25).
- **AT COLD LIMIT** — result produced but OAT is below the coldest digitized curve; treat with caution.

These match conditions your FE would recognize from the chart boundaries — the app doesn't invent new categories, it reflects what's already true about the chart.

### The Trace

Every calculation can show you exactly where it went on the chart — the path the app followed from your inputs to the result, overlaid on the chart image. This is your check. If the trace looks geometrically wrong — if it's landing on the wrong PA curve, or the correction line doesn't pass through where you'd draw it by hand — that's a flag to investigate. The trace is not decoration; it's verification.

---

## Anti-Ice

AI ON and AI OFF maintain entirely separate chart datasets. Selecting AI ON switches every active calculation to the AI ON charts and recomputes immediately. The indicator in the header always shows the active state. Power Assurance locks AI to OFF — this is enforced, not advisory.

---

## Works Offline

The app is installed on device as a home screen application. Once loaded for the first time on a network, it caches everything it needs locally. All subsequent use — including after refresh with no signal — works without connectivity. Nothing is sent anywhere. The app computes entirely on the device.

---

## What This App Is Not

It is not a certified flight computer. It is a decision-support tool that replicates the FE's existing paper-chart workflow in software. The FE remains responsible for the brief and for exercising judgment when conditions are unusual, data quality is uncertain, or results are unexpected.

---

## Reporting Issues

If a computed result disagrees with a careful hand-trace by more than you'd expect from normal chart-reading variation, that is worth reporting. Include the exact inputs (PA, OAT, AUM, wind, AI state), the app's result, and your hand-traced value. The trace screenshot is useful context.

---

*Performance Calculator v1.7.0 — CH-149 (-511)*
