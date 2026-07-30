# 511 PerfCalc — Session Handoff
**Date:** 2026-07-30
**Version:** v1.7.4 (built this session — not yet deployed/committed)
**Focus this session:** AI ON penalty correction (SARSET AIF) + AEO-Eq rounding-direction fix

---

## Context — Why This Came Up

Following the 2026-07-27 analysis session (AFM Rev 11 vs Annex B AI ON penalty discrepancy), SARSET issued **AIF 2026-07-29** confirming the finding and directing an interim procedural change ahead of SMM Change 7. This closes out the "app does not change its math ahead of the fleet procedure" holding pattern from that session — the fleet has now briefed the change.

Separately, Shawn identified that AEO-Eq derivation was rounding to nearest instead of always rounding down, which is non-conservative when the fractional part is ≥0.5 (e.g. 121 OEI → 80.667 → was rounding to 81, should read 80).

---

## What Was Accomplished This Session

### 1. AI ON Penalty: −8 → −15 %Q (config.js)

**Authority:** SARSET AIF 2026-07-29, ref CH149 SMM 60-149-1000 – CH6 Annex B / AFM VOL 1 EU02X503A Issue 3 Rev 12, Fig 4-62.

> "Effective immediately, crews are to subtract 15 from the torque derived with the Annex B Torque Available Anti-Ice Off Chart, instead of 8, as is currently stated." Effective immediately, remains in effect until SMM Change 7 is approved and distributed.

**Change:** `AC_PERF.aiOnPenaltyPct` in `config.js`: `8` → `15`. Single source of truth — confirmed only one call site in `compute.js` (`getPowerAvailable()`) applies this constant to `oeiRaw` before display rounding.

**Also updated:** `app.js` `_buildAnnexBSummaryRow()` had a hardcoded fallback `(AC.perf && AC.perf.aiOnPenaltyPct) || 8` used only if the config value is somehow missing at render time. Updated to `|| 15` so the AI-ON-correction note text stays consistent with config even in that edge case.

**Not changed:** the AI ON penalty is still a flat constant applied uniformly across PA/OAT — this matches the AIF's directive (flat −15 replacing flat −8), not the two-term or digitized-surface options discussed as longer-term candidates in the 07-27 session. Those remain open questions for the eventual SMM Change 7 content, not resolved by this AIF.

### 2. AEO-Eq Rounding: round → floor (compute.js)

**Authority:** Operator direction, this session. Not yet tied to a written procedural source — worth capturing a rationale for the OAW package (see Follow-ups).

**Change:** `getPowerAvailable()` in `compute.js`:
```js
// before
aeoEquiv: Math.round(aeoRaw),
// after
aeoEquiv: Math.floor(aeoRaw),
```
`aeoRaw` itself (`oeiDisplay * 2 / 3`) and `aeoEquivRaw` are unchanged — only the displayed integer's rounding direction changed. AEO is still derived from the *displayed* (already-rounded) OEI integer, not the raw OEI — that convention is untouched.

**Verified:** `Math.floor(121 * 2/3)` = `Math.floor(80.667)` = `80` — matches the example given (121/80.667 → 121/80, not 121/81).

**Scope confirmed:** grepped the full codebase for `2/3` and `2 / 3` — exactly one call site (`getPowerAvailable`). No other tab independently re-derives AEO-Eq, so this fix applies everywhere AEO-Eq is shown or used: Power Assurance, SAR Check (TV, HOGE, Height Loss, Safe Reject), and the SAFE-OEI margin test.

### 3. Version Bump

- `sw.js`: `CACHE_VERSION` `v1.7.3` → `v1.7.4`
- `version.json`: `1.7.3` → `1.7.4`
- `index.html` splash "what's new" note rewritten for v1.7.4, citing the AIF and describing both changes in plain language for FE readers.

### 4. Verification Done This Session

- `node --check` passed on `compute.js`, `app.js`, `config.js`.
- Manual grep confirmed no duplicate/orphaned hardcoded `8`s for the penalty and no second `2/3` derivation site.
- Spot math check of the floor fix against the operator-supplied example.
- No live browser/QA-harness run this session — see Outstanding below.

---

## Files Modified This Version

`config.js`, `compute.js`, `app.js`, `index.html`, `sw.js`, `version.json`.

---

## Outstanding / Next Session

### 1. QA Harness (qa.html) — not touched this session
Any existing test cases with expected OEI/AEO-Eq values computed under the old −8 penalty or round-to-nearest AEO will now fail (correctly) against v1.7.4. Needs a pass to recalculate expected outputs before this ships. `qa.html` was not part of this session's upload set.

### 2. Rationale for the floor-rounding change
The AI ON penalty change has a clean paper trail (SARSET AIF 2026-07-29). The AEO rounding-direction fix does not yet — confirm whether this traces to a chart note, hand-procedure convention, or is a Shawn-identified correction, and capture that source for the OAW technical package's conservative-directionality section.

### 3. OAW technical package
Both changes should be logged in the methodology/limitations section: what changed, why, and the conservative-directionality argument for each (both changes make the app read more conservatively than before — worth stating explicitly, since conservative-direction changes are the ones the audit package wants easy answers on).

### 4. SMM Change 7 tracking
The AIF is explicitly an interim measure "until SMM CH7 is approved and distributed." When Change 7 lands, confirm whether it matches the AIF's flat −15 or introduces something else (e.g. one of the two-term/digitized-surface options from the 07-27 analysis) — the app may need a follow-up change at that point.

### 5. Deploy step not yet done
This session produced the modified files only. Still need: commit, deploy to GitHub Pages, and the usual field verification (open on connectivity → confirm splash note and version → confirm AI ON penalty value on a known hand-traced test point).

---

## Key Principles (reaffirmed this session)

- **Single source of truth for constants:** `aiOnPenaltyPct` lives in `config.js`; `compute.js` and `app.js` both read from it rather than hardcoding — the one fallback constant in `app.js` was kept in sync but flagged as worth eliminating in favor of a hard dependency, if that's ever revisited.
- **The app follows the fleet procedure, not the other way around:** this change was blocked pending the AIF; now that it's issued, the app updates to match, not ahead of it.
- **Conservative-direction changes are still validated, not assumed:** floor vs round was checked against the operator's own worked example before committing, per standing verification practice.
