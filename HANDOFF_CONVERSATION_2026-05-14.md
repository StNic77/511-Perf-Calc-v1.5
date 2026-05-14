# 511 Perf Calc — Design & Planning Session Handoff
**Date:** 2026-05-14  
**Nature of session:** Design discussion, no code changes made  
**To be merged with:** HANDOFF.md from development session (user to provide)

---

## GitHub repo

**URL:** https://github.com/StNic77/511-Perf-Calc-v1.5  
**Visibility:** Public  
**Files:** `index.html`, `app.js`, `compute.js`, `config.js`, `styles.css`, `HANDOFF.md`, `images/`

At the start of any future session, files can be fetched directly via raw URLs rather than requiring upload:
`https://raw.githubusercontent.com/StNic77/511-Perf-Calc-v1.5/main/index.html` etc.
HANDOFF.md can also be fetched directly to load project context without user uploading it.

---

## App origin and intent

The app began as a tool to replace the Flight Engineer pulling paper charts in the dark, on NVGs, tired, in a turbulent aircraft. It has since evolved into a powerful planning tool. The core design principle is minimal friction — tabbed, independent tabs, no dependencies between them, works in the FE workflow.

The app currently does a strong job of go/no-go display — particularly in the SAR Check (safe/not safe OEI) and Hover Performance tabs (can hover / cannot hover, margin clearly shown in either direction). This framing is already correct and should be preserved in all new features.

---

## Confirmed feature additions

### 1. PWA — offline capability (highest priority infrastructure)

**Problem:** When connectivity is lost and Safari refreshes, the app fails because it can't fetch files from GitHub.

**Solution:** Progressive Web App implementation — two files to add:
- `sw.js` — service worker that caches all app files on first load, serves from cache on all subsequent requests regardless of connectivity
- `manifest.json` — enables Add to Home Screen, removes browser chrome, makes it behave like a native app

**One addition to `index.html`:** register the service worker and link the manifest.

**Update strategy:** Bump a version string in `sw.js` when pushing changes — triggers cache refresh on next load with connectivity. Given performance data is stable, updates are near-zero.

**Update checking:** On open, if connectivity is available, the service worker compares the cached version string against the current one. Match — serves from cache as normal. Mismatch — fetches fresh files in the background, updates cache silently. Next open gets the new version. No user action required.

**iOS cache eviction:** iOS may discard the service worker cache entirely if the app hasn't been opened for an extended period (historically a few weeks). This is distinct from the version check — the cache is gone, so there is nothing to check against. The app will need connectivity on that first re-open to rebuild the cache from scratch.

For a tool used regularly on active deployments this is essentially a non-issue. For crews returning from extended leave or between seasonal deployments it is a realistic scenario.

**User notification:** The app should detect when it is running without a service worker cache and display an unobtrusive banner — something like *"Offline cache not available. Open once on WiFi to enable offline use."* This ensures a crew member is never caught without the app in the field without having had a chance to fix it.

**Implementation note:** The `images/` folder contents must all be listed in the service worker cache manifest — charts must render offline.

---

### 2. Cross-tab data pull with timestamp

**Concept:** A shared session state object in `app.js` that tabs can write to and read from. Optional "Pull from [Tab]" buttons populate inputs from the store. Button only appears when data is available to pull — absent otherwise.

**Confirmed pull relationships:**

| Source tab | Destination tab | Data pulled | Condition |
|---|---|---|---|
| Pre-Takeoff | Power Assurance | PA, OAT | Only when `onGround: true` — button hidden for in-flight PA checks because press alt and temp will differ |
| Pre-Takeoff | SAR Check | AUW, PA, OAT | Always available |
| SAR Check | Hover Performance | AUW, PA, OAT, wind | Available when SAR Check has been completed in current session |

**Timestamp requirement:** Display when the source data was entered, e.g. *"Pull from SAR Check (14:32)"* — low cost, ensures crew is aware if conditions may have gone stale. Confirmed as worthwhile.

**Tab independence:** Tabs remain fully independent. The pull function is a convenience, not a dependency. Tab structure does not change.

**Highest value pull:** SAR Check → Hover Performance. Currently, if a SAR Check comes back marginal at high DA, crews do not go to hover performance charts because the paper version is high friction and high cognitive load. With the app it's a few taps, potentially fewer with the pull function. This workflow is currently essentially never completed in the field — the app changes that.

**Power Assurance pull note:** The `onGround` flag already exists in the app for PA trace logic. Reuse this flag to conditionally show/hide the Pre-Takeoff pull button — no new logic needed.

---

### 3. Reverse solving in Hover Performance tab

**Concept:** Invert the calculation. Instead of entering known conditions to get performance output, enter the known mass and solve for the unknown — what is the maximum DA I can hover at for this AUW?

**Operationally confirmed:** Missions to high-DA sites are first "can we do this" then "what's our margin." The reverse solve answers the first question before departure rather than empirically at the site.

**Current field practice:** Crews pull into a hover at co-altitude with an escape route and check actual power requirements. This is an empirical test because there is no practical low-friction alternative with paper charts. The app can change this — the empirical check becomes a confirmation rather than a discovery.

**Technically straightforward:** Compute functions are pure JS with no side effects. A binary search across the PA range until hover margin hits zero converges in milliseconds. New UI is a different input panel — enter known values, app solves for the unknown.

**Full family of useful inverse queries — to be prioritised with pilot input:**
- Max DA for a given AUW (primary use case confirmed)
- Max AUW for a given PA/OAT
- Headwind required to make a marginal situation work
- (Fuel-to-margin: not how crews think about it — ruled out as a formal calculation)

**Equipment download trade-off:** The hover performance tab also provides clarity on the equipment download vs fuel trade decision — showing the mass picture clearly for a given scenario. This is already partially served by the current tab; the reverse solve makes it more explicit.

**Implementation:** New input mode within the Hover Performance tab, not a separate tab. Clearly labelled to distinguish from the standard forward calculation.

---

## Deferred — pending pilot group conversation

### OEI climb and terrain clearance
- Whether a calculated margin (required gradient vs available gradient) is something pilots would trust and brief to, vs feeling too removed from the actual environment
- Which FM figures to digitise
- What the actual operational question looks like in practice

### Planning mode / sliders
- Whether there is appetite for a separate planning mode with sliders for PA, OAT, AUW, headwind
- Risk: sliders invite approximate thinking; operational data entry requires deliberate accuracy — mixing these modes in the same UI is a concern
- If implemented, planning mode should be explicitly toggled, clearly labelled, and nothing from planning mode should be pullable into other tabs via session state
- Current consensus: app already delivers strong planning value with normal inputs — may not be necessary

---

## PDF export and duty-day performance log

**Origin of the idea:** The app already displays chart traces alongside every result — no black box, full derivation visible. This means a PDF export is not just a number summary but a complete visual record: inputs, results, and the actual chart traces showing how each answer was derived.

**The workflow that emerged:**
1. FE completes calculations during a session
2. App generates a PDF of the full session — all tabs run, inputs, results, traces, timestamp
3. FE emails PDF to a dedicated ops group mailbox (or equivalent — TBD with operator)
4. Next crew picking up the same aircraft can retrieve the PDF and see the actual performance picture for that aircraft on that duty day

**Why this matters beyond convenience:** A "PA complete" logbook entry tells the next crew nothing about actual margins. The PDF tells them how the engines were actually performing — tighter than expected, comfortable, specific conditions — which is meaningful context for a high-DA mission later in the day. Supporting context, not a substitute for crew situational awareness.

**Natural extensions:**
- Hover margins at a specific site visited during the duty day
- SAR check results for a known high-DA location
- Potentially a rolling duty-day document with each crew's session appended

**Friction question:** Needs to be low enough that FEs actually send it. One tap from within the app to share via iOS share sheet is the target. If it requires more than that it will be skipped.

**F47 context:** The F47 is not a mandated document — it is an informal FE notetaking tool for hand calculations, aircraft notes, fuel burn etc. The PDF export is a natural digital evolution of this. No regulatory complexity anticipated but worth confirming with chief pilot before formalising the format.

**Scope boundary — TBD with pilots:** Some F47 content (fuel burn logs, squawks, aircraft notes) may be out of scope for this app. Pilot discussion tomorrow will help define what the minimum useful document looks like vs what becomes overreach.

**Copy to clipboard** already exists in the app as an informal version of this. The PDF export is the formalised, shareable evolution.

---

## NVG screen flare — night mode note

NVGs are focused to infinity and cannot be used to read devices or instruments. Crews look under goggles to read screens. The concern is not readability but **light spill affecting another crew member's NVG image** when someone else is using the app.

The app already has day and night modes. The question is whether the night mode is dark enough to avoid meaningful flare at typical cockpit distances. Worth testing in the actual aircraft environment before investing in a dedicated NVG mode. If night mode is insufficient, a true NVG mode is a CSS theme change — black background, dim red or amber text, all whites suppressed. Straightforward to implement.

---

## iPad numpad keyboard

iPhones already show numeric keypad for number inputs. iPads do not consistently. Fix is `inputmode="numeric"` on every number input field — one-line change per field, audit in a working session.

---

## Confirmed app capabilities (from today's discussion)

- Day and night modes already implemented
- Optimised for iPhone, iPad, and desktop — equally functional on all
- Side scroll for tabs, vertical scroll within tabs — confirmed as acceptable UX
- Every chart-derived calculation shows the full trace on the chart — no black box, derivation always visible
- Copy to clipboard function already exists
- The FE is the primary in-flight operator of the app

---

## Ruled out

**Live weather / aeromet data pull:**
- Technically feasible (Nav Canada METARs, CheckWX API etc.) but cuts directly against the offline-first architecture
- Connectivity dependence reintroduced at the moment of use
- Data currency and silent failure risk for safety-critical inputs outweighs the convenience of saving a few taps
- **Exception:** Airfield elevation lookup table (pure static data, no connectivity, genuinely useful) remains on the table as a low-effort addition

---

## Pilot consultation questions

A formatted question set was produced in this session for socialising with the pilot group. Topics covered:
- Cross-tab data pull workflow
- Hover performance reverse solving
- OEI climb and terrain clearance
- Planning vs operational tool distinction
- General friction points and mental model alignment

Several questions were pre-answered by the FE based on operational experience (documented above). Remaining open questions deferred to pilot group conversation.

---

## Working session protocol (unchanged)

1. Fetch or upload current files
2. `cp` to `/home/claude/` as working copies
3. All edits on `/home/claude/` copies
4. `node --check` after every edit
5. Final `cp` to `/mnt/user-data/outputs/`
6. `present_files` to deliver

**String replacement failures:** check line endings with `cat -A`. JS/CSS = CRLF, HTML = LF.
