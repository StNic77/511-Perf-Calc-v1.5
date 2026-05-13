// ============================================================================
// CH-149-511 Performance Calculator — Pure compute functions
//
// Per family convention (APP_FAMILY_SYNOPSIS §5.3): no DOM access, no side
// effects, no localStorage reads. Functions take data, return data.
//
// Lifted from power_assurance_compute.js (validated 25 Apr 26).
// Validation: ±1.17°C MAE on 5 hand-traced operating points (Eng 1&3),
// 2/3 (Eng 2) within tolerance plus 1 correctly rejected as out-of-envelope.
// ============================================================================


// ---- Compute primitives ----------------------------------------------------

// 1D linear interpolation between two (x, y) points.
function interp1(x, x0, y0, x1, y1) {
  if (x1 === x0) return y0;
  const t = (x - x0) / (x1 - x0);
  return y0 + t * (y1 - y0);
}

// Find indices [iLo, iHi] of bracketing values in a sorted axis.
// Returns equal indices if value is at or outside an end (caller checks bounds).
function bracket(axis, value) {
  if (value <= axis[0]) return [0, 0];
  if (value >= axis[axis.length - 1]) return [axis.length - 1, axis.length - 1];
  for (let i = 0; i < axis.length - 1; i++) {
    if (value === axis[i]) return [i, i];
    if (value === axis[i + 1]) return [i + 1, i + 1];
    if (value >= axis[i] && value <= axis[i + 1]) return [i, i + 1];
  }
  return [axis.length - 1, axis.length - 1];
}

// Forward interpolation along a curve: given x, return y.
// Curve is an array of {x, y} sorted by x. Clamps at ends.
function interpAlongCurve(curve, x) {
  if (x <= curve[0].x) return curve[0].y;
  if (x >= curve[curve.length - 1].x) return curve[curve.length - 1].y;
  for (let i = 0; i < curve.length - 1; i++) {
    if (x >= curve[i].x && x <= curve[i + 1].x) {
      return interp1(x, curve[i].x, curve[i].y, curve[i + 1].x, curve[i + 1].y);
    }
  }
  return curve[curve.length - 1].y;
}

// Forward-by-Y interpolation along a curve: given y, return x.
// Used when the lookup variable is the curve's Y axis (e.g. HOGE lower panel,
// where wind is Y and we want q_final at that wind). Assumes curve is sorted
// by y ascending. Clamps at ends.
function interpAlongCurveByY(curve, y) {
  if (y <= curve[0].y) return curve[0].x;
  if (y >= curve[curve.length - 1].y) return curve[curve.length - 1].x;
  for (let i = 0; i < curve.length - 1; i++) {
    if (y >= curve[i].y && y <= curve[i + 1].y) {
      return interp1(y, curve[i].y, curve[i].x, curve[i + 1].y, curve[i + 1].x);
    }
  }
  return curve[curve.length - 1].x;
}

// Inverse interpolation along a curve: given y, return x.
// Assumes curve is monotonic in y (true for our PA top-panel curves: as
// EngTq rises, x rises). Clamps at ends.
function inverseInterpAlongCurve(curve, y) {
  if (y <= curve[0].y) return curve[0].x;
  if (y >= curve[curve.length - 1].y) return curve[curve.length - 1].x;
  for (let i = 0; i < curve.length - 1; i++) {
    const yMin = Math.min(curve[i].y, curve[i + 1].y);
    const yMax = Math.max(curve[i].y, curve[i + 1].y);
    if (y >= yMin && y <= yMax) {
      return interp1(y, curve[i].y, curve[i].x, curve[i + 1].y, curve[i + 1].x);
    }
  }
  return curve[curve.length - 1].x;
}


// ---- Chained nomogram lookup (Power Assurance) -----------------------------

// Top panel: (EngTq, PA) → x on reference line.
function lookupTopX(chart, eng_tq, pa) {
  const axis = chart.upper.paAxis;
  const [iLo, iHi] = bracket(axis, pa);
  const paLo = axis[iLo], paHi = axis[iHi];
  const xLo = inverseInterpAlongCurve(chart.upper.curves[String(paLo)], eng_tq);
  if (paLo === paHi) return xLo;
  const xHi = inverseInterpAlongCurve(chart.upper.curves[String(paHi)], eng_tq);
  return interp1(pa, paLo, xLo, paHi, xHi);
}

// Bottom panel: (x, OAT) → MaxTIT °C.
function lookupBottomY(chart, x, oat) {
  const axis = chart.lower.oatAxis;
  const [iLo, iHi] = bracket(axis, oat);
  const oatLo = axis[iLo], oatHi = axis[iHi];
  const yLo = interpAlongCurve(chart.lower.curves[String(oatLo)], x);
  if (oatLo === oatHi) return yLo;
  const yHi = interpAlongCurve(chart.lower.curves[String(oatHi)], x);
  return interp1(oat, oatLo, yLo, oatHi, yHi);
}


// ---- Power Assurance: top-level ---------------------------------------------

// Returns:
//   { ok: true,  maxTIT, x }            — success
//   { ok: false, reason, ...details }   — out-of-envelope, structured error
//
// Out-of-envelope cases are rejected, not silently clamped. Reasons:
//   "pa_outside_band"   — PA outside the chart's band
//   "oat_outside_band"  — OAT outside the chart's OAT axis
//   "engtq_outside_curve" — EngTq above/below the relevant PA curve range
//
// `onGround` adds the chart's per-chart ground correction (e.g. +5°C for
// Eng 1&3, +2°C for Eng 2 in the low band).
function getPowerAssuranceMaxTIT(chart, eng_tq, pa, oat, onGround = false) {
  const paAxis = chart.upper.paAxis;
  if (pa < paAxis[0] || pa > paAxis[paAxis.length - 1]) {
    return {
      ok: false,
      reason: "pa_outside_band",
      pa,
      band: [paAxis[0], paAxis[paAxis.length - 1]],
    };
  }

  const oatAxis = chart.lower.oatAxis;
  if (oat < oatAxis[0] || oat > oatAxis[oatAxis.length - 1]) {
    return {
      ok: false,
      reason: "oat_outside_band",
      oat,
      range: [oatAxis[0], oatAxis[oatAxis.length - 1]],
    };
  }

  // EngTq must lie within the Y-range of every bracketing PA curve, otherwise
  // the inverse interpolation has nothing to return. This catches the real
  // chart-boundary case from validation: EngTq=80 above the +1000 PA curve
  // (which maxes at ~78 EngTq on the Eng 2 chart).
  const [iLo, iHi] = bracket(paAxis, pa);
  for (const idx of [iLo, iHi]) {
    const c = chart.upper.curves[String(paAxis[idx])];
    const yMin = c[0].y;
    const yMax = c[c.length - 1].y;
    if (eng_tq < yMin || eng_tq > yMax) {
      return {
        ok: false,
        reason: "engtq_outside_curve",
        engTq: eng_tq,
        atPA: paAxis[idx],
        range: [yMin, yMax],
      };
    }
  }

  const x = lookupTopX(chart, eng_tq, pa);
  const maxTITInFlight = lookupBottomY(chart, x, oat);
  const groundCorr = onGround ? chart.groundCorrectionC : 0;
  const maxTIT = maxTITInFlight + groundCorr;
  return { ok: true, maxTIT, maxTITInFlight, groundCorr, x };
}


// ---- App-facing convenience -------------------------------------------------

// Resolve the right chart for a (PA band, engine number) and run the lookup.
// Engine numbers 1 and 3 share a chart; engine 2 has its own.
//   bandKey: "low" (more bands as digitized)
//   engineNum: 1, 2, or 3
function lookupPAForEngine(bandKey, engineNum, eng_tq, pa, oat, onGround) {
  const band = AC.perf.powerAssurance.bands[bandKey];
  if (!band) {
    return { ok: false, reason: "band_not_digitized", bandKey };
  }
  const groupKey = (engineNum === 2) ? "2" : "1_3";
  const chart = band.charts[groupKey];
  if (!chart) {
    return { ok: false, reason: "chart_not_digitized", bandKey, groupKey };
  }
  return getPowerAssuranceMaxTIT(chart, eng_tq, pa, oat, onGround);
}

// Pick the right band for a given PA. v1 only has the low band digitized;
// other bands return null and the caller surfaces a "chart not digitized"
// message. As more charts are digitized this populates by adding to
// AC.perf.powerAssurance.bands and updating the ranges below.
function pickPABand(pa) {
  const bands = AC.perf.powerAssurance.bands;
  for (const key of Object.keys(bands)) {
    const b = bands[key];
    if (pa >= b.paMin && pa <= b.paMax) return key;
  }
  return null;
}

// Compute one engine's full row: looks up Chart TIT, computes margin.
//   onGround: boolean
//   engineNum: 1, 2, or 3
//   eng_tq: observed engine torque (%Q)
//   eng_tit: observed engine TIT (°C). If null/undefined, margin is null.
//   pa, oat: shared inputs
function computeEnginePA({ engineNum, eng_tq, eng_tit, pa, oat, onGround }) {
  const bandKey = pickPABand(pa);
  if (bandKey === null) {
    return {
      ok: false,
      reason: "pa_no_band",
      pa,
      message: `PA ${pa} ft is not within any digitized chart band.`,
    };
  }
  const lookup = lookupPAForEngine(bandKey, engineNum, eng_tq, pa, oat, onGround);
  if (!lookup.ok) return lookup;

  const result = {
    ok: true,
    bandKey,
    engineNum,
    chartTIT: lookup.maxTIT,
    engTIT: (eng_tit === null || eng_tit === undefined || isNaN(eng_tit))
      ? null : eng_tit,
    margin: null,
    pass: null,
  };
  if (result.engTIT !== null) {
    result.margin = result.chartTIT - result.engTIT;
    result.pass = result.margin >= 0;
  }
  return result;
}


// ---- Annex B: Engine Power Available --------------------------------------
//
// Looks up OEI %Q from Annex B's (PA, TEMP) surface, applies AI ON penalty
// if active, and derives AEO-equivalent.
//
// Math (per design doc and operator confirmation 26 Apr 26):
//   raw_oei  = interp(PA, TEMP) on AC.perf.powerAvailable.aiOff
//   if AI ON: raw_oei -= AC.perf.aiOnPenaltyPct           (8 %Q for -511)
//   oei      = round(raw_oei)            ← displayed integer OEI
//   raw_aeo  = oei × 2 / 3               ← derived from displayed OEI
//   aeo      = round(raw_aeo)            ← displayed integer AEO
//
// AEO is derived from the *displayed* (rounded) OEI, not from the raw OEI.
// This matches how the FE would hand-derive: read OEI off the chart,
// round it to the nearest integer, then compute OEI × 2/3 and round.
// Operator decision, 26 Apr 26.
//
// Returns:
//   { ok: true, oei, aeoEquiv, oeiRaw, aeoEquivRaw, aiOn }
//   { ok: false, reason: "pa_outside_chart" | "temp_outside_curve", ... }
function getPowerAvailable(pa, temp, antiIce) {
  const chart = AC.perf.powerAvailable.aiOff;
  const paAxis = chart.paAxis;

  if (pa < paAxis[0] || pa > paAxis[paAxis.length - 1]) {
    return {
      ok: false,
      reason: "pa_outside_chart",
      pa,
      range: [paAxis[0], paAxis[paAxis.length - 1]],
    };
  }

  // Bracket PA, interpolate along each bracketing curve to get OEI at TEMP,
  // then linear interpolation between the two by PA.
  const [iLo, iHi] = bracket(paAxis, pa);
  const paLo = paAxis[iLo], paHi = paAxis[iHi];
  const curveLo = chart.curves[String(paLo)];
  const curveHi = chart.curves[String(paHi)];

  // Each curve has its own TEMP extent. Reject if TEMP is outside *both*
  // bracketing curves' ranges — the lookup would be entirely extrapolated.
  // (If TEMP is inside one but not the other we still proceed; clamping on
  // one curve introduces minor error but the other side still anchors the
  // interpolation. This matches how an FE would hand-trace it.)
  const inRange = (curve, t) => t >= curve[0].x && t <= curve[curve.length - 1].x;
  if (!inRange(curveLo, temp) && !inRange(curveHi, temp)) {
    return {
      ok: false,
      reason: "temp_outside_curve",
      temp,
      atPA: [paLo, paHi],
      ranges: [
        [curveLo[0].x, curveLo[curveLo.length - 1].x],
        [curveHi[0].x, curveHi[curveHi.length - 1].x],
      ],
    };
  }

  const oeiLo = interpAlongCurve(curveLo, temp);
  const oeiAtPaHi = (paLo === paHi) ? oeiLo : interpAlongCurve(curveHi, temp);
  let oeiRaw = (paLo === paHi) ? oeiLo : interp1(pa, paLo, oeiLo, paHi, oeiAtPaHi);

  const aiOn = (antiIce === "ON" || antiIce === true);
  if (aiOn) oeiRaw -= AC.perf.aiOnPenaltyPct;

  // Display OEI is rounded first, then AEO is derived from the displayed
  // OEI — matching FE hand-derivation. aeoEquivRaw reflects this so any
  // SAFE-OEI margin computation in SAR Check uses the same number the FE
  // would use.
  const oeiDisplay = Math.round(oeiRaw);
  const aeoRaw = (oeiDisplay * 2) / 3;

  return {
    ok: true,
    oei: oeiDisplay,
    aeoEquiv: Math.round(aeoRaw),
    oeiRaw,
    aeoEquivRaw: aeoRaw,
    aiOn,
  };
}



// ---- Atmospheric helpers --------------------------------------------------
//
// Standard ICAO ISA model. PA in feet, OAT in °C.
//
// Lapse rate: 1.978°C per 1000 ft (ICAO 6.5°C / km, the textbook value).
// DA constant: 118.8 ft per °C deviation from ISA (ICAO standard).
//
// These constants live here, not in config.js, because they are physical
// constants of the standard atmosphere, not aircraft-specific data.

function isaTempC(pa_ft) {
  return 15 - 0.001978 * pa_ft;
}

// Density altitude per ICAO ISA:
//   DA = PA + 118.8 * (OAT - ISA_at_PA)
// At ISA conditions DA = PA. Hot air -> higher DA. Cold air -> lower DA.
function densityAltitudeFt(pa_ft, oat_c) {
  return pa_ft + 118.8 * (oat_c - isaTempC(pa_ft));
}


// ---- HOGE chart lookup ----------------------------------------------------
//
// Chained 2D nomogram, structurally identical to Power Assurance:
//   Upper panel: (DA, AUW)  -> Q at reference line (intermediate Q_ref)
//   Lower panel: (Q_ref, WIND) -> Q final (the chart output, % AEO Q to hover)
//
// AI state selects which sub-chart to use. AI ON pending digitisation.

// Upper panel: inverse-interp along each bracketing AUW curve at the requested
// DA (curves are stored Y=DA, X=Q with DA monotone-ascending), then linear
// interp between the two by AUW.
function lookupHogeUpper(chart, da, auw) {
  const axis = chart.upper.auwAxis;
  const [iLo, iHi] = bracket(axis, auw);
  const auwLo = axis[iLo], auwHi = axis[iHi];
  const cLo = chart.upper.curves[String(auwLo)];
  const cHi = chart.upper.curves[String(auwHi)];

  // Each AUW curve has its own DA range (heavier curves end early at high DA,
  // and the chart's lowest gridline is -8000 ft but operator clicks were at
  // -7472 ft). If DA is outside *either* bracketing curve, the lookup is
  // unsafe — surface the boundary, don't extrapolate.
  const inRange = (c, v) => v >= c[0].y && v <= c[c.length - 1].y;
  if (!inRange(cLo, da) || !inRange(cHi, da)) return null;

  const qLo = inverseInterpAlongCurve(cLo, da);
  if (auwLo === auwHi) return qLo;
  const qHi = inverseInterpAlongCurve(cHi, da);
  return interp1(auw, auwLo, qLo, auwHi, qHi);
}

// Lower panel: forward-by-Y along each bracketing entry-Q curve at the
// requested wind (curves are stored Y=wind kt, X=q_final with wind
// monotone-ascending), then linear interp between the two by entry Q.
function lookupHogeLower(chart, q_ref, wind) {
  const axis = chart.lower.entryQAxis;
  const [iLo, iHi] = bracket(axis, q_ref);
  const qLo = axis[iLo], qHi = axis[iHi];
  const cLo = chart.lower.curves[String(qLo)];
  const cHi = chart.lower.curves[String(qHi)];

  // Each entry-Q curve has its own wind extent. The Q=130 curve is the
  // important case: its natural lower bound is +7.7 kt (chart envelope, not
  // missing data). If wind is outside *either* bracketing curve, the lookup
  // is unsafe.
  const inRange = (c, v) => v >= c[0].y && v <= c[c.length - 1].y;
  if (!inRange(cLo, wind) || !inRange(cHi, wind)) return null;

  const fLo = interpAlongCurveByY(cLo, wind);
  if (qLo === qHi) return fLo;
  const fHi = interpAlongCurveByY(cHi, wind);
  return interp1(q_ref, qLo, fLo, qHi, fHi);
}


// ---- HOGE: top-level -------------------------------------------------------
//
// Computes chart-derived hover Q from PA, OAT, AUW, WIND, AI state. PA->DA
// conversion is done internally; the chart's primary axis is DA, but the
// pilots brief PA + OAT separately so the app does the conversion.
//
// Returns:
//   { ok: true, qHover, qRef, da }                          — success
//   { ok: false, reason, ... }                              — out of envelope
//
// Reasons:
//   "chart_not_digitized"  — AI ON requested but data not yet digitized
//   "auw_outside_chart"    — AUW outside the chart's AUW axis
//   "da_outside_curve"     — DA outside one or both bracketing AUW curves
//   "wind_outside_curve"   — Wind outside one or both bracketing entry-Q
//                            curves (most often: Q_ref > 120 at low wind,
//                            because the Q=130 curve doesn't reach the
//                            reference line)

function getHOGE({ pa, oat, auw, wind, antiIce }) {
  const aiOn = (antiIce === "ON" || antiIce === true);
  const chart = aiOn ? AC.perf.hoge.aiOn : AC.perf.hoge.aiOff;
  if (!chart) {
    return { ok: false, reason: "chart_not_digitized", antiIce: aiOn ? "ON" : "OFF" };
  }

  const da = densityAltitudeFt(pa, oat);

  const auwAxis = chart.upper.auwAxis;
  if (auw < auwAxis[0] || auw > auwAxis[auwAxis.length - 1]) {
    return {
      ok: false,
      reason: "auw_outside_chart",
      auw,
      range: [auwAxis[0], auwAxis[auwAxis.length - 1]],
      da,
    };
  }

  const qRef = lookupHogeUpper(chart, da, auw);
  if (qRef === null) {
    return { ok: false, reason: "da_outside_curve", da, auw };
  }

  const qHover = lookupHogeLower(chart, qRef, wind);
  if (qHover === null) {
    return { ok: false, reason: "wind_outside_curve", wind, qRef, da };
  }

  return { ok: true, qHover, qRef, da };
}


// ---- Transfer Value lookup ------------------------------------------------
//
// Simple 1D lookup: DA (ft) -> Transfer Value.
// DA is computed internally from PA + OAT (same ISA formula as elsewhere).
// The FM chart is drawn as PA-curves vs OAT but collapses to a single
// TV lookup — supports two chart structures:
//   AI OFF: chart.curve = [{x: da_ft, y: tv}, ...] — single DA->TV curve.
//   AI ON:  chart.curves = [{pa, oatTop, oatStep, tvs:[...]}, ...] — true 2D.
//
// Returns:
//   { ok: true,  tv, da }
//   { ok: false, reason: "chart_not_digitized" | "da_outside_chart" | "pa_oat_outside_chart", da }

function getTransferValue(pa, oat, antiIce) {
  const aiOn  = (antiIce === "ON" || antiIce === true);
  const chart = aiOn ? AC.perf.transferValue.aiOn : AC.perf.transferValue.aiOff;
  if (!chart) return { ok: false, reason: "chart_not_digitized", antiIce: aiOn ? "ON" : "OFF" };

  const da = densityAltitudeFt(pa, oat);

  // ── 2D (PA, OAT) lookup ───────────────────────────────────────────────────
  if (chart.curves) {
    const curves  = chart.curves;
    const paAxis  = curves.map(c => c.pa);

    // Bracket PA
    let paLoIdx = 0, paHiIdx = 0;
    if (pa <= paAxis[0]) {
      paLoIdx = paHiIdx = 0;
    } else if (pa >= paAxis[paAxis.length - 1]) {
      paLoIdx = paHiIdx = paAxis.length - 1;
    } else {
      for (let i = 0; i < paAxis.length - 1; i++) {
        if (paAxis[i] <= pa && pa <= paAxis[i + 1]) { paLoIdx = i; paHiIdx = i + 1; break; }
      }
    }

    // Interpolate OAT on one PA curve
    function tvAtOat(cIdx, oatIn) {
      const c    = curves[cIdx];
      const oats = [];
      for (let o = c.oatTop; o >= -45; o += c.oatStep) oats.push(o);
      const oatC = Math.max(oats[oats.length - 1], Math.min(oats[0], oatIn));
      if (oatC >= oats[0])  return c.tvs[0];
      if (oatC <= oats[oats.length - 1]) return c.tvs[oats.length - 1];
      for (let i = 0; i < oats.length - 1; i++) {
        if (oats[i] >= oatC && oatC >= oats[i + 1]) {
          const t = (oatC - oats[i]) / (oats[i + 1] - oats[i]);
          return c.tvs[i] + t * (c.tvs[i + 1] - c.tvs[i]);
        }
      }
      return c.tvs[oats.length - 1];
    }

    const tvLo = tvAtOat(paLoIdx, oat);
    const tvHi = tvAtOat(paHiIdx, oat);
    const tv   = (paLoIdx === paHiIdx)
      ? tvLo
      : tvLo + (pa - paAxis[paLoIdx]) / (paAxis[paHiIdx] - paAxis[paLoIdx]) * (tvHi - tvLo);

    return { ok: true, tv: parseFloat(tv.toFixed(2)), da };
  }

  // ── Single DA->TV curve (AI OFF) ──────────────────────────────────────────
  const curve = chart.curve;
  if (da < curve[0].x || da > curve[curve.length - 1].x) {
    return { ok: false, reason: "da_outside_chart", da,
             range: [curve[0].x, curve[curve.length - 1].x] };
  }
  const tv = interpAlongCurve(curve, da);
  return { ok: true, tv: parseFloat(tv.toFixed(2)), da };
}


// ---- Height Loss and Safe Reject lookups ------------------------------------
//
// Both are Pattern A chained nomograms (PORTING_NOTES §3.2), identical in
// structure to HOGE. Primary axis is TV (not DA). Output is in feet.
//
// Lower panel twist: WPD-Y values are stored in TV-axis units and must be
// converted to wind kt via the per-chart yToWind calibration object before
// use. Until yToWind is populated the lookup returns "calibration_pending".
//
// Returns (success):
//   { ok: true, hlFt (or srFt), xRef, tv }
// Returns (failure):
//   { ok: false, reason, ... }
//
// Reasons:
//   "chart_not_digitized"    — chart const is null (pending)
//   "calibration_pending"    — lower panel yToWind not yet filled in
//   "tv_failed"              — getTransferValue failed (propagated)
//   "auw_outside_chart"      — AUW outside the chart's AUW axis
//   "tv_outside_curve"       — TV outside both bracketing AUW curves
//   "wind_outside_curve"     — wind outside bracketing entry-xRef curves

// Convert a lower-panel WPD-Y value to wind kt using the yToWind calibration.
function _wpdYToWindKt(yToWind, wpdY) {
  const { yAt0kt, yAtMaxKt, maxKt } = yToWind;
  if (yAt0kt === null || yAtMaxKt === null || maxKt === null) return null;
  return Math.max(0, ((wpdY - yAt0kt) / (yAtMaxKt - yAt0kt)) * maxKt);
}

// Generic Pattern A lower-panel lookup for HL/SR charts.
// chart.lower uses entryXRefAxis and curves with raw WPD-Y values.
//
// Wind rejection policy: same "both-curves" rule as _lookupHLSRUpper.
// The reference line is exactly 0 kt, so wind=0 must always succeed.
// Curve endpoints may deviate by a fraction of a kt due to WPD digitization
// noise (e.g. maxY=2.3881 → 0.07 kt instead of exactly 0.00). Rejecting
// when wind=0 is outside one curve but not the other would be wrong —
// interpAlongCurveByY already clamps at the endpoint, so proceed.
function _lookupHLSRLower(chart, xRef, wind) {
  const cal = chart.lower.yToWind;
  if (!cal || cal.yAt0kt === null) return { ok: false, reason: "calibration_pending" };

  const axis = chart.lower.entryXRefAxis;
  const [iLo, iHi] = bracket(axis, xRef);
  const eLo = axis[iLo], eHi = axis[iHi];
  const cLo = chart.lower.curves[String(eLo)];
  const cHi = chart.lower.curves[String(eHi)];

  // Build transformed curves (wpdY → wind kt) on the fly.
  const transform = (curve) =>
    curve.map(pt => ({ x: pt.x, y: _wpdYToWindKt(cal, pt.y) })).sort((a, b) => a.y - b.y);

  const tLo = transform(cLo);
  const tHi = transform(cHi);

  // Reject only when wind is outside BOTH transformed curves.
  // interpAlongCurveByY clamps at endpoints, so an out-of-range side
  // contributes its endpoint x_final value — valid for minor exceedances
  // caused by digitization noise near 0 kt and 30 kt.
  const inRange   = (c, v) => v >= c[0].y && v <= c[c.length - 1].y;
  const aboveMax  = (c, v) => v > c[c.length - 1].y;
  const belowMin  = (c, v) => v < c[0].y;

  if (!inRange(tLo, wind) && !inRange(tHi, wind)) {
    // Wind above both curve maxima: the SR value has run off the right edge of
    // the chart (≥ ANY HEIGHT threshold). Per FM intent, brief as ANY HEIGHT.
    if (aboveMax(tLo, wind) && aboveMax(tHi, wind)) {
      return { ok: true, anyHeight: true, xFinal: null };
    }
    // Wind below both curve minima: genuine out-of-envelope, hard reject.
    if (belowMin(tLo, wind) && belowMin(tHi, wind)) {
      return { ok: false, reason: "wind_outside_curve", wind, xRef };
    }
    // Mixed (one above, one below): shouldn't occur with well-formed chart
    // data but clamp and continue rather than hard-reject.
  }

  const fLo = interpAlongCurveByY(tLo, wind);
  if (eLo === eHi) return { ok: true, xFinal: fLo };
  const fHi = interpAlongCurveByY(tHi, wind);
  return { ok: true, xFinal: interp1(xRef, eLo, fLo, eHi, fHi) };
}

// Generic Pattern A upper-panel lookup for HL/SR charts.
// Curves: X = x_ref on shared axis, Y = TV (ascending). Returns x_ref.
//
// Rejection policy: only reject when TV is outside BOTH bracketing AUW curves.
// If TV is inside one but not the other (e.g. a lighter-AUW curve tops out
// before a heavier one reaches the same TV), interpolation is still valid —
// the in-range curve anchors one side and inverseInterpAlongCurve clamps the
// out-of-range curve to its endpoint. This matches getPowerAvailable policy
// and prevents false rejections near the upper-TV boundary at higher AUW.
//
// Returns: { xRef: number }  — success
//          null               — TV below both curves (below chart, hard reject)
//          { aboveChart: true } — TV above both curves (SR-specific: ANY HEIGHT)
function _lookupHLSRUpper(chart, tv, auw) {
  const axis = chart.upper.auwAxis;
  const [iLo, iHi] = bracket(axis, auw);
  const auwLo = axis[iLo], auwHi = axis[iHi];
  const cLo = chart.upper.curves[String(auwLo)];
  const cHi = chart.upper.curves[String(auwHi)];

  const belowCurve = (c, v) => v < c[0].y;
  const aboveCurve = (c, v) => v > c[c.length - 1].y;
  const inRange    = (c, v) => !belowCurve(c, v) && !aboveCurve(c, v);

  // If TV is above both curves the aircraft is above the chart envelope.
  // For SR this means ANY HEIGHT (caller detects { aboveChart: true }).
  if (aboveCurve(cLo, tv) && aboveCurve(cHi, tv)) return { aboveChart: true };

  // If TV is below both curves it is genuinely out of envelope — hard reject.
  if (belowCurve(cLo, tv) && belowCurve(cHi, tv)) return null;

  // Curves: Y = TV (ascending), X = x_ref. We want x_ref given TV → inverse.
  // inverseInterpAlongCurve clamps at the curve's TV endpoints, so an
  // out-of-range curve simply contributes its endpoint x_ref value.
  const xRefLo = inverseInterpAlongCurve(cLo, tv);
  if (auwLo === auwHi) return { xRef: xRefLo };
  const xRefHi = inverseInterpAlongCurve(cHi, tv);
  return { xRef: interp1(auw, auwLo, xRefLo, auwHi, xRefHi) };
}

function getHeightLoss({ pa, oat, auw, wind, antiIce }) {
  const aiOn = (antiIce === "ON" || antiIce === true);
  const chart = aiOn
    ? (AC.perf.heightLoss && AC.perf.heightLoss.aiOn)
    : (AC.perf.heightLoss && AC.perf.heightLoss.aiOff);
  if (!chart) return { ok: false, reason: "chart_not_digitized", antiIce: aiOn ? "ON" : "OFF" };

  const tvResult = getTransferValue(pa, oat, antiIce);
  if (!tvResult.ok) return { ok: false, reason: "tv_failed", tvResult };
  const tv = tvResult.tv;

  const auwAxis = chart.upper.auwAxis;
  if (auw < auwAxis[0] || auw > auwAxis[auwAxis.length - 1]) {
    return { ok: false, reason: "auw_outside_chart", auw, range: [auwAxis[0], auwAxis[auwAxis.length - 1]] };
  }

  const upperResult = _lookupHLSRUpper(chart, tv, auw);
  if (upperResult === null || upperResult.aboveChart)
    return { ok: true, anyHeight: true, hlFt: null, xRef: null, tv };
  const xRef = upperResult.xRef;

  const lowerResult = _lookupHLSRLower(chart, xRef, wind);
  if (!lowerResult.ok) return { ...lowerResult, tv, xRef };
  if (lowerResult.anyHeight) return { ok: true, anyHeight: true, hlFt: null, xRef, tv };

  return { ok: true, hlFt: Math.round(lowerResult.xFinal), xRef, tv };
}

function getSafeReject({ pa, oat, auw, wind, antiIce }) {
  const aiOn = (antiIce === "ON" || antiIce === true);
  const chart = aiOn
    ? (AC.perf.safeReject && AC.perf.safeReject.aiOn)
    : (AC.perf.safeReject && AC.perf.safeReject.aiOff);
  if (!chart) return { ok: false, reason: "chart_not_digitized", antiIce: aiOn ? "ON" : "OFF" };

  const tvResult = getTransferValue(pa, oat, antiIce);
  if (!tvResult.ok) return { ok: false, reason: "tv_failed", tvResult };
  const tv = tvResult.tv;

  const auwAxis = chart.upper.auwAxis;
  if (auw < auwAxis[0] || auw > auwAxis[auwAxis.length - 1]) {
    return { ok: false, reason: "auw_outside_chart", auw, range: [auwAxis[0], auwAxis[auwAxis.length - 1]] };
  }

  const upperResult = _lookupHLSRUpper(chart, tv, auw);
  if (upperResult === null) return { ok: false, reason: "tv_outside_curve", tv, auw };

  // aboveChart: TV exceeds the top of the SR chart for this AUW. Per FM, this
  // means the aircraft can reject from ANY HEIGHT without accelerating to a
  // structural limit — brief as ANY HEIGHT (srFt=null, anyHeight=true).
  if (upperResult.aboveChart) {
    return { ok: true, srFt: null, anyHeight: true, xRef: null, tv,
             note: "TV above SR chart envelope — ANY HEIGHT per FM" };
  }
  const xRef = upperResult.xRef;

  const lowerResult = _lookupHLSRLower(chart, xRef, wind);
  if (!lowerResult.ok) return { ...lowerResult, tv, xRef };

  // Wind drove SR off the right edge of the lower panel — ANY HEIGHT per FM.
  if (lowerResult.anyHeight) {
    return { ok: true, srFt: null, anyHeight: true, xRef, tv,
             note: "Wind correction drove SR beyond chart boundary — ANY HEIGHT per FM" };
  }

  const srFt = Math.round(lowerResult.xFinal);
  return {
    ok: true,
    srFt,
    anyHeight: srFt >= (AC.perf.srAnyHeightThresholdFt || 80),
    xRef, tv,
  };
}


// ---- SAR Check: SAFE OEI test ---------------------------------------------
//
// Per PERF_APP_DESIGN §3A.5, the SAR Check workflow runs three lookups:
//   1. HOGE from chart at (DA, AUW, WIND, AI)         — getHOGE
//   2. PWR available from Annex B at (PA, TEMP, AI)   — getPowerAvailable
//   3. SAFE OEI test: HOGE <= aeoEquiv - oeiMargin?
//
// Both lookups can fail independently (out-of-envelope on either chart).
// When either fails the safety verdict is `null` and the caller surfaces the
// underlying error — we never claim SAFE or NOT SAFE without both numbers.
//
// Returns:
//   {
//     hoge:       <getHOGE result, ok or not ok>,
//     power:      <getPowerAvailable result, ok or not ok>,
//     safeOEI:    true | false | null,    // null when either lookup failed
//     margin:     number | null,          // aeoEquiv - hoge.qHover, signed.
//                                         //   positive = SAFE, negative = NOT SAFE
//     marginRule: number,                 // the configured oeiMargin (% Q)
//   }
//
// `margin` (the absolute headroom in % Q) is what the FE wants to see when
// the verdict is SAFE — "by how much?" — and when NOT SAFE — "by how much
// short?". It's signed so the formatter can render +N or -N without a
// separate flag.

function evaluateSAROEISafety({ pa, oat, auw, wind, antiIce }) {
  const tv         = getTransferValue(pa, oat, antiIce);
  const hoge       = getHOGE({ pa, oat, auw, wind, antiIce });
  const power      = getPowerAvailable(pa, oat, antiIce);
  const marginRule = AC.perf.oeiMargin || 0;

  // All three lookups must succeed before we can render a SAFE/NOT SAFE verdict.
  if (!hoge.ok || !power.ok) {
    return { tv, hoge, power, safeOEI: null, margin: null, marginRule };
  }

  // §3A.5 step 2: HOGE <= AEO-equivalent, with optional operational buffer.
  // Uses the displayed (rounded) AEO matching FE hand-derivation (26 Apr 26).
  const margin  = power.aeoEquiv - hoge.qHover;
  const safeOEI = hoge.qHover <= (power.aeoEquiv - marginRule);

  return { tv, hoge, power, safeOEI, margin, marginRule };
}


// ---- Maximum Mass to Hover — Fig 4-21 -------------------------------------
//
// Three-panel chained nomogram. All panels share a common mass X-axis.
// Reading procedure:
//   Panel 1: (PA, OAT) → base max mass (kg)
//   Panel 2: (base mass, headwind) → wind-corrected mass (kg)
//   Panel 3: (wind-corrected mass, TM%) → final max AUM (kg)
//
// Performance improves moving RIGHT (higher mass = better hover capability).
//
// Out-of-envelope policy:
//   Panel 1 right edge (OAT very cold / PA very low): conditions exceed chart
//     limits in the favourable direction — hover is unrestricted, cap at ALT_AUM.
//   Panel 1 left edge (OAT very hot / PA very high): cannot hover at any
//     operationally relevant AUW — hard reject.
//   Panels 2 & 3: clamp at curve ends (headwind/TM outside digitized range);
//     the caller surfaces a warning flag rather than a hard reject.
//
// Returns one of:
//   { ok: true,  baseMass, windMass, finalMass, unrestricted, aumFlag,
//               windClamped, tmClamped }
//   { ok: false, reason, ...details }
//
// aumFlag values (set on ok:true results):
//   null           — finalMass < HOV_MAX_AUM, no threshold crossed
//   "approaching"  — finalMass within 200 kg below HOV_MAX_AUM
//   "at_max_aum"   — finalMass >= HOV_MAX_AUM and < HOV_ALT_AUM
//   "at_alt_aum"   — finalMass >= HOV_ALT_AUM (unrestricted also sets this)


// -- Panel 1 helper ----------------------------------------------------------
// Given PA and OAT, interpolate across the two bracketing PA curves to return
// the base max mass. Each PA curve is stored { oat, mass } sorted by OAT asc;
// we interpolate along each curve at the requested OAT (→ mass), then interp
// between the two PA values.
//
// Returns: { mass: number, unrestricted: bool, cannotHover: bool }
function _hovPanel1(paData, pa, oat) {
  const axis = paData.paAxis;

  // PA outside chart range
  if (pa > axis[axis.length - 1]) {
    // Above highest PA curve — conditions worse than chart covers. Cannot hover.
    return { mass: null, unrestricted: false, cannotHover: true };
  }
  if (pa < axis[0]) {
    // Below lowest PA curve — excellent conditions, treat as unrestricted.
    return { mass: null, unrestricted: true, cannotHover: false };
  }

  const [iLo, iHi] = bracket(axis, pa);
  const paLo = axis[iLo], paHi = axis[iHi];
  const cLo  = paData.curves[String(paLo)];
  const cHi  = paData.curves[String(paHi)];

  // Helper: given a PA curve { oat, mass }, interpolate mass at the input OAT.
  // The curve is sorted OAT ascending; mass decreases as OAT increases
  // (hotter → lower hover limit). We use the generic primitives adapted for
  // the {oat, mass} shape.
  function interpCurveAtOAT(curve, oat_in) {
    // Off the cold end → unrestricted (right edge of chart = best performance)
    if (oat_in <= curve[0].oat)  return { mass: curve[0].mass,                unrestricted: true,  cannotHover: false };
    // Off the hot end → cannot hover (left edge of chart = worst performance)
    if (oat_in >= curve[curve.length - 1].oat) return { mass: curve[curve.length - 1].mass, unrestricted: false, cannotHover: true  };
    for (let i = 0; i < curve.length - 1; i++) {
      if (oat_in >= curve[i].oat && oat_in <= curve[i + 1].oat) {
        const m = interp1(oat_in, curve[i].oat, curve[i].mass,
                                  curve[i + 1].oat, curve[i + 1].mass);
        return { mass: m, unrestricted: false, cannotHover: false };
      }
    }
    return { mass: curve[curve.length - 1].mass, unrestricted: false, cannotHover: false };
  }

  const rLo = interpCurveAtOAT(cLo, oat);
  if (paLo === paHi) return rLo;
  const rHi = interpCurveAtOAT(cHi, oat);

  // If either end is unrestricted, return unrestricted.
  if (rLo.unrestricted || rHi.unrestricted) return { mass: null, unrestricted: true, cannotHover: false };
  // If either end cannot hover, return cannot hover (conservative).
  if (rLo.cannotHover  || rHi.cannotHover)  return { mass: null, unrestricted: false, cannotHover: true  };

  // Both in range: interpolate between the two PA curve masses.
  const mass = interp1(pa, paLo, rLo.mass, paHi, rHi.mass);
  return { mass, unrestricted: false, cannotHover: false };
}


// -- Panel 2 helper ----------------------------------------------------------
// Given a base mass and headwind, interpolate across the two bracketing mass
// curves (stored { wind, mass } sorted wind asc) to return corrected mass.
// `wind` = 0 → ref line passthrough (corrected mass ≈ base mass).
// Clamps wind at curve ends; sets windClamped flag if wind is out of range.
//
// Returns: { mass: number, windClamped: bool }
function _hovPanel2(windData, baseMass, wind) {
  const axis = windData.massAxis;
  const [iLo, iHi] = bracket(axis, baseMass);
  const mLo = axis[iLo], mHi = axis[iHi];
  const cLo = windData.curves[String(mLo)];
  const cHi = windData.curves[String(mHi)];

  // Clamp wind to the range covered by the digitized curves; note if clamped.
  const windMinLo = cLo[0].wind,  windMaxLo = cLo[cLo.length - 1].wind;
  const windMinHi = cHi[0].wind,  windMaxHi = cHi[cHi.length - 1].wind;
  const windMin   = Math.max(windMinLo, windMinHi);
  const windMax   = Math.min(windMaxLo, windMaxHi);
  let   windClamped = false;
  let   windEff = wind;
  if (wind < windMin) { windEff = windMin; windClamped = (wind < windMin - 0.5); }
  if (wind > windMax) { windEff = windMax; windClamped = true; }

  // Interpolate mass from each curve at the effective wind.
  function interpCurveAtWind(curve, w) {
    if (w <= curve[0].wind)              return curve[0].mass;
    if (w >= curve[curve.length-1].wind) return curve[curve.length-1].mass;
    for (let i = 0; i < curve.length - 1; i++) {
      if (w >= curve[i].wind && w <= curve[i+1].wind) {
        return interp1(w, curve[i].wind, curve[i].mass,
                          curve[i+1].wind, curve[i+1].mass);
      }
    }
    return curve[curve.length-1].mass;
  }

  const massLo = interpCurveAtWind(cLo, windEff);
  if (mLo === mHi) return { mass: massLo, windClamped };
  const massHi = interpCurveAtWind(cHi, windEff);
  const mass   = interp1(baseMass, mLo, massLo, mHi, massHi);
  return { mass, windClamped };
}


// -- Panel 3 helper ----------------------------------------------------------
// Given a wind-corrected mass and TM%, interpolate across the two bracketing
// mass curves (stored { tm, mass } sorted tm asc) to return final max AUM.
// TM = 0 → ref line passthrough. Clamps TM at curve ends; sets tmClamped flag.
//
// Returns: { mass: number, tmClamped: bool }
function _hovPanel3(tmData, windMass, tm) {
  // TM = 0 → skip panel, passthrough
  if (tm <= 0) return { mass: windMass, tmClamped: false };

  const axis = tmData.massAxis;
  const [iLo, iHi] = bracket(axis, windMass);
  const mLo = axis[iLo], mHi = axis[iHi];
  const cLo = tmData.curves[String(mLo)];
  const cHi = tmData.curves[String(mHi)];

  const tmMax = Math.min(cLo[cLo.length-1].tm, cHi[cHi.length-1].tm);
  let   tmClamped = false;
  let   tmEff = tm;
  if (tm > tmMax) { tmEff = tmMax; tmClamped = true; }
  if (tm < 0)     { tmEff = 0; }

  function interpCurveAtTM(curve, t) {
    if (t <= curve[0].tm)              return curve[0].mass;
    if (t >= curve[curve.length-1].tm) return curve[curve.length-1].mass;
    for (let i = 0; i < curve.length - 1; i++) {
      if (t >= curve[i].tm && t <= curve[i+1].tm) {
        return interp1(t, curve[i].tm, curve[i].mass,
                          curve[i+1].tm, curve[i+1].mass);
      }
    }
    return curve[curve.length-1].mass;
  }

  const massLo = interpCurveAtTM(cLo, tmEff);
  if (mLo === mHi) return { mass: massLo, tmClamped };
  const massHi = interpCurveAtTM(cHi, tmEff);
  const mass   = interp1(windMass, mLo, massLo, mHi, massHi);
  return { mass, tmClamped };
}


// -- AUM flag helper ---------------------------------------------------------
function _hovAumFlag(mass, maxAum, altAum) {
  if (mass >= altAum)          return "at_alt_aum";
  if (mass >= maxAum)          return "at_max_aum";
  if (mass >= maxAum - 200)    return "approaching";
  return null;
}


// -- Top-level ---------------------------------------------------------------
//
// Inputs:
//   pa       — Pressure altitude (ft)
//   oat      — Outside air temperature (°C)
//   wind     — Headwind component (kt), 0 for no wind
//   tm       — Thrust margin reserve (%), 0 for no planning margin
//   antiIce  — "OFF" | "ON" (AI ON chart pending; rejects if AI ON)
//
// Returns: see header comment above.
function getMaxMassToHover({ pa, oat, wind = 0, tm = 0, antiIce = "OFF", rating = "maxCont" }) {
  const aiOn = (antiIce === "ON" || antiIce === true);
  const ratingData = AC.perf.maxMassToHover && AC.perf.maxMassToHover[rating];
  if (!ratingData) {
    return { ok: false, reason: "chart_not_digitized", antiIce: aiOn ? "ON" : "OFF", rating };
  }
  const hovState = aiOn ? ratingData.aiOn : ratingData.aiOff;
  if (!hovState) {
    return { ok: false, reason: "chart_not_digitized", antiIce: aiOn ? "ON" : "OFF", rating };
  }
  const hovData = hovState;

  const { maxAum, altAum } = AC.perf.aumLimits;

  // ---- Panel 1 -----------------------------------------------------------
  const p1 = _hovPanel1(hovData.pa, pa, oat);

  if (p1.cannotHover) {
    return {
      ok: false,
      reason: "cannot_hover",
      message: "Conditions outside chart limits — cannot hover at any AUM.",
      pa, oat,
    };
  }

  if (p1.unrestricted) {
    return {
      ok: true,
      unrestricted: true,
      baseMass:  altAum,
      windMass:  altAum,
      finalMass: altAum,
      aumFlag:   "at_alt_aum",
      windClamped: false,
      tmClamped:   false,
      message: "Conditions beyond chart limits — no hover mass restriction. Cap at ALT AUM.",
    };
  }

  const baseMass = p1.mass;

  // ---- Panel 2 -----------------------------------------------------------
  const p2 = _hovPanel2(hovData.wind, baseMass, wind);
  const windMass = p2.mass;

  // ---- Panel 3 -----------------------------------------------------------
  const p3 = _hovPanel3(hovData.tm, windMass, tm);
  const finalMass = Math.round(p3.mass);

  return {
    ok:          true,
    unrestricted: false,
    baseMass:    Math.round(baseMass),
    windMass:    Math.round(windMass),
    finalMass,
    aumFlag:     _hovAumFlag(finalMass, maxAum, altAum),
    windClamped: p2.windClamped,
    tmClamped:   p3.tmClamped,
  };
}


if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
  module.exports = {
    interp1,
    bracket,
    interpAlongCurve,
    interpAlongCurveByY,
    inverseInterpAlongCurve,
    lookupTopX,
    lookupBottomY,
    getPowerAssuranceMaxTIT,
    lookupPAForEngine,
    pickPABand,
    computeEnginePA,
    getPowerAvailable,
    isaTempC,
    densityAltitudeFt,
    lookupHogeUpper,
    lookupHogeLower,
    getTransferValue,
    getHOGE,
    getHeightLoss,
    getSafeReject,
    evaluateSAROEISafety,
  getMaxMassToHover,
  };
}
// ---- Annex B — Power Assurance %Q Reference --------------------------------
// Single-panel: OAT + PA → reference %Q.
// Higher PA or hotter OAT = less dense air = less %Q delivered.
function getAnnexBRefQ({ pa, oat }) {
  const data = AC.perf.annexB && AC.perf.annexB.pa;
  if (!data) return { ok: false, reason: "chart_not_digitized" };
  const axis = data.paAxis;
  if (pa > axis[axis.length - 1] || pa < axis[0])
    return { ok: false, reason: "pa_outside_chart", pa };
  const [iLo, iHi] = bracket(axis, pa);
  const paLo = axis[iLo], paHi = axis[iHi];
  const cLo  = data.curves[String(paLo)];
  const cHi  = data.curves[String(paHi)];
  function interpAtOAT(curve, o) {
    if (o <= curve[0].oat)              return { q: curve[0].q,              clamped: true  };
    if (o >= curve[curve.length-1].oat) return { q: curve[curve.length-1].q, clamped: true  };
    for (let i = 0; i < curve.length - 1; i++) {
      if (o >= curve[i].oat && o <= curve[i+1].oat)
        return { q: interp1(o, curve[i].oat, curve[i].q, curve[i+1].oat, curve[i+1].q), clamped: false };
    }
    return { q: curve[curve.length-1].q, clamped: true };
  }
  const rLo  = interpAtOAT(cLo, oat);
  const rHi  = interpAtOAT(cHi, oat);
  const refQ = (paLo === paHi) ? rLo.q : interp1(pa, paLo, rLo.q, paHi, rHi.q);
  return {
    ok: true,
    refQ:       Math.round(refQ),
    paLo, paHi,
    qLo:        Math.round(rLo.q),
    qHi:        Math.round(rHi.q),
    outsideOAT: rLo.clamped || rHi.clamped,
    traceOAT:   oat,
    tracePA:    pa,
  };
}