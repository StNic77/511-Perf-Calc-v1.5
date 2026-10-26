# v1.7.7 - 26 October 2026

Implemented following the operator's approval of the review findings and prepared for the authorised commit and push. Version remains 1.7.7 as requested. Performance-chart data and the July −15%Q anti-ice penalty are unchanged. No charts were redigitized. Deployment and device verification are separate from source publication.

## Changes made

| Review item | Result |
|---|---|
| 1. Stale chart HOGE / incorrect SAFE OEI | Every SAR render refreshes chart-derived HOGE from current conditions, including cross-tab pulls. Failed/incomplete calculations clear the prior value, verdict and brief. Errors remain visible. Pilot-entered HOGE remains independent. |
| 2. Incorrect unrestricted-hover results | PA/OAT coverage endpoints no longer imply zero or unlimited hover capability. Endpoints within 0.25°C click tolerance use the existing measured mass and continue through wind/TM corrections. Unsupported conditions give an explicit coverage message. |
| 3. False HOGE wind rejections | Runtime copies of wind data snap values within 0.35 kt of the printed 0/30 kt limits to those limits. Genuine partial curves, such as the AI OFF 130% line beginning at about 7.7 kt, retain their limits. Inputs beyond 0–30 kt are rejected. The stored samples are untouched. |
| 4. Silent Transfer Value / climb clamping | PA beyond the available curves is rejected. Transfer Value requires OAT coverage on each contributing curve. Unsupported conditions no longer silently reuse a boundary value. |
| 5. HLDF exit messages | A high-TV exit on the zero-loss side is explicitly outside coverage, rather than being labelled loss exceeding 400 ft. The adverse right-side exit retains the exceeds-400 message. Printed wind-endpoint tolerance prevents 30 kt rounding noise being mistaken for a chart exit. |
| 6. Lowest-reference-line climb edge | An input below the lowest stored reference correction line now says that the correction data does not determine the rate. It no longer asserts “cannot climb.” Missing correction lines are not extrapolated. Truncated mass endpoints are also distinguished from genuine left-edge exits. |
| 7. Power Assurance lower-panel coverage | The intermediate intersection is checked against the contributing TIT curves before returning a TIT or pass/fail result. Unsupported intersections require the source chart. |
| 8. Offline climb charts | All eight climb PNGs are in installation-time precaching. |
| 9. Copied SAR brief | ANY HEIGHT and HT LOSS EXCEEDS 400 ft survive copying even when no numeric height is returned. |
| 10. Fuel time formatting | Time now rounds correctly through the hour. |
| Original 14,000 kg climb report | The agreed correction-line boundary interpolation remains in place: AEO 30 Min AI ON, 10,000 ft, −1°C gives 498 ft/min at 14,000 kg and 537 ft/min at 13,900 kg. |
| Fig 4-80 screenshot alignment | Mass overlay anchors were measured against the existing image. The 14,000 kg dot is now at y=1556.43 against a printed datum near y=1557, rather than y=1552.71. Numeric RoC remains 498. |
| Change note | Starts with a single bold v1.7.7, a plain hyphen and 26 October 2026, followed by the complete change description in app terminology. |

## Verification

- **17 regression tests passed.** They reproduce the reported stale-state, hover, wind, chart-coverage, HLDF, copied-brief, fuel-log, time and overlay cases, plus release-version, change-note and asset checks.
- **480,420 calculation calls** across all chart families: no exceptions or successful outputs containing NaN/Infinity.
- **451 curve-array checks:** no unexpected ordering, axis-reference or finite-number issues.
- **25 chart-drawing calls:** no exceptions or invalid drawing coordinates.
- Every referenced chart image exists and is now listed for offline caching.
- JavaScript syntax and whitespace checks passed.
- Existing performance-chart data was compared with the Git baseline; only the release version differs in config.js, apart from its final newline.

Commands from the app directory:

```text
node --test tests/climb-boundary.test.cjs tests/audit-fixes.test.cjs
node Handoff/Audit_2026-10-26/audit.cjs --post-fix
```

The historical audit evidence remains in `results.json`; updated evidence is in `post-fix-results.json`. The original review remains a record of what was found, not a current unresolved-issue list.

## Remaining verification before deployment

The tests execute calculation/drawing functions and use a minimal document model for display/state checks. They do not replace an actual iPad/browser/offline check. The browser tool blocked a local-file URL earlier in the review, and that restriction was not bypassed.

Unsupported boundary cases now explicitly request the source chart. This resolves misleading numeric/performance verdicts; it does not manufacture exact answers where correction data is absent. Any future extension of those cases needs operator-agreed chart interpretation. No such extension or redigitization is required for the fixes above.
