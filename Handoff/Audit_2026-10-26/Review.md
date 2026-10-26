# 511 Performance Calculator review — 26 October 2026

**Historical review:** the findings below describe the pre-fix behaviour. The subsequently authorised fixes and their validation are recorded in [Fixes.md](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/Handoff/Audit_2026-10-26/Fixes.md>).

## Scope and status

Review of the local `511 Perf Calc v1.5` app, July baseline v1.7.6 plus the separately agreed local climb-boundary fix labelled v1.7.7. No additional application code or chart data was changed during this review. Nothing was committed, published or deployed.

The review exercised all calculation families, inspected input/state handling and chart drawing, checked chart-file references and offline precaching, and read the existing handoff notes. Findings below are discussion items, not changes already applied.

**480,420 sampled calculation calls:** no exceptions or successful results containing NaN/Infinity. **451 curve-array checks:** no unexpected independent-axis ordering problems; axis references and numeric data were structurally intact. **25 chart drawing calls:** no exceptions or non-finite drawing coordinates. All referenced chart image files exist.

These checks establish numerical robustness over the sampled inputs; they do not independently establish the accuracy of every digitized point. The sample includes conditions outside individual chart envelopes, so rejection counts are not bug counts. Plotting calls were tested with an instrumented drawing context and display functions with a minimal document model; this is not a live browser/device test. The browser tool rejected the local file URL under its URL security policy. No alternate browser route was attempted.

Reproduce the audit using `node Handoff/Audit_2026-10-26/audit.cjs` from the app directory. Detailed recorded inputs and outputs are in `results.json` beside this report. The three original climb regression tests remain in `tests/climb-boundary.test.cjs`.

## First items to discuss

### 1. SAR Check can retain an old chart HOGE and display the wrong SAFE OEI verdict

**Confirmed; highest priority.** Two paths share this state-refresh problem.

- Calculate HOGE at 12,000 kg, PA 0 ft, 15°C, wind 0, AI OFF. The stored chart HOGE is 79.1%Q, available AEO is 84%Q, and SAFE OEI is displayed.
- Set Max Mass to Hover conditions to 14,000 kg at the same PA/OAT/wind, then use **Pull from Max Mass to Hover** in SAR Check.
- AUW changes to 14,000 kg, but the stored HOGE stays 79.1%Q. SAR Check still says SAFE OEI. A fresh chart calculation at the new mass returns **97.6%Q**, which exceeds available 84%Q and should produce NOT SAFE OEI.
- A second path occurs when a recalculation fails: the error label changes, but the stored HOGE, verdict and brief are left intact. For example, changing the successful initial mass to 20,000 kg leaves the previous SAFE display. A subsequent render can even relabel the old value as derived from the chart under the new conditions.

Cause: `pullHoverToSar()` bypasses the chart-HOGE refresh; `deriveHOGEFromChart()` returns on failure without invalidating the previous result or rerendering the verdict. Global anti-ice changes also use this early-return path, potentially leaving the visible tab's results stale if the hidden SAR calculation fails.

Proposed discussion: recompute chart-derived HOGE whenever its inputs change, including pulls; invalidate dependent verdicts on failure or incomplete inputs. Preserve the intended independence of pilot-entered HOGE.

Source: [app.js:177](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/app.js:177>), [app.js:1230](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/app.js:1230>).

### 2. Max Mass to Hover confuses a curve's data endpoint with unlimited performance

**Confirmed; highest priority.** The app treats OAT at/below a curve's coldest digitized point as unrestricted, irrespective of the mass at that point. It also treats PA below −1,000 ft as unrestricted regardless of OAT.

Examples, wind 0, TM 0:

| Rating / anti-ice | PA | At −44°C | At −45°C |
|---|---:|---:|---:|
| MCP, AI ON | 10,000 ft | 12,011 kg | Unrestricted / 15,600 kg |
| MCP, AI OFF | 10,000 ft | 13,404 kg | Unrestricted / 15,600 kg |
| 30 Min, AI ON | 10,000 ft | 12,018 kg | Unrestricted / 15,600 kg |
| 30 Min, AI OFF | 10,000 ft | 13,780 kg | Unrestricted / 15,600 kg |

The MCP AI ON data's cold endpoint at 10,000 ft is **−44.92°C, 12,043.2 kg**. It clearly does not establish capability at 15,600 kg. A separate example at 35°C, MCP AI ON: PA −1,000 gives 10,638 kg, while PA −1,001 gives unrestricted / 15,600 kg.

The warm-end rule has the opposite problem: reaching the last OAT sample is labelled “No hover capability at any AUM” even when that last sample has substantial remaining mass capability. For example, PA 0, AI OFF, 30 Min returns about 13,656 kg at 40°C, then “cannot hover at any AUM” at 41°C. That should be distinguished from the chart no longer covering the requested conditions; no extrapolated mass is established by this review.

Proposed discussion: distinguish genuine mass-axis exits from OAT/PA coverage endpoints; keep unsupported cases explicitly out of chart. Use existing samples, without redigitization.

Source: [compute.js:813](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/compute.js:813>), [app.js:2017](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/app.js:2017>).

## Other confirmed findings

### 3. HOGE rejects valid zero- and 30-knot conditions because of endpoint rounding

At PA 0, 15°C, 15,600 kg, AI OFF, wind **0** is rejected, but **0.1 kt** succeeds at 115.3%Q. The 120% entry curve starts at digitized wind **0.078 kt**, rather than the printed zero line.

At PA 0, 15°C, 12,000 kg, wind **29** succeeds, while wind **30** is rejected for both AI states. AI ON lower-panel maximum wind samples lie around 29.70–29.95 kt, so the strict comparison rejects the printed 30-knot endpoint across those curves.

This is distinct from genuine boundaries, such as the AI OFF 130% curve starting around 7.7 kt. A blanket “allow any missing curve” change would be inappropriate. A bounded tolerance at confirmed printed grid endpoints can use existing data.

Source: [compute.js:384](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/compute.js:384>).

### 4. Transfer Value and climb silently reuse boundary inputs outside PA/OAT coverage

- Transfer Value, PA 10,000: OAT 20°C and 40°C both return **4.25 AI OFF / 3.37 AI ON**, with `ok:true` and no clamping warning. PA 12,000, OAT 20°C returns those same boundary values. Both AI states currently use the 2D calculation branch, which clamps PA and OAT without rejection.
- AEO 30 Min AI ON, 13,000 kg, 0°C: PA 10,000 and 12,000 both return **844 ft/min**, without an extrapolation warning. Climb clamps PA to its highest curve while using the entered PA only for the ISA+25 check.

These are unsupported chart lookups presented as ordinary numeric results. Transfer Value feeds HLDF/SR, so the effect can propagate into those results.

Proposed discussion: explicit bounds or clearly flagged boundary handling; retain intentional small digitization tolerances separately.

Source: [compute.js:471](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/compute.js:471>), [compute.js:1150](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/compute.js:1150>).

### 5. HLDF labels different chart exits identically as “HT LOSS EXCEEDS 400 ft”

The shared HLDF/SR helper returns the same `anyHeight` flag for several exits. For HLDF, the display interprets that flag as loss exceeding 400 ft, even when the exit is at the good-performance/zero-loss side.

Confirmed example: **12,500 kg, PA −1,000 ft, −30°C, wind 0, AI ON** gives TV 12.50. The 12,500 kg HLDF curve reaches **x=0 ft at TV 12.2486**. TV above that point is outside the zero-loss side, yet the app returns the flag displayed as “HT LOSS EXCEEDS 400 ft.” This example is reachable when chart HOGE is used: HOGE 80.8%Q exceeds available AEO 80%Q, so HLDF is shown.

A second example: **15,600 kg, PA −1,000 ft, −10°C, wind 30, AI OFF** returns the same exceeds-400 flag. Here the wind samples stop just short of 30 because of digitization rounding; the shared helper mistakes that tiny coverage overrun for a chart exit.

The source image confirms that increasing TV and headwind generally moves the HLDF result toward the lower-loss side. The precise wording for a zero-side exit should be agreed with the operator; no exact extrapolated loss is proposed.

Source: [compute.js:570](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/compute.js:570>), [compute.js:655](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/compute.js:655>), [app.js:1384](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/app.js:1384>).

### 6. Another climb edge remains below the lowest reference correction line

**10,000 kg, PA 10,000 ft, 20°C, AEO 30 Min AI ON** returns “cannot climb.” Upper-panel RoC is **798 ft/min**, just below the lowest stored correction line's reference value of 800. That correction line produces about **1,042 ft/min at 10,000 kg**, so a reference-line range check is not sufficient to conclude that a lighter aircraft cannot climb.

This is separate from the agreed 14,000 kg fix. The current fix only handles interpolation where a lower correction line has exited at the left edge and the next one survives. It does not invent correction data below the lowest stored reference line. This additional case needs an agreed boundary policy/hand check, not a made-up exact result.

Source: [compute.js:1244](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/compute.js:1244>).

### 7. Power Assurance can silently clamp an intersection outside the lower panel data

At **PA 0, −45°C, engine 2, 51% torque**, the upper-panel intersection is x=0.02991. The selected lower curve begins at x=0.065693, TIT 550.793°C. The lookup returns that endpoint as a successful TIT, rather than surfacing that the requested intersection is outside the digitized lower panel. Engines 1/3 have an analogous case.

The normal PA-band, OAT-axis and engine-torque checks are present and worked in the sample sweep. The omitted check is the intermediate intersection's coverage in the lower panel. This review does not infer the true TIT outside the existing samples.

Source: [compute.js:94](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/compute.js:94>), [compute.js:118](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/compute.js:118>).

### 8. All eight climb images are missing from installation-time offline caching

The images exist locally and online. They are absent from the service worker's `ASSETS` list. They can become cached after being opened online, but an installation/update does not guarantee their offline availability. After an update deletes the previous cache, an unvisited climb image can be unavailable offline while calculations still work.

Source: [sw.js:6](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/sw.js:6>).

### 9. The copied SAR brief can omit “ANY HEIGHT” and an exceeded HLDF limit

The visible brief handles the special flags, but the copy-formatting function first requires a non-null numeric SR. Genuine `anyHeight:true, srFt:null` results therefore copy as “—”. The function accepts no HLDF exceeded-limit flag, so that special case also copies as “—”. This can make copied text less complete than the visible briefing.

Source: [app.js:1205](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/app.js:1205>).

### 10. Fuel time formatting

Time formatting returns `0h 60m` for 59.5 minutes and `1h 60m` for 119.5 minutes because minutes are rounded after calculating hours.

Source: fuel time-formatting function in app.js.

## The supplied 498 ft/min screenshot

The user considers 480 versus 498 ft/min compatible with hand interpolation tolerance. Keep the calculated 498; do not tune chart values to match the estimate.

There is a separate, measurable overlay alignment issue in Fig 4-80. The current mass-to-pixel mapping puts 14,000 kg at **y=1552.714** on the 1700×2200 image. The existing image's printed 14,000 kg horizontal datum is approximately **y=1557**. The roughly **4.3 pixel upward offset** agrees with the supplied screenshot. It corresponds to only a few tens of kilograms of visual displacement and plausibly explains part of the apparent difference, but is not a quantified correction to RoC.

This can be improved by correcting the overlay's grid anchors using the image already included, without redigitizing performance curves or changing the 498 calculation. It has not been changed during this review.

Source: [app.js:3497](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/app.js:3497>), [app.js:3595](<C:/Users/sstni/Desktop/511 App/511 Charts/511 Perf Calc v1.5/app.js:3595>).

## Limitations and discussion order

Discuss stale chart HOGE and unrestricted hover first, then endpoint handling and HLDF exit labels. Fixing these should not require redigitization. Keep cosmetic overlay alignment separate from numerical results.

The older handoff records an Annex B knee-region data-quality concern and a proposed redigitization exercise. That is historical context, not a new recommendation or a claim that the current data is wrong. No chart values were altered, and the user has explicitly excluded redigitization. The July change to the AI ON penalty (−15%Q) and AEO floor rounding is present in the current code.

The app currently has no `qa.html` despite historical references to it. The new three-case climb test file is not a full set of operator-approved chart references. Confidence can be improved by retaining regression cases for these reproduced failures, adding a small agreed set of hand-traced reference conditions from the existing charts, and running an actual device/offline smoke check after any changes are agreed. Neither a finite numerical sweep nor good operational experience proves that every edge case is covered.
