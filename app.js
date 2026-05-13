// ============================================================================
// CH-149-511 Performance Calculator — Application Controller
//
// Per family convention (APP_FAMILY_SYNOPSIS §5.1, §5.2): tab routing,
// session state, and rendering live here. Pure math is in compute.js;
// aircraft data is in config.js. This file is the only one that touches
// the DOM.
//
// v1 scope: Power Assurance only.
// ============================================================================


// ---- Session state --------------------------------------------------------

const STORE = {
  antiIce: "OFF",           // "OFF" | "ON" — global, affects all tabs
  currentTab: "pretooff",    // which tab is active
  hover: {
    auw:      null,   // kg
    pa:       null,   // ft
    oat:      null,   // °C
    wind:     null,   // kt headwind (0 if blank)
    tm:       null,   // % thrust margin reserve (0 if blank)
    // antiIce is read directly from STORE.antiIce — not stored here
  },

  fuel: {
    bingoKg:       250,
    planRateKgHr:  800,
    readings:      [],
    legs:          [],
    _sessionStart: null,
    _editingIdx:   null,
  },

  // Power Assurance state
  powerAssurance: {
    mode: "inFlight",       // "inFlight" | "onGround"
    pa: null,               // ft, shared
    oat: null,              // °C, shared
    engines: {
      1: { engTq: null, engTit: null },
      2: { engTq: null, engTit: null },
      3: { engTq: null, engTit: null },
    },
  },

  // Pre-Take Off Brief state
  preTakeOff: {
    auw:     null,   // kg — optional, for brief display only
    pa:      null,   // ft
    oat:     null,   // °C
    elev:    null,   // ft — airfield elevation for QNH→PA calc
    qnh:     null,   // hPa or inHg depending on qnhUnit
    qnhUnit: "inhg",  // "hpa" | "inhg"
  },

  // SAR Check Performance Brief state. v0.4: HOGE + SAFE OEI test.
  // Multi-row session log, full F47 working-sheet, and brief format are
  // pending — see PERF_APP_DESIGN §3A.
  sarCheck: {
    auw:        null,      // kg
    pa:         null,      // ft
    oat:        null,      // °C
    wind:       null,      // kt headwind
    hogeValue:  null,      // % Q — whatever is currently in the HOGE field
    hogeSource: "pilot",   // "pilot" | "chart" — tracks how the value arrived
  },
};


// ---- DOM helpers ----------------------------------------------------------

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function clearEl(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") {
      e.addEventListener(k.slice(2).toLowerCase(), v);
    }
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

function num(val) {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function fmtTIT(c) {
  if (c === null || c === undefined || isNaN(c)) return "—";
  return Math.round(c) + "°C";
}

function fmtMargin(c) {
  if (c === null || c === undefined || isNaN(c)) return "—";
  const sign = c >= 0 ? "+" : "−";
  return sign + Math.abs(Math.round(c)) + "°C";
}


// ---- Theme ----------------------------------------------------------------

const THEME_KEY = "perf511_theme";

function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("theme-light", isLight);
  $("#themeToggleIcon").textContent = isLight ? "☀" : "☾";
}

function initTheme() {
  let theme = "dark";
  try { theme = localStorage.getItem(THEME_KEY) || "dark"; } catch (e) {}
  applyTheme(theme);
  $("#themeToggle").addEventListener("click", () => {
    const next = document.body.classList.contains("theme-light") ? "dark" : "light";
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next);
  });
}


// ---- Anti-Ice (global state) -----------------------------------------------

// Sync all AI toggle buttons across all tabs to match STORE.antiIce.
// Called any time STORE.antiIce changes, and when a tab becomes active.
function syncAntiIceButtons() {
  const state = STORE.antiIce;

  // Pre-Take Off tab buttons
  $("[data-pretooff-ai]") && $$("[data-pretooff-ai]").forEach(b => {
    const isActive = b.dataset.pretooffAi === state;
    b.classList.toggle("seg__btn--active", isActive);
    b.setAttribute("aria-checked", isActive);
  });

  // SAR Check tab buttons
  $("[data-sarcb-ai]") && $$("[data-sarcb-ai]").forEach(b => {
    const isActive = b.dataset.sarcbAi === state;
    b.classList.toggle("seg__btn--active", isActive);
    b.setAttribute("aria-checked", isActive);
  });

  // Hover Performance tab buttons
  $("[data-hov-ai]") && $$("[data-hov-ai]").forEach(b => {
    const isActive = b.dataset.hovAi === state;
    b.classList.toggle("seg__btn--active", isActive);
    b.setAttribute("aria-checked", isActive);
  });

  // Header chip — green when AI OFF (reminder to check), red when AI ON
  const chip = $("#antiIceChip");
  chip.textContent = state === "ON" ? "AI ON" : "AI OFF";
  chip.classList.toggle("pill--danger", state === "ON");
  chip.classList.toggle("pill--good",   state === "OFF");
}

function setAntiIce(state) {
  STORE.antiIce = state;
  syncAntiIceButtons();
  rerender();
}

function toggleAntiIce() {
  setAntiIce(STORE.antiIce === "ON" ? "OFF" : "ON");
}


// ---- Tab Routing ----------------------------------------------------------

function showTab(tabName) {
  STORE.currentTab = tabName;

  // Update tab buttons
  $$(".tab").forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("tab--active", isActive);
    btn.setAttribute("aria-selected", isActive);
  });

  // Update tab panels
  $$(".tab-panel").forEach(panel => {
    const isActive =
      (tabName === "pa"       && panel.id === "paPanel") ||
      (tabName === "pretooff" && panel.id === "pretooffPanel") ||
      (tabName === "sarcb"    && panel.id === "sarcbPanel") ||
      (tabName === "fuel"     && panel.id === "fuelPanel") ||
      (tabName === "hover"    && panel.id === "hoverPanel");
    panel.hidden = !isActive;
  });

  if (tabName === "fuel")  renderFuel();
  if (tabName === "hover") renderHover();

  // Ensure AI buttons on the newly-visible tab reflect current STORE.antiIce.
  // This catches the case where AI state changed while on a different tab.
  syncAntiIceButtons();

  rerender();
}


// ---- Mode (in-flight / on-ground, Power Assurance only) ------------------

const MODE_LABELS = {
  inFlight: "In Flight",
  onGround: "On Ground",
};

// Build the hint content for each mode. Returns DOM nodes (not strings).
//
// In-flight: nothing — the conditions are listed in the Required Conditions
// card just below.
//
// On-ground: just the auto-applied corrections, since the procedural setup
// items (65% Q, PALs at Ground Idle) are also in the Required Conditions
// list. The corrections are something the *app* does to the inputs, so they
// belong here as a heads-up rather than in a list of FE responsibilities.
function buildModeHint(mode) {
  if (mode === "inFlight") return [];

  // Read ground corrections from whichever band key is first in config.
  // The correction values are the same across bands (per-chart, not per-band),
  // so any digitized band gives the right values. Use the first available one.
  const bands = AC.perf.powerAssurance.bands;
  const firstBandKey = Object.keys(bands)[0];
  if (!firstBandKey) return [];
  const charts = bands[firstBandKey].charts;
  const c13 = charts["1_3"].groundCorrectionC;
  const c2  = charts["2"].groundCorrectionC;

  return [
    el("span", { class: "hint__lead" }, "Auto-applied corrections:"),
    el("ul", { class: "hint-list" },
      el("li", {}, `Eng 1 & 3: +${c13}°C added to Max Allowable TIT.`),
      el("li", {}, `Eng 2: +${c2}°C added to Max Allowable TIT.`),
    ),
  ];
}

function setMode(mode) {
  STORE.powerAssurance.mode = mode;
  // Scope to the PA mode group only — don't touch AI toggle buttons
  $$("#modeSegGroup .seg__btn").forEach(btn => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle("seg__btn--active", active);
    btn.setAttribute("aria-checked", active);
  });

  // Render the hint as DOM. Hide the element entirely when empty so we don't
  // leave a blank paragraph taking up space (in-flight mode has no hint).
  const hint = $("#modeHint");
  clearEl(hint);
  const nodes = buildModeHint(mode);
  hint.hidden = nodes.length === 0;
  for (const node of nodes) hint.appendChild(node);

  renderPrecheck();
  rerender();
}


// ---- Required conditions (informational reminder, not gated) -------------

function preconditionsForMode() {
  // Key name preserved for now; semantically these are required-conditions
  // reminders, not preconditions. The data shape is the same.
  return AC.perf.powerAssurance.preconditions[STORE.powerAssurance.mode] || [];
}

function renderPrecheck() {
  const list = preconditionsForMode();
  const ul = $("#precheckList");
  clearEl(ul);
  for (const p of list) {
    ul.appendChild(
      el("li", { class: "reqlist__item" },
        el("span", { class: "reqlist__bullet", "aria-hidden": "true" }, "•"),
        el("span", { class: "reqlist__label" }, p.label),
      )
    );
  }
}


// ---- Engine entry rendering ----------------------------------------------

function renderEngines() {
  const wrap = $(".engines");
  if (!wrap) return;
  clearEl(wrap);
  for (const num of [1, 2, 3]) {
    wrap.appendChild(buildEngineCard(num));
  }
}

function buildEngineCard(engNum) {
  const e = STORE.powerAssurance.engines[engNum];

  const tqInput = el("input", {
    class: "field__input mono",
    type: "number",
    inputmode: "decimal",
    step: "0.1",
    placeholder: "—",
    value: e.engTq ?? "",
    onInput: (ev) => {
      STORE.powerAssurance.engines[engNum].engTq = num(ev.target.value);
      renderEngineCard(engNum);
      renderSummary();
    },
  });

  const titInput = el("input", {
    class: "field__input mono",
    type: "number",
    inputmode: "decimal",
    step: "1",
    placeholder: "—",
    value: e.engTit ?? "",
    onInput: (ev) => {
      STORE.powerAssurance.engines[engNum].engTit = num(ev.target.value);
      renderEngineCard(engNum);
      renderSummary();
    },
  });

  const card = el("div", { class: "engine", id: `eng-${engNum}` },
    el("div", { class: "engine__header" },
      el("span", { class: "engine__title" }, `ENG ${engNum}`),
    ),
    el("div", { class: "engine__inputs" },
      el("div", { class: "field" },
        el("label", { class: "field__label" }, "Eng Q"),
        el("div", { class: "field__input-wrap" },
          tqInput,
          el("span", { class: "field__unit" }, "%Q"),
        ),
      ),
      el("div", { class: "field" },
        el("label", { class: "field__label" }, "Eng TIT"),
        el("div", { class: "field__input-wrap" },
          titInput,
          el("span", { class: "field__unit" }, "°C"),
        ),
      ),
    ),
    el("div", { class: "engine__chartTit", id: `eng-${engNum}-chart` },
      el("span", { class: "engine__chartTit-label" }, "Chart TIT"),
      el("span", { class: "engine__chartTit-value", id: `eng-${engNum}-chart-val` }, "—"),
      el("span", { class: "engine__chartTit-note", id: `eng-${engNum}-chart-note`, hidden: true }),
    ),
    el("div", { class: "engine__result", id: `eng-${engNum}-result` }),
  );
  return card;
}

// Re-render the result row of one engine card (lighter than full rebuild,
// avoids stealing focus from inputs)
function renderEngineCard(engNum) {
  const e = STORE.powerAssurance.engines[engNum];
  const chartValEl = $(`#eng-${engNum}-chart-val`);
  const noteEl     = $(`#eng-${engNum}-chart-note`);
  const resultEl   = $(`#eng-${engNum}-result`);
  if (!chartValEl || !resultEl) return;

  // Helper: show/hide the "+N°C ground correction applied" note next to
  // the chart TIT value. Only meaningful when On Ground AND we have a value.
  // `bandKey` comes from the successful compute result.
  const setGroundNote = (show, bandKey) => {
    if (!noteEl) return;
    if (!show) {
      noteEl.hidden = true;
      noteEl.textContent = "";
      return;
    }
    const groupKey = (engNum === 2) ? "2" : "1_3";
    const band = AC.perf.powerAssurance.bands[bandKey];
    if (!band) return;
    const correction = band.charts[groupKey].groundCorrectionC;
    noteEl.textContent = `+${correction}°C ground correction applied`;
    noteEl.hidden = false;
  };

  // Both shared inputs and EngTq must be present to attempt a lookup
  const haveInputs = STORE.powerAssurance.pa !== null && STORE.powerAssurance.oat !== null && e.engTq !== null;
  if (!haveInputs) {
    chartValEl.textContent = "—";
    setGroundNote(false, null);
    resultEl.className = "engine__result";
    clearEl(resultEl);
    resultEl.appendChild(el("span", { class: "engine__result-label" }, "Awaiting inputs"));
    return;
  }

  const r = computeEnginePA({
    engineNum: engNum,
    eng_tq: e.engTq,
    eng_tit: e.engTit,
    pa: STORE.powerAssurance.pa,
    oat: STORE.powerAssurance.oat,
    onGround: STORE.powerAssurance.mode === "onGround",
  });

  if (!r.ok) {
    chartValEl.textContent = "—";
    setGroundNote(false, null);
    resultEl.className = "engine__result engine__result--error";
    clearEl(resultEl);
    resultEl.appendChild(el("span", { class: "engine__result-label" }, "Out of envelope"));
    resultEl.appendChild(el("span", { class: "engine__result-detail" }, describeError(r)));
    return;
  }

  chartValEl.textContent = fmtTIT(r.chartTIT);
  setGroundNote(STORE.powerAssurance.mode === "onGround", r.bandKey);

  if (r.engTIT === null) {
    resultEl.className = "engine__result";
    clearEl(resultEl);
    resultEl.appendChild(el("span", { class: "engine__result-label" }, "Enter Eng TIT to evaluate"));
    return;
  }

  // Final pass/fail
  const pass = r.pass;
  resultEl.className = "engine__result " + (pass ? "engine__result--pass" : "engine__result--fail");
  clearEl(resultEl);
  resultEl.appendChild(el("span", { class: "engine__result-label" }, pass ? "PASS" : "FAIL"));
  resultEl.appendChild(el("span", { class: "engine__result-margin" }, fmtMargin(r.margin)));
}

function describeError(r) {
  switch (r.reason) {
    // Power Assurance errors
    case "pa_no_band":
      return `PA ${r.pa} ft has no chart band digitized yet.`;
    case "band_not_digitized":
      return `Band "${r.bandKey}" not yet digitized.`;
    case "chart_not_digitized":
      return `Chart for engine group "${r.groupKey}" not yet digitized.`;
    case "pa_outside_band":
      return `PA ${r.pa} ft outside chart band [${r.band[0]}, ${r.band[1]}].`;
    case "oat_outside_band":
      return `OAT ${r.oat}°C outside chart range [${r.range[0]}, ${r.range[1]}].`;
    case "engtq_outside_curve":
      return `Eng Q ${r.engTq} above PA=${r.atPA} curve max ${r.range[1].toFixed(1)}.`;
    // Annex B / Power Available errors
    case "pa_outside_chart":
      return `PA ${r.pa} ft outside Annex B range [${r.range[0]}, ${r.range[1]}] ft.`;
    case "temp_outside_curve":
      return `OAT ${r.temp}°C outside Annex B range for the entered PA.`;
    // HOGE errors
    case "chart_not_digitized":
      return `Chart for AI ${r.antiIce} not yet digitised.`;
    case "auw_outside_chart":
      return `AUW ${r.auw} kg outside chart range [${r.range[0]}, ${r.range[1]}] kg.`;
    case "da_outside_curve":
      return `DA ${Math.round(r.da)} ft outside HOGE chart envelope at AUW ${r.auw} kg.`;
    case "wind_outside_curve":
      return r.qRef !== undefined
        ? `Headwind ${r.wind} kt outside HOGE chart envelope at Q_ref=${r.qRef.toFixed(1)}.`
        : `Headwind ${r.wind} kt outside chart envelope at x_ref=${r.xRef !== undefined ? Math.round(r.xRef) : "?"}.`;
    // HL / SR errors
    case "calibration_pending":
      return "Lower-panel calibration not yet filled in (config.js yToWind).";
    case "tv_failed":
      return `TV lookup failed: ${r.tvResult ? describeError(r.tvResult) : "unknown"}`;
    case "tv_outside_curve":
      return `TV ${r.tv !== undefined ? r.tv.toFixed(2) : "?"} outside chart envelope at AUW ${r.auw} kg.`;
    default:
      return `Lookup failed: ${r.reason}`;
  }
}


// ---- Lock states ---------------------------------------------------------

function applyLocks() {
  // Conditions card is always available; Engines and Summary unlock once
  // OAT and PA are filled in. No gating on the Required Conditions reminder.
  const stage = currentStage();
  $("#enginesCard").classList.toggle("card--locked", stage < 4);
  $("#summaryCard").classList.toggle("card--locked", stage < 4);
}

function currentStage() {
  if (STORE.powerAssurance.pa === null || STORE.powerAssurance.oat === null) return 3;
  return 4;
}


// ---- Summary -------------------------------------------------------------

// ============================================================================
// Power Assurance Chart Traces
// Two-panel nomogram: top=%Q vs PA curves, bottom=TIT vs OAT curves
// Trace path: enter %Q → right to PA curve → drop → intersect OAT → read TIT
// Four charts: Eng1&3 low band, Eng2 low band, Eng1&3 mid band, Eng2 mid band
// All images 1700x2200px
// ============================================================================

const PA_TRACE_ENG13_LOW = {
  imgW: 1700, imgH: 2200,
  // Top panel
  topXL: 515, topXR: 1194, topYT: 584, topYJ: 1001,
  // %Q scale: y = yQ1 + (Q1 - q) * dyQ
  yQ1: 845, Q1: 65.0, dyQ: 10.44,
  // PA curves: x = a*y + b  for PA = -1000, 0, +1000
  paVals: [-1000, 0, 1000],
  paCoefs: [
    { a: -1.2571, b: 1747.29 },
    { a: -1.3143, b: 1828.57 },
    { a: -1.3619, b: 1906.81 },
  ],
  // Bottom panel
  botYT: 1001, botYB: 1416, titMax: 950, titMin: 550,
  // OAT curves: x = x0ref + dx0py*(y-yref) + dxOat*oat
  oatYref: 1208, oatX0ref: 846.0, dxOat: -15.10, dx0py: -4.5288,
  // Style
  colTrace: "rgba(0,0,0,0.85)", colTraceDash: [12, 8],
  colDot: "#ffcc00", colResult: "#ff4444",
  colShadow: "rgba(255,255,255,0.85)",
  lineWidth: 3.0, dotRadius: 7,
};

const PA_TRACE_ENG2_LOW = {
  imgW: 1700, imgH: 2200,
  topXL: 556, topXR: 1242, topYT: 554, topYJ: 977,
  yQ1: 818, Q1: 65.0, dyQ: 10.60,
  paVals: [-1000, 0, 1000],
  paCoefs: [
    { a: -1.2453, b: 1745.64 },
    { a: -1.2925, b: 1819.23 },
    { a: -1.3585, b: 1911.25 },
  ],
  botYT: 977, botYB: 1399, titMax: 950, titMin: 550,
  oatYref: 1188, oatX0ref: 860.0, dxOat: -15.50, dx0py: -4.6500,
  colTrace: "rgba(0,0,0,0.85)", colTraceDash: [12, 8],
  colDot: "#ffcc00", colResult: "#ff4444",
  colShadow: "rgba(255,255,255,0.85)",
  lineWidth: 3.0, dotRadius: 7,
};

const PA_TRACE_ENG13_MID = {
  imgW: 1700, imgH: 2200,
  topXL: 522, topXR: 1438, topYT: 507, topYJ: 1072,
  yQ1: 861, Q1: 65.0, dyQ: 14.10,
  paVals: [2000, 3000, 4000],
  paCoefs: [
    { a: -1.4113, b: 2110.17 },
    { a: -1.4539, b: 2199.81 },
    { a: -1.5248, b: 2314.87 },
  ],
  botYT: 1072, botYB: 1637, titMax: 950, titMin: 550,
  oatYref: 1354, oatX0ref: 954.2, dxOat: -20.88, dx0py: -4.7486,
  colTrace: "rgba(0,0,0,0.85)", colTraceDash: [12, 8],
  colDot: "#ffcc00", colResult: "#ff4444",
  colShadow: "rgba(255,255,255,0.85)",
  lineWidth: 3.0, dotRadius: 7,
};

const PA_TRACE_ENG2_MID = {
  imgW: 1700, imgH: 2200,
  topXL: 377, topXR: 1293, topYT: 496, topYJ: 1060,
  yQ1: 919, Q1: 60.0, dyQ: 14.10,
  paVals: [2000, 3000, 4000],
  paCoefs: [
    { a: -1.3972, b: 1935.99 },
    { a: -1.4468, b: 2029.62 },
    { a: -1.5248, b: 2151.31 },
  ],
  botYT: 1060, botYB: 1624, titMax: 950, titMin: 550,
  oatYref: 1413, oatX0ref: 419.0, dxOat: -20.30, dx0py: -4.5423,
  colTrace: "rgba(0,0,0,0.85)", colTraceDash: [12, 8],
  colDot: "#ffcc00", colResult: "#ff4444",
  colShadow: "rgba(255,255,255,0.85)",
  lineWidth: 3.0, dotRadius: 7,
};

// --- Pixel helpers ---

function _paQ2px(q, t) {
  return t.yQ1 + (t.Q1 - q) * t.dyQ;
}

function _paPAcurve2x(q, pa, t) {
  const y = _paQ2px(q, t);
  const pas = t.paVals;
  const cs  = t.paCoefs;
  const x = (idx) => cs[idx].a * y + cs[idx].b;
  if (pa <= pas[0]) return x(0);
  if (pa >= pas[pas.length - 1]) return x(pas.length - 1);
  for (let i = 0; i < pas.length - 1; i++) {
    if (pa >= pas[i] && pa <= pas[i + 1]) {
      const t2 = (pa - pas[i]) / (pas[i + 1] - pas[i]);
      return x(i) + t2 * (x(i + 1) - x(i));
    }
  }
  return x(0);
}

function _paOAT2y(xDrop, oat, t) {
  // Solve x0ref + dx0py*(y-yref) + dxOat*oat = xDrop for y
  return t.oatYref + (xDrop - t.oatX0ref - t.dxOat * oat) / t.dx0py;
}

function _paTIT2px(tit, t) {
  const dy = (t.botYB - t.botYT) / (t.titMax - t.titMin);
  return t.botYT + (t.titMax - tit) * dy;
}

// --- Draw trace ---

function _drawPATrace(canvas, result, engTq, pa, oat, t) {
  if (!result || !result.ok) return;
  const ctx = canvas.getContext("2d");
  const CW = canvas.width, CH = canvas.height;
  ctx.clearRect(0, 0, CW, CH);
  const sx = CW / t.imgW, sy = CH / t.imgH;

  // Pixel positions
  const xDrop  = _paPAcurve2x(engTq, pa, t);
  const yQ     = _paQ2px(engTq, t);
  const yOAT   = _paOAT2y(xDrop, oat, t);
  const yJoin  = t.topYJ;
  const xLeft  = t.topXL - 15;
  const xRight = t.topXR + 10;

  const px = (x) => x * sx;
  const py = (y) => y * sy;

  const dot = (x, y, col, r) => {
    ctx.beginPath();
    ctx.arc(px(x), py(y), ((r || t.dotRadius) + 2) * sx, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fill();
    ctx.beginPath();
    ctx.arc(px(x), py(y), (r || t.dotRadius) * sx, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
  };

  const line = (x1, y1, x2, y2, col, w, dash) => {
    ctx.save(); ctx.beginPath();
    ctx.strokeStyle = col;
    ctx.lineWidth = (w || t.lineWidth) * sx;
    ctx.setLineDash(dash ? dash.map(d => d * sx) : []);
    ctx.moveTo(px(x1), py(y1));
    ctx.lineTo(px(x2), py(y2));
    ctx.stroke(); ctx.restore();
  };

  const lbl = (x, y, text, col, align, base) => {
    ctx.save();
    ctx.font = `bold ${Math.round(13 * sx)}px sans-serif`;
    ctx.textAlign = align || "center";
    ctx.textBaseline = base || "middle";
    ctx.strokeStyle = t.colShadow;
    ctx.lineWidth = 4 * sx;
    ctx.lineJoin = "round";
    ctx.strokeText(text, px(x), py(y));
    ctx.fillStyle = col;
    ctx.fillText(text, px(x), py(y));
    ctx.restore();
  };

  // 1. Horizontal from left edge to PA curve at %Q level (top panel)
  line(xLeft, yQ, xDrop, yQ, t.colTrace, t.lineWidth, t.colTraceDash);
  dot(xDrop, yQ, t.colDot);
  lbl(xLeft + 5, yQ - 12 * sy / sy, `${engTq.toFixed(1)}%Q`, t.colTrace, "left", "bottom");

  // 2. Vertical drop from PA curve intersection through join line into bottom panel
  line(xDrop, yQ, xDrop, yOAT, t.colTrace, t.lineWidth, t.colTraceDash);
  dot(xDrop, yJoin, t.colDot);  // gold dot at join line
  dot(xDrop, yOAT,  t.colDot);  // gold dot at OAT curve intersection

  // 3. Horizontal left from OAT intersection to left axis (Max Allowable TIT)
  line(t.topXL, yOAT, xDrop, yOAT, t.colResult, t.lineWidth, t.colTraceDash);
  dot(t.topXL, yOAT, t.colResult, t.dotRadius + 3);

  // Label result -- always show in-flight value on chart
  const titOnChart = (result.maxTITInFlight !== undefined) ? result.maxTITInFlight : result.chartTIT;
  lbl(t.topXL - 5, yOAT, `${Math.round(titOnChart)}\u00b0C`, t.colResult, "right", "middle");
}

// --- Summary row ---

function _buildPASummaryRow(result, engTq, pa, oat) {
  if (!result || !result.ok) return null;
  const inFlightTIT = (result.maxTITInFlight !== undefined) ? result.maxTITInFlight : result.chartTIT;
  const groundCorr  = result.groundCorr || 0;
  const rows = [
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "Engine Torque"),
      el("span", { class: "trace-summary__value" }, `${engTq.toFixed(1)} %Q`),
    ),
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "Pressure Altitude"),
      el("span", { class: "trace-summary__value" }, `${pa} ft`),
    ),
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "OAT"),
      el("span", { class: "trace-summary__value" }, `${oat}\u00b0C`),
    ),
    el("div", { class: "trace-summary__row trace-summary__row--result" },
      el("span", { class: "trace-summary__label" }, "Max Allowable TIT (in-flight)"),
      el("span", { class: "trace-summary__value trace-summary__value--result" },
        `${Math.round(inFlightTIT)}\u00b0C`),
    ),
  ];
  if (groundCorr > 0) {
    rows.push(
      el("div", { class: "trace-summary__row" },
        el("span", { class: "trace-summary__label" }, "Ground power check"),
        el("span", { class: "trace-summary__value" },
          `+${groundCorr}\u00b0C \u2192 ${Math.round(result.chartTIT)}\u00b0C max allowable`),
      ),
    );
  }
  return el("div", { class: "trace-summary" }, ...rows);
}

// --- Chart details builder ---

function buildPAChartDetailsWithTrace(imgEntry, result, engTq, pa, oat, traceConst) {
  const traceFn   = (result && result.ok)
    ? (canvas) => _drawPATrace(canvas, result, engTq, pa, oat, traceConst)
    : null;
  const summaryFn = (result && result.ok)
    ? () => _buildPASummaryRow(result, engTq, pa, oat)
    : null;
  return buildChartDetailsWithTrace(imgEntry, traceFn, summaryFn);
}



function renderPACharts() {
  const card = $("#paChartsCard");
  const body = $("#paChartsBody");
  if (!card || !body) return;

  // Show once the engine inputs stage is reached
  if (currentStage() < 3) {
    card.hidden = true;
    return;
  }

  const shared = (AC.chartImages && AC.chartImages.shared) || {};
  const pa     = STORE.powerAssurance.pa;

  // Pick the PA chart images for the active band.
  const chartsToShow = [];
  const bandKey = pa != null ? pickPABand(pa) : null;
  if (bandKey === "mid") {
    if (shared.pa13Mid) chartsToShow.push(shared.pa13Mid);
    if (shared.pa2Mid)  chartsToShow.push(shared.pa2Mid);
  } else {
    // Default to low band (covers null / low / any unrecognised band)
    if (shared.pa13Low) chartsToShow.push(shared.pa13Low);
    if (shared.pa2Low)  chartsToShow.push(shared.pa2Low);
  }

  const oat = STORE.powerAssurance.oat;

  // Gather per-engine results for trace (engines 1, 2, 3)
  const engResults = {};
  for (const n of [1, 2, 3]) {
    const e = STORE.powerAssurance.engines[n];
    if (e && e.engTq !== null && pa !== null && oat !== null) {
      engResults[n] = computeEnginePA({
        engineNum: n, eng_tq: e.engTq, eng_tit: e.engTit,
        pa, oat, onGround: false,  // trace always uses in-flight values
      });
    }
  }

  // Pick representative result for trace (prefer eng 1 for 1&3 chart, eng 2 for its chart)
  const res13 = engResults[1] || engResults[3] || null;
  const tq13  = res13 ? (STORE.powerAssurance.engines[engResults[1] ? 1 : 3].engTq) : null;
  const res2  = engResults[2] || null;
  const tq2   = res2  ? STORE.powerAssurance.engines[2].engTq : null;

  // Pick trace calibration constants based on active band
  const tc13 = (bandKey === "mid") ? PA_TRACE_ENG13_MID : PA_TRACE_ENG13_LOW;
  const tc2  = (bandKey === "mid") ? PA_TRACE_ENG2_MID  : PA_TRACE_ENG2_LOW;

  clearEl(body);
  const list = el("div", { class: "chart-refs" });
  for (const imgEntry of chartsToShow) {
    const isEng2  = imgEntry === shared.pa2Low || imgEntry === shared.pa2Mid;
    const result  = isEng2 ? res2  : res13;
    const engTq   = isEng2 ? tq2   : tq13;
    const tc      = isEng2 ? tc2   : tc13;
    const details = (result && result.ok && engTq !== null && pa !== null && oat !== null)
      ? buildPAChartDetailsWithTrace(imgEntry, result, engTq, pa, oat, tc)
      : buildChartDetails(imgEntry);
    if (details) list.appendChild(details);
  }
  body.appendChild(list);
  card.hidden = false;
}

function renderSummary() {
  const body = $("#summaryBody");
  clearEl(body);

  if (currentStage() < 4) {
    body.appendChild(el("p", { class: "muted" }, "Complete the steps above to see results."));
    return;
  }

  // Build per-engine results
  const rows = [1, 2, 3].map(n => {
    const e = STORE.powerAssurance.engines[n];
    if (e.engTq === null) return { num: n, status: "no_input" };
    const r = computeEnginePA({
      engineNum: n,
      eng_tq: e.engTq,
      eng_tit: e.engTit,
      pa: STORE.powerAssurance.pa,
      oat: STORE.powerAssurance.oat,
      onGround: STORE.powerAssurance.mode === "onGround",
    });
    return { num: n, result: r };
  });

  const allHaveInputs = rows.every(r => r.status !== "no_input");
  const allOk = allHaveInputs && rows.every(r => r.result.ok);
  const allEvaluated = allOk && rows.every(r => r.result.engTIT !== null);
  const overallPass = allEvaluated && rows.every(r => r.result.pass === true);
  const anyFail = allEvaluated && rows.some(r => r.result.pass === false);

  // Banner
  let banner;
  if (!allHaveInputs) {
    banner = el("div", { class: "summary-banner summary-banner--warn" },
      "Enter Eng Q for all three engines.");
  } else if (!allOk) {
    banner = el("div", { class: "summary-banner summary-banner--warn" },
      "One or more engines outside chart envelope — see error below.");
  } else if (!allEvaluated) {
    banner = el("div", { class: "summary-banner summary-banner--warn" },
      "Enter Eng TIT for all three engines to evaluate.");
  } else if (overallPass) {
    banner = el("div", { class: "summary-banner summary-banner--good" },
      "All engines PASS");
  } else if (anyFail) {
    banner = el("div", { class: "summary-banner summary-banner--bad" },
      "Power Assurance FAIL");
  }
  if (banner) body.appendChild(banner);

  // Per-engine table
  const table = el("div", { class: "summary-table" });
  for (const r of rows) {
    const label = `ENG ${r.num}`;
    let value, rowClass = "summary-row";
    if (r.status === "no_input") {
      value = "—";
    } else if (!r.result.ok) {
      value = describeError(r.result);
    } else if (r.result.engTIT === null) {
      value = `Chart TIT ${fmtTIT(r.result.chartTIT)} · awaiting Eng TIT`;
    } else {
      const pass = r.result.pass;
      rowClass += pass ? " summary-row--pass" : " summary-row--fail";
      value = `${pass ? "PASS" : "FAIL"}  ${fmtMargin(r.result.margin)} (chart ${fmtTIT(r.result.chartTIT)})`;
    }
    table.appendChild(
      el("div", { class: rowClass },
        el("span", { class: "summary-row__label" }, label),
        el("span", { class: "summary-row__value" }, value),
      )
    );
  }
  body.appendChild(table);
  renderPACharts();
}


// ---- SAR Check Performance Brief ------------------------------------------
//
// v0.5: HOGE may be entered directly from the pilots (aircraft computer) or
// derived from the FM chart. The SAFE OEI test runs against whichever value
// is in the HOGE field. Chart derivation is a cross-check affordance, per
// PERF_APP_DESIGN §3A.2.
//
// SAFE OEI test uses AEO-equivalent from Annex B (§3A.5 confirmed 26 Apr 26).
// `AC.perf.oeiMargin` (default 0) absorbs any operational buffer (§3A.6).

function fmtMarginQ(margin) {
  if (margin === null || isNaN(margin)) return "—";
  const sign = margin >= 0 ? "+" : "−";
  return sign + Math.abs(margin).toFixed(1) + "%Q";
}

function buildSARCheckBrief(safeOEI, auw, power, hogeQ, hlFt, srFt, srAnyHeight) {
  // §3A.4 format.  PWR shows OEI/AEO so both numbers are briefed.
  const auwStr = auw.toLocaleString("en-US");
  const pwr    = `${power.oei}/${power.aeoEquiv}`;
  const hoge   = `${Math.round(hogeQ)}`;
  if (safeOEI) return `${auwStr} / ${pwr} / ${hoge} / SAFE OEI`;
  const hlStr = (hlFt !== null && hlFt !== undefined) ? `${hlFt}` : "—";
  const srStr = (srFt !== null && srFt !== undefined)
    ? (srAnyHeight ? "ANY HEIGHT" : `${srFt}`)
    : "—";
  return `${auwStr} / ${pwr} / ${hoge} / NOT SAFE OEI / ${hlStr} / ${srStr}`;
}

function workingSheetRow(label, value, { muted = false } = {}) {
  return el("div", { class: "summary-row" },
    el("span", { class: "summary-row__label" }, label),
    el("span", { class: "summary-row__value mono" + (muted ? " muted" : "") }, value),
  );
}

// "Calculate from chart" button handler.
// Runs getHOGE, fills STORE.sarCheck.hogeValue + hogeSource, updates the
// input field value, triggers a rerender. Safe to call if conditions are
// incomplete — it will surface an error in the source label and not corrupt
// any pilot-entered value.
function deriveHOGEFromChart() {
  const { pa, oat, auw, wind } = STORE.sarCheck;
  if (pa === null || oat === null || auw === null || wind === null) {
    const lbl = $("#sarcbHogeSourceLabel");
    if (lbl) lbl.textContent = "Enter all conditions before calculating.";
    return;
  }
  const r = getHOGE({ pa, oat, auw, wind, antiIce: STORE.antiIce });
  if (!r.ok) {
    const lbl = $("#sarcbHogeSourceLabel");
    if (lbl) lbl.textContent = `Chart error — ${describeError(r)}`;
    return;
  }
  const q = parseFloat(r.qHover.toFixed(1));
  STORE.sarCheck.hogeValue  = q;
  STORE.sarCheck.hogeSource = "chart";
  const input = $("#sarcbHogeInput");
  if (input) input.value = q;
  rerender();
}

function renderSARCheckHOGE() {
  const body = $("#sarcbHogeBody");
  if (!body) return;
  clearEl(body);

  const { auw, pa, oat, wind, hogeValue, hogeSource } = STORE.sarCheck;
  const conditionsReady = pa !== null && oat !== null && auw !== null && wind !== null;

  // --- Update HOGE source label ---
  const sourceLbl = $("#sarcbHogeSourceLabel");
  if (sourceLbl) {
    if (hogeValue === null) {
      sourceLbl.textContent = "";
    } else if (hogeSource === "chart") {
      sourceLbl.textContent = "Derived from FM chart";
    } else {
      sourceLbl.textContent = "Entered from aircraft computer";
    }
  }

  // --- Transfer Value ---
  let tvResult = null;
  if (pa !== null && oat !== null) {
    tvResult = getTransferValue(pa, oat, STORE.antiIce);
  }

  // --- Annex B / Power Available ---
  // Runs as soon as PA and OAT are set — independent of HOGE source.
  let power = null;
  if (pa !== null && oat !== null) {
    power = getPowerAvailable(pa, oat, STORE.antiIce);
  }

  // --- DA (trace) ---
  let da = null, isaT = null;
  if (pa !== null && oat !== null) {
    da   = densityAltitudeFt(pa, oat);
    isaT = isaTempC(pa);
  }

  // --- Chart HOGE detail (trace, only when source=chart) ---
  // Re-run the chart lookup to get qRef for the "no-wind baseline" note.
  let chartDetail = null;
  if (hogeSource === "chart" && conditionsReady && hogeValue !== null) {
    const cr = getHOGE({ pa, oat, auw, wind, antiIce: STORE.antiIce });
    if (cr.ok) chartDetail = cr;
  }

  // --- SAFE OEI test ---
  let safeOEI = null, margin = null;
  if (hogeValue !== null && power && power.ok) {
    const marginRule = AC.perf.oeiMargin || 0;
    margin  = power.aeoEquiv - hogeValue;
    safeOEI = hogeValue <= (power.aeoEquiv - marginRule);
  }

  // --- HL and SR (function scope — brief section needs access) ---
  // Only computed when NOT SAFE OEI — not needed otherwise.
  let hlResult = null, srResult = null;
  if (safeOEI === false && conditionsReady) {
    hlResult = getHeightLoss({ pa, oat, auw, wind, antiIce: STORE.antiIce });
    srResult = getSafeReject({ pa, oat, auw, wind, antiIce: STORE.antiIce });
  }

  // --- Banner ---
  let banner;
  if (hogeValue === null && !conditionsReady) {
    banner = el("p", { class: "muted" },
      "Enter conditions and HOGE above to calculate.");
  } else if (hogeValue === null) {
    banner = el("p", { class: "muted" },
      "Enter HOGE above (from the aircraft computer or via Calculate).");
  } else if (power && !power.ok) {
    banner = el("div", { class: "summary-banner summary-banner--warn" },
      `PWR out of envelope: ${describeError(power)}`);
  } else if (safeOEI === null) {
    banner = el("p", { class: "muted" },
      "Enter PA and OAT above to evaluate.");
  } else if (safeOEI) {
    banner = el("div", { class: "summary-banner summary-banner--good" },
      `SAFE OEI  (margin ${fmtMarginQ(margin)})`);
  } else {
    banner = el("div", { class: "summary-banner summary-banner--bad" },
      `NOT SAFE OEI  (short by ${fmtMarginQ(margin)})`);
  }
  body.appendChild(banner);

  // --- Working sheet rows ---
  if (pa !== null && oat !== null) {
    const table = el("div", { class: "summary-table", style: "margin-top: 12px;" });

    // TV only shown when NOT SAFE OEI — only needed to determine HL/SR
    if (safeOEI === false) {
      table.appendChild(workingSheetRow("TV",
        tvResult && tvResult.ok
          ? `${tvResult.tv.toFixed(1)}  (DA ${Math.round(tvResult.da)} ft)`
          : "—  (enter PA and OAT)",
        { muted: !(tvResult && tvResult.ok) }
      ));
    }

    if (auw !== null)
      table.appendChild(workingSheetRow("AUW", `${auw.toLocaleString("en-US")} kg`));

    if (power)
      table.appendChild(workingSheetRow("PWR",
        power.ok
          ? `${power.oei} / ${power.aeoEquiv}%Q  (OEI / AEO eq)`
          : `— (${describeError(power)})`
      ));

    if (hogeValue !== null) {
      const badge   = hogeSource === "chart" ? " [chart]" : " [pilot]";
      const refNote = chartDetail
        ? `  ·  no-wind ref ${chartDetail.qRef.toFixed(1)}%Q`
        : "";
      table.appendChild(workingSheetRow("HOGE",
        `${Math.round(hogeValue)}%Q${badge}${refNote}`
      ));
    }

    // HL and SR only shown when NOT SAFE OEI
    if (safeOEI === false) {
      const fmtHLSR = (r, unitLabel, anyHeightText) => {
        if (r === null) return { text: "—", muted: true };
        if (r.ok) {
          if (r.anyHeight) return { text: anyHeightText, muted: false };
          return { text: `${r[unitLabel]} ft`, muted: false };
        }
        if (r.reason === "calibration_pending")
          return { text: "— (calibration pending)", muted: true };
        if (r.reason === "chart_not_digitized")
          return { text: "— (chart not yet digitized)", muted: true };
        return { text: `— (${describeError(r)})`, muted: true };
      };

      const hlDisplay = fmtHLSR(hlResult, "hlFt", "HT LOSS EXCEEDS 400 ft");
      const srDisplay = fmtHLSR(srResult, "srFt", "ANY HEIGHT");
      table.appendChild(workingSheetRow("HL", hlDisplay.text, { muted: hlDisplay.muted }));
      table.appendChild(workingSheetRow("SR", srDisplay.text, { muted: srDisplay.muted }));
    }

    if (pa   !== null) table.appendChild(workingSheetRow("PA",   `${pa} ft`));
    if (oat  !== null) table.appendChild(workingSheetRow("TEMP", `${oat}°C`));
    if (wind !== null) table.appendChild(workingSheetRow("WIND", `${wind} kt headwind`));

    if (da !== null)
      table.appendChild(workingSheetRow("DA",
        `${Math.round(da)} ft  (ISA ${isaT >= 0 ? "+" : ""}${isaT.toFixed(1)}°C)`,
        { muted: true }
      ));

    body.appendChild(table);
  }

  // --- Brief to Pilots card ---
  // Shown when AUW + HOGE + PWR are all known (verdict determined).
  const briefCard = $("#sarcbBriefCard");
  const briefBody = $("#sarcbBriefBody");

  if (safeOEI !== null && power && power.ok && auw !== null && briefCard && briefBody) {

    const hlOk = hlResult && hlResult.ok;
    const srOk = srResult && srResult.ok;
    const hlStr = hlOk ? (hlResult.anyHeight ? "HT LOSS EXCEEDS 400 ft" : `${hlResult.hlFt} ft`) : "—";
    const srStr = srOk ? (srResult.anyHeight ? "ANY HEIGHT" : `${srResult.srFt} ft`) : "—";

    const safeLabel = safeOEI ? "SAFE OEI OPERATIONS" : "NOT SAFE OEI OPERATIONS";
    const safeClass = safeOEI ? "pilot-brief__safe" : "pilot-brief__notsafe";

    const briefStr = buildSARCheckBrief(
      safeOEI, auw, power, hogeValue,
      hlOk ? hlResult.hlFt      : null,
      srOk ? srResult.srFt      : null,
      srOk ? srResult.anyHeight : false,
    );

    const briefBlock = el("div", { class: "pilot-brief" },
      el("div", { class: "pilot-brief__label" }, "Brief to Pilots"),

      el("div", { class: "pilot-brief__row pilot-brief__auw" },
        `${auw.toLocaleString("en-US")} kg`
      ),
      el("div", { class: "pilot-brief__row" },
        el("span", { class: "pilot-brief__key" }, "PWR AVAIL"),
        el("span", { class: "pilot-brief__val" },
          `${power.oei} / ${power.aeoEquiv} %Q  (OEI / AEO eq)`),
      ),
      el("div", { class: "pilot-brief__row" },
        el("span", { class: "pilot-brief__key" }, "HOGE"),
        el("span", { class: "pilot-brief__val" },
          hogeValue !== null ? `${Math.round(hogeValue)} %Q` : "—"),
      ),
      el("div", { class: `pilot-brief__row pilot-brief__verdict ${safeClass}` }, safeLabel),

      // HLDF and SR only shown when NOT SAFE OEI
      !safeOEI && el("div", { class: "pilot-brief__row" },
        el("span", { class: "pilot-brief__key" }, "HLDF"),
        el("span", { class: "pilot-brief__val" }, hlStr),
      ),
      !safeOEI && el("div", { class: "pilot-brief__row" },
        el("span", { class: "pilot-brief__key" }, "SR"),
        el("span", { class: "pilot-brief__val" }, srStr),
      ),

      el("div", { class: "pilot-brief__actions" },
        el("button", {
          class: "btn",
          type: "button",
          onClick: (e) => {
            navigator.clipboard.writeText(briefStr).then(() => {
              const btn = e.currentTarget;
              const orig = btn.textContent;
              btn.textContent = "Copied!";
              setTimeout(() => { btn.textContent = orig; }, 1500);
            });
          },
        }, "Copy"),
      ),
    );

    clearEl(briefBody);
    briefBody.appendChild(briefBlock);
    briefCard.hidden = false;

  } else if (briefCard) {
    briefCard.hidden = true;
  }

  // Update the Reference Charts card
  renderSARCheckCharts(safeOEI, hlResult, srResult, STORE.sarCheck.wind, STORE.antiIce === "ON", chartDetail, tvResult);
}


// ---- Fullscreen chart viewer -----------------------------------------------
//
// A single shared overlay element is created once at init() and reused.
// Tapping any chart thumbnail calls openChartViewer(imgEntry) to load the
// image and show the overlay.
//
// On touch devices the browser's native pinch-zoom works inside the overlay
// because the image is displayed at a minimum of screen width/height (it is
// never smaller than the viewport) and overflow is scrollable.
//
// On desktop a close button and Escape key dismiss the overlay.

function initChartViewer() {
  if ($("#chartViewerOverlay")) return;

  const closeBtn = el("button", {
    class: "chart-viewer__close",
    type: "button",
    "aria-label": "Close chart",
    onClick: closeChartViewer,
  }, "✕");

  const traceBtn = el("button", {
    class: "chart-viewer__trace-btn",
    id: "chartViewerTraceBtn",
    type: "button",
  }, "Show Trace");
  traceBtn.hidden = true;

  const caption = el("div", { class: "chart-viewer__caption", id: "chartViewerCaption" });

  // Wrap for stacking img + canvas
  const imgWrap = el("div", { class: "chart-viewer__img-wrap", id: "chartViewerImgWrap" });

  const inner = el("div", { class: "chart-viewer__inner" }, imgWrap);

  const overlay = el("div", {
    class: "chart-viewer",
    id: "chartViewerOverlay",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Chart viewer",
    onClick: (e) => { if (e.target === overlay || e.target === inner) closeChartViewer(); },
  }, closeBtn, traceBtn, inner, caption);

  document.body.appendChild(overlay);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeChartViewer();
  });
}

// openChartViewer(imgEntry, traceFn)
// imgEntry: { src, fig, title }
// traceFn:  optional function(canvas) that draws the trace overlay.
//           When provided, a Show/Hide Trace button appears in the overlay.
function openChartViewer(imgEntry, traceFn) {
  const overlay  = $("#chartViewerOverlay");
  const caption  = $("#chartViewerCaption");
  const imgWrap  = $("#chartViewerImgWrap");
  const traceBtn = $("#chartViewerTraceBtn");
  if (!overlay || !imgWrap) return;

  // Reset
  clearEl(imgWrap);
  let traceOn = false;
  let canvas  = null;

  const img = el("img", {
    class: "chart-viewer__img",
    src: imgEntry.src,
    alt: imgEntry.title || "",
  });
  imgWrap.appendChild(img);

  if (caption) caption.textContent = imgEntry.fig
    ? `${imgEntry.fig} — ${imgEntry.title}`
    : (imgEntry.title || "");

  if (traceFn) {
    traceBtn.hidden = false;
    traceBtn.textContent = "Show Trace";
    traceBtn.classList.remove("btn--active");

    // Build canvas once img dimensions are known
    function buildCanvas() {
      if (canvas) canvas.remove();
      canvas = document.createElement("canvas");
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.className = "chart-viewer__trace-canvas";
      canvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;";
      imgWrap.appendChild(canvas);
      if (traceOn) traceFn(canvas);
    }

    if (img.complete && img.naturalWidth) buildCanvas();
    else img.addEventListener("load", buildCanvas);

    traceBtn.onclick = () => {
      traceOn = !traceOn;
      traceBtn.textContent = traceOn ? "Hide Trace" : "Show Trace";
      traceBtn.classList.toggle("btn--active", traceOn);
      if (canvas) {
        if (traceOn) traceFn(canvas);
        else canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  } else {
    traceBtn.hidden = true;
    traceBtn.onclick = null;
  }

  // imgWrap must be relative for canvas absolute positioning
  imgWrap.style.position = "relative";
  overlay.classList.add("chart-viewer--open");
  document.body.classList.add("chart-viewer-open");
}

function closeChartViewer() {
  const overlay  = $("#chartViewerOverlay");
  const traceBtn = $("#chartViewerTraceBtn");
  if (!overlay) return;
  overlay.classList.remove("chart-viewer--open");
  document.body.classList.remove("chart-viewer-open");
  if (traceBtn) { traceBtn.hidden = true; traceBtn.onclick = null; }
}


// ---- SAR Check Reference Charts card --------------------------------------
//
// Renders a collapsible <details> viewer for each FM chart that was used in
// the current calculation. Shows only the charts that are relevant given the
// current AI state and NOT SAFE OEI status.
//
// Chart visibility rules:
//   TV   — always shown when PA + OAT are entered (TV is always computed)
//   HOGE — always shown when PA + OAT are entered (used for SAFE OEI test)
//   HLDF — shown only when NOT SAFE OEI (chart is only read in that branch)
//   SR   — shown only when NOT SAFE OEI (same)
//
// Each <details> is closed by default so the card doesn't swamp the screen.
// Users tap the row to expand and see the chart image.

function buildChartDetails(imgEntry) {
  if (!imgEntry) return null;

  const chevron = el("svg", {
    class: "chart-ref__chevron",
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  });
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M5 7.5l5 5 5-5");
  chevron.appendChild(path);

  const summary = el("summary", {},
    el("span", { class: "chart-ref__label" },
      document.createTextNode(imgEntry.title),
      el("span", { class: "chart-ref__fig" }, imgEntry.fig),
    ),
    chevron,
  );

  // Thumbnail: shows a scaled-down preview of the chart.
  // Tapping it opens the fullscreen overlay viewer.
  const thumb = el("img", {
    class: "chart-ref__thumb",
    src: imgEntry.src,
    alt: imgEntry.title,
    onClick: () => openChartViewer(imgEntry),
  });

  // "Tap to expand" affordance shown on touch devices
  const tapHint = el("div", { class: "chart-ref__tap-hint" },
    el("span", {}, "Tap image to expand fullscreen")
  );

  const caption = el("p", { class: "chart-ref__caption" },
    `${imgEntry.fig} — ${imgEntry.title}`
  );

  const body = el("div", { class: "chart-ref__body" }, thumb, tapHint, caption);
  const details = el("details", { class: "chart-ref" }, summary, body);
  return details;
}

function renderSARCheckCharts(safeOEI, hlResult, srResult, wind, aiOn, hogeResult, tvResult) {
  const card = $("#sarcbChartsCard");
  const body = $("#sarcbChartsBody");
  if (!card || !body) return;

  const { pa, oat } = STORE.sarCheck;
  if (pa === null || oat === null) { card.hidden = true; return; }

  const aiStateKey = aiOn ? "aiOn" : "aiOff";
  const imgs       = (AC.chartImages && AC.chartImages[aiStateKey]) || {};
  const imgsOff    = (AC.chartImages && AC.chartImages.aiOff)       || {};
  const shared     = (AC.chartImages && AC.chartImages.shared)      || {};

  // Helper: get chart for current AI state.
  // Returns the AI ON chart if available, otherwise AI OFF, otherwise null.
  function getAIChart(key) {
    if (imgs[key]) return imgs[key];
    if (imgsOff[key]) return imgsOff[key];
    return null;
  }

  const list = el("div", { class: "chart-refs" });

  // DA Conversion — plain, no trace
  if (shared.da) {
    const d = buildChartDetails(shared.da);
    if (d) list.appendChild(d);
  }

  // Annex B — with trace (reuse buildAnnexBTraceCard wrapped in details pattern)
  if (shared.annexB) {
    const annexBResult = (pa !== null && oat !== null) ? getAnnexBRefQ({ pa, oat }) : null;
    const d = buildAnnexBChartDetailsWithTrace(shared.annexB, annexBResult, aiOn);
    if (d) list.appendChild(d);
  }

  // HOGE — with trace
  const hogeChart = getAIChart("hoge");
  if (hogeChart) {
    const d = buildHOGEChartDetailsWithTrace(hogeChart, hogeResult, wind, aiOn);
    if (d) list.appendChild(d);
  }

  // Only when NOT SAFE OEI: TV, HLDF, SR
  if (safeOEI === false) {
    const tvChart   = getAIChart("tv");
    const hldfChart = getAIChart("hldf");
    const srChart   = getAIChart("sr");

    if (tvChart) {
      const d = buildTVChartDetailsWithTrace(tvChart, tvResult, oat, pa, aiOn);
      if (d) list.appendChild(d);
    }
    if (hldfChart) {
      const d = buildHLDFChartDetailsWithTrace(hldfChart, hlResult, wind, aiOn);
      if (d) list.appendChild(d);
    }
    if (srChart) {
      const d = buildSRChartDetailsWithTrace(srChart, srResult, wind, aiOn);
      if (d) list.appendChild(d);
    }
  }

  if (!list.firstChild) { card.hidden = true; return; }
  clearEl(body);
  body.appendChild(list);
  card.hidden = false;
}


// ---- Pre-Take Off Brief ---------------------------------------------------

// ---- PA from elevation + QNH calculator -----------------------------------
// Standard formula: PA = elevation + (std_pressure - QNH_hpa) * 27
// For inHg input: convert to hPa first (1 inHg = 33.8639 hPa)

const STD_PRESSURE_HPA = 1013.25;

function calcPAFromElevQNH(elevFt, qnh, qnhUnit) {
  if (elevFt === null || qnh === null) return null;
  const qnhHpa = (qnhUnit === "inhg") ? qnh * 33.8639 : qnh;
  return Math.round(elevFt + (STD_PRESSURE_HPA - qnhHpa) * 27);
}

function renderPreTakeOffPACalc() {
  const elevEl  = $("#pretooffElevInput");
  const qnhEl   = $("#pretooffQnhInput");
  const result  = $("#pretooffPaCalcResult");
  if (!result) return;

  const elev = num(elevEl && elevEl.value);
  const qnh  = num(qnhEl  && qnhEl.value);
  const unit = STORE.preTakeOff.qnhUnit || "hpa";

  if (elev === null || qnh === null) {
    result.hidden = true;
    return;
  }

  const pa = calcPAFromElevQNH(elev, qnh, unit);
  clearEl(result);
  result.appendChild(
    el("div", { class: "pa-calc-output" },
      el("span", { class: "pa-calc-label" }, "Computed PA"),
      el("span", { class: "pa-calc-value" }, `${pa} ft`),
      el("button", {
        class: "btn pa-calc-use",
        type: "button",
        onClick: () => {
          const paInput = $("#pretooffPaInput");
          if (paInput) {
            paInput.value = pa;
            STORE.preTakeOff.pa = pa;
            renderPreTakeOff();
          }
        },
      }, "Use this PA ↑"),
    )
  );
  result.hidden = false;
}


// ---- Pre-Take Off Brief ---------------------------------------------------

function renderPreTakeOff() {
  const card      = $("#pretooffBriefCard");
  const output    = $("#pretooffBriefOutput");
  const copyWrap  = $("#pretooffCopyWrap");
  const copyBtn   = $("#pretooffCopyBtn");
  const chartCard = $("#pretooffChartsCard");
  const chartBody = $("#pretooffChartsBody");

  const auw = STORE.preTakeOff.auw;   // optional — for brief display only
  const pa  = STORE.preTakeOff.pa;
  const oat = STORE.preTakeOff.oat;

  // Only PA + OAT are needed for the calculation
  if (pa === null || oat === null) {
    clearEl(output);
    output.appendChild(document.createTextNode("Enter PA and OAT above to calculate."));
    output.className = "muted";
    card.classList.add("card--locked");
    if (copyWrap) copyWrap.hidden = true;
    if (chartCard) chartCard.hidden = true;
    return;
  }

  // AI OFF result
  const resultOff = getPowerAvailable(pa, oat, "OFF");
  // AI ON result (always compute both for display)
  const resultOn  = getPowerAvailable(pa, oat, "ON");

  if (!resultOff.ok) {
    clearEl(output);
    output.appendChild(
      el("p", { style: "color: var(--bad); margin: 0;" },
        `Out of envelope: ${describeError(resultOff)}`
      )
    );
    output.className = "";
    card.classList.remove("card--locked");
    if (copyWrap) copyWrap.hidden = true;
    if (chartCard) chartCard.hidden = true;
    return;
  }

  card.classList.remove("card--locked");

  // ---- Build the result display ----
  clearEl(output);
  output.className = "";

  const auwStr = auw ? `${auw.toLocaleString("en-US")} kg` : "AUW —";
  const aiOn   = STORE.antiIce === "ON";
  const result = aiOn ? resultOn : resultOff;

  // Large prominent power display — shows only the selected AI state
  output.appendChild(
    el("div", { class: "pwr-result" },
      el("div", { class: "pwr-result__auw" }, auwStr),
      el("div", { class: "pwr-result__row pwr-result__row--main" },
        el("span", { class: "pwr-result__label" }, aiOn ? "AI ON" : "AI OFF"),
        el("span", { class: "pwr-result__value" },
          result.ok
            ? `${result.oei} / ${result.aeoEquiv} %Q`
            : "out of envelope"
        ),
      ),
      el("div", { class: "pwr-result__sublabel" }, "OEI  /  AEO Equivalent"),

      // Explanatory note only shown when AI ON is selected
      aiOn && el("div", { class: "pwr-result__note" },
        "OEI is reduced by 8%Q when Engine AI is selected ON"
      ),
    )
  );

  // Brief string (copyable) — reflects the selected AI state only
  const aiLabel = aiOn ? "AI ON" : "AI OFF";
  const brief = result.ok
    ? `${auwStr} — OEI/AEO ${result.oei}/${result.aeoEquiv}%Q ${aiLabel}`
    : `${auwStr} — out of envelope ${aiLabel}`;

  if (copyWrap) copyWrap.hidden = false;
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(brief).then(() => {
        const orig = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = orig; }, 1500);
      });
    };
  }

  // ---- Annex B reference chart with live trace ----
  if (chartCard && chartBody) {
    const shared = (AC.chartImages && AC.chartImages.shared) || {};
    clearEl(chartBody);
    if (shared.annexB) {
      const traceResult = getAnnexBRefQ({ pa, oat });
      const aiOn = STORE.antiIce === "ON";
      const d = buildAnnexBChartDetailsWithTrace(shared.annexB, traceResult, aiOn);
      if (d) chartBody.appendChild(d);
      chartCard.hidden = false;
    } else {
      chartCard.hidden = true;
    }
  }
}




// ---- Hover Performance ----------------------------------------------------
//
// Computes and renders maximum mass to hover OGE (Fig 4-21, AI OFF).
// Three-panel chain: PA+OAT → base mass → wind correction → TM correction.
//
// Working sheet shows all three panel outputs for traceability.
// Result card shows go/no-go against AUW with margin and AUM threshold flags.
// Reference chart (Fig 4-21) shown once a result is available.

function fmtMass(kg) {
  if (kg === null || kg === undefined) return "—";
  return Math.round(kg).toLocaleString("en-US") + " kg";
}

function fmtMarginKg(margin) {
  if (margin === null || margin === undefined || isNaN(margin)) return "—";
  const sign = margin >= 0 ? "+" : "−";
  return sign + Math.abs(Math.round(margin)).toLocaleString("en-US") + " kg";
}

function renderHoverWorking(resultMC, result30, auw, wind, tm) {
  const card = $("#hovWorkingCard");
  const body = $("#hovWorkingBody");
  if (!card || !body) return;
  clearEl(body);

  const result = resultMC || result30;
  if (!result) {
    body.appendChild(el("p", { class: "muted" }, "Enter PA and OAT above to calculate."));
    card.classList.add("card--locked");
    return;
  }

  card.classList.remove("card--locked");

  const table = el("div", { class: "summary-table" });

  if (!result.ok) {
    table.appendChild(workingSheetRow("Status",
      result.message || `Cannot compute: ${result.reason}`));
    body.appendChild(table);
    return;
  }

  // Panel 1 — base mass
  table.appendChild(workingSheetRow(
    "Panel 1 — PA + OAT",
    result.unrestricted
      ? `Unrestricted (conditions beyond chart cold/low limit)`
      : fmtMass(result.baseMass),
    { muted: result.unrestricted }
  ));

  // Panel 2 — wind correction
  const windLabel = (wind && wind > 0) ? `Panel 2 — ${wind} kt headwind` : "Panel 2 — No wind";
  const windNote  = result.windClamped ? "  ⚠ wind beyond chart range, clamped" : "";
  table.appendChild(workingSheetRow(
    windLabel,
    fmtMass(result.windMass) + windNote,
    { muted: result.unrestricted }
  ));

  // Panel 3 — TM correction
  if (tm && tm > 0) {
    const tmNote = result.tmClamped ? "  ⚠ TM beyond chart range, clamped" : "";
    table.appendChild(workingSheetRow(
      `Panel 3 — ${tm}% TM reserve`,
      fmtMass(result.finalMass) + tmNote
    ));
  } else {
    table.appendChild(workingSheetRow(
      "Panel 3 — TM reserve",
      "Not applied (TM = 0%)",
      { muted: true }
    ));
  }

  // 30 Min Intermediate panels
  if (result30 && result30.ok && !result30.unrestricted) {
    table.appendChild(workingSheetRow("", "", { muted: true }));
    table.appendChild(workingSheetRow("30 Min — Panel 1", fmtMass(result30.baseMass), { muted: true }));
    table.appendChild(workingSheetRow("30 Min — Panel 2", fmtMass(result30.windMass), { muted: true }));
    table.appendChild(workingSheetRow("30 Min — Panel 3", fmtMass(result30.finalMass), { muted: true }));
  }

  body.appendChild(table);
}

function renderHoverResultPane(result, auw, cardId, bodyId, label) {
  const card = $(cardId);
  const body = $(bodyId);
  if (!card || !body) return;
  clearEl(body);

  if (!result) {
    body.appendChild(el("p", { class: "muted" }, "Enter conditions above to calculate."));
    card.classList.add("card--locked");
    return;
  }

  card.classList.remove("card--locked");

  // --- Cannot hover ---
  if (!result.ok) {
    body.appendChild(
      el("div", { class: "summary-banner summary-banner--bad" },
        "Cannot hover \u2014 conditions outside chart limits.")
    );
    body.appendChild(
      el("p", { class: "muted", style: "margin-top: 8px; font-size: 13px;" },
        "OAT too hot and/or PA too high. No hover capability at any AUM.")
    );
    return;
  }

  // --- Unrestricted ---
  if (result.unrestricted) {
    body.appendChild(
      el("div", { class: "summary-banner summary-banner--good" },
        "No hover mass restriction \u2014 conditions beyond chart limits.")
    );
    body.appendChild(
      el("p", { class: "muted", style: "margin-top: 8px; font-size: 13px;" },
        "Very cold / low pressure altitude conditions exceed the chart left edge. " +
        "Hover capability is not limiting at ALT AUM (15\u202f600\u00a0kg).")
    );
    return;
  }

  const finalMass = result.finalMass;
  const maxAum    = AC.perf.aumLimits.maxAum;
  const altAum    = AC.perf.aumLimits.altAum;

  const canHover = (auw === null) ? null : (auw <= finalMass);
  const margin   = (auw === null) ? null : (finalMass - auw);

  // Banner
  let banner;
  if (auw === null) {
    banner = el("div", { class: "summary-banner summary-banner--warn" },
      `Max mass to hover: ${fmtMass(finalMass)}`);
  } else if (canHover) {
    banner = el("div", { class: "summary-banner summary-banner--good" },
      `GO  \u2014  ${fmtMass(finalMass)} max  (${fmtMarginKg(margin)} margin)`);
  } else {
    banner = el("div", { class: "summary-banner summary-banner--bad" },
      `NO-GO  \u2014  ${fmtMass(finalMass)} max  (${fmtMarginKg(margin)})`);
  }
  body.appendChild(banner);

  // AUM threshold note
  if (result.aumFlag === "at_alt_aum") {
    body.appendChild(
      el("div", { class: "summary-banner summary-banner--warn",
                  style: "margin-top: 6px; font-size: 13px;" },
        `ALT AUM limit applies \u2014 max 15\u202f600\u00a0kg. Verify additional constraints.`)
    );
  } else if (result.aumFlag === "at_max_aum") {
    body.appendChild(
      el("div", { class: "summary-banner summary-banner--warn",
                  style: "margin-top: 6px; font-size: 13px;" },
        `At or above MAX AUM (14\u202f600\u00a0kg). ALT AUM procedures may apply.`)
    );
  } else if (result.aumFlag === "approaching") {
    body.appendChild(
      el("div", { class: "summary-banner summary-banner--warn",
                  style: "margin-top: 6px; font-size: 13px;" },
        `Within 200\u00a0kg of MAX AUM (14\u202f600\u00a0kg).`)
    );
  }

  // Detail table
  const table = el("div", { class: "summary-table", style: "margin-top: 12px;" });
  table.appendChild(workingSheetRow("Max mass to hover", fmtMass(finalMass)));
  if (auw !== null) {
    table.appendChild(workingSheetRow("AUW", fmtMass(auw)));
    table.appendChild(workingSheetRow("Margin", fmtMarginKg(margin)));
  }
  table.appendChild(workingSheetRow("Rating", label, { muted: true }));
  body.appendChild(table);

  // Clamp warnings
  if (result.windClamped || result.tmClamped) {
    const warns = [];
    if (result.windClamped) warns.push("headwind beyond digitized range \u2014 result may be optimistic");
    if (result.tmClamped)   warns.push("TM% beyond digitized range \u2014 result clamped");
    body.appendChild(
      el("p", { class: "muted", style: "margin-top: 8px; font-size: 12px;" },
        "\u26a0 " + warns.join("; ") + ".")
    );
  }
}


// ============================================================================
// Hover Performance Chart Traces
// Three-panel nomogram: Panel 1 (OAT → baseMass), Panel 2 (wind → windMass),
// Panel 3 (TM → finalMass). All panels share the same mass X axis.
//
// Calibration verified against four charts (1700x2200px each):
//   Fig 4-19: 30 Min AI OFF  x[528,1373] oat[561,1457] wind[1489,1648] tm[1680,1785]
//   Fig 4-21: Max Cont AI OFF x[527,1372] oat[559,1456] wind[1487,1646] tm[1678,1783]
//   Fig 4-27: Max Cont AI ON  x[527,1372] oat[565,1463] wind[1494,1653] tm[1684,1790]
//   Fig 4-25: 30 Min AI ON   x[523,1368] oat[559,1456] wind[1487,1646] tm[1678,1783]
// ============================================================================

const HOV_TRACE_30MIN_AI_OFF = {
  x10000: 528, x18000: 1373, massMin: 10000, massMax: 18000,
  yOAT40: 561, yOATneg45: 1457, oatTop: 40, oatBot: -45,
  yWind0: 1489, yWind30: 1648, windMax: 30,
  yTM0:   1680, yTM10:   1785, tmMax:   10,
  imgW: 1700, imgH: 2200,
  colTrace: "rgba(0,0,0,0.85)", colTraceDash: [12,8],
  colDot: "#ffcc00", colResult: "#ff4444", colShadow: "rgba(255,255,255,0.85)",
  lineWidth: 3.0, dotRadius: 7,
};

const HOV_TRACE_MAX_CONT_AI_OFF = {
  x10000: 527, x18000: 1372, massMin: 10000, massMax: 18000,
  yOAT40: 559, yOATneg45: 1456, oatTop: 40, oatBot: -45,
  yWind0: 1487, yWind30: 1646, windMax: 30,
  yTM0:   1678, yTM10:   1783, tmMax:   10,
  imgW: 1700, imgH: 2200,
  colTrace: "rgba(0,0,0,0.85)", colTraceDash: [12,8],
  colDot: "#ffcc00", colResult: "#ff4444", colShadow: "rgba(255,255,255,0.85)",
  lineWidth: 3.0, dotRadius: 7,
};

const HOV_TRACE_MAX_CONT_AI_ON = {
  x10000: 527, x18000: 1372, massMin: 10000, massMax: 18000,
  yOAT40: 565, yOATneg45: 1463, oatTop: 40, oatBot: -45,
  yWind0: 1494, yWind30: 1653, windMax: 30,
  yTM0:   1684, yTM10:   1790, tmMax:   10,
  imgW: 1700, imgH: 2200,
  colTrace: "rgba(0,0,0,0.85)", colTraceDash: [12,8],
  colDot: "#ffcc00", colResult: "#ff4444", colShadow: "rgba(255,255,255,0.85)",
  lineWidth: 3.0, dotRadius: 7,
};

const HOV_TRACE_30MIN_AI_ON = {
  x10000: 523, x18000: 1368, massMin: 10000, massMax: 18000,
  yOAT40: 559, yOATneg45: 1456, oatTop: 40, oatBot: -45,
  yWind0: 1487, yWind30: 1646, windMax: 30,
  yTM0:   1678, yTM10:   1783, tmMax:   10,
  imgW: 1700, imgH: 2200,
  colTrace: "rgba(0,0,0,0.85)", colTraceDash: [12,8],
  colDot: "#ffcc00", colResult: "#ff4444", colShadow: "rgba(255,255,255,0.85)",
  lineWidth: 3.0, dotRadius: 7,
};

function _hovTrace(rating, aiOn) {
  if (rating === "maxCont") return aiOn ? HOV_TRACE_MAX_CONT_AI_ON : HOV_TRACE_MAX_CONT_AI_OFF;
  return aiOn ? HOV_TRACE_30MIN_AI_ON : HOV_TRACE_30MIN_AI_OFF;
}

function _hovMass2px(kg, t) {
  return t.x10000 + (kg - t.massMin) * (t.x18000 - t.x10000) / (t.massMax - t.massMin);
}
function _hovOAT2py(oat, t) {
  return t.yOAT40 + (t.oatTop - oat) * (t.yOATneg45 - t.yOAT40) / (t.oatTop - t.oatBot);
}
function _hovWind2py(kt, t) {
  return t.yWind0 + kt * (t.yWind30 - t.yWind0) / t.windMax;
}
function _hovTM2py(tm, t) {
  return t.yTM0 + tm * (t.yTM10 - t.yTM0) / t.tmMax;
}

function _drawHovTrace(canvas, result, oat, wind, tm, rating, aiOn) {
  if (!result || !result.ok || result.unrestricted) return;
  const ctx = canvas.getContext("2d");
  const CW = canvas.width, CH = canvas.height;
  ctx.clearRect(0, 0, CW, CH);
  const t  = _hovTrace(rating, aiOn);
  const sx = CW / t.imgW, sy = CH / t.imgH;
  const { baseMass, windMass, finalMass } = result;
  const windKt = wind || 0;
  const tmPct  = tm   || 0;

  // Key pixel positions
  const pxBase  = _hovMass2px(baseMass,  t) * sx;
  const pxWind  = _hovMass2px(windMass,  t) * sx;
  const pxFinal = _hovMass2px(finalMass, t) * sx;
  const pyOAT   = _hovOAT2py(oat,    t) * sy;
  const pyWind  = _hovWind2py(windKt, t) * sy;
  const pyTM    = _hovTM2py(tmPct,   t) * sy;
  const pyWRef  = t.yWind0 * sy;   // wind reference line (0kt)
  const pyTMRef = t.yTM0   * sy;   // TM reference line (0%)
  const pyTop   = (t.yOAT40    - 30) * sy;
  const pyBot   = (t.yTM10     + 30) * sy;
  const pxLeft  = (t.x10000    - 15) * sx;

  const dot = (px, py, col, r) => {
    ctx.beginPath(); ctx.arc(px, py, ((r||t.dotRadius)+2)*sx, 0, Math.PI*2);
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, (r||t.dotRadius)*sx, 0, Math.PI*2);
    ctx.fillStyle = col; ctx.fill();
  };
  const line = (x1,y1,x2,y2,col,w,dash) => {
    ctx.save(); ctx.beginPath();
    ctx.strokeStyle = col;
    ctx.lineWidth   = (w||t.lineWidth)*sx;
    ctx.setLineDash(dash ? dash.map(d=>d*sx) : []);
    ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.restore();
  };
  const lbl = (px, py, text, col, align, base) => {
    ctx.save();
    ctx.font         = `bold ${Math.round(13*sx)}px sans-serif`;
    ctx.textAlign    = align || "center";
    ctx.textBaseline = base  || "middle";
    ctx.strokeStyle  = t.colShadow; ctx.lineWidth = 4*sx; ctx.lineJoin="round";
    ctx.strokeText(text, px, py);
    ctx.fillStyle = col; ctx.fillText(text, px, py);
    ctx.restore();
  };

  // Panel 1: vertical entry at baseMass from top, horizontal left to OAT entry
  line(pxBase, pyTop,  pxBase, pyOAT,  t.colTrace, t.lineWidth, t.colTraceDash);
  line(pxLeft, pyOAT,  pxBase, pyOAT,  t.colTrace, t.lineWidth, t.colTraceDash);
  dot(pxBase,  pyOAT,  t.colDot);

  // Drop from Panel 1 result to wind reference line
  line(pxBase, pyOAT,  pxBase, pyWRef, t.colTrace, t.lineWidth, t.colTraceDash);
  dot(pxBase,  pyWRef, t.colDot);

  // Panel 2: horizontal at wind height, drop to result
  if (windKt > 0) {
    line(pxBase, pyWind, pxWind, pyWind, t.colTrace, t.lineWidth, t.colTraceDash);
    dot(pxBase,  pyWind, t.colDot);
    line(pxWind, pyWind, pxWind, pyTMRef, t.colTrace, t.lineWidth, t.colTraceDash);
    dot(pxWind,  pyWind, t.colDot);
  } else {
    line(pxBase, pyWRef, pxBase, pyTMRef, t.colTrace, t.lineWidth, t.colTraceDash);
  }
  dot(pxWind, pyTMRef, t.colDot);

  // Panel 3: horizontal at TM height, drop to final result
  if (tmPct > 0) {
    line(pxWind,  pyTM,   pxFinal, pyTM,   t.colTrace, t.lineWidth, t.colTraceDash);
    dot(pxWind,   pyTM,   t.colDot);
    line(pxFinal, pyTM,   pxFinal, pyBot,  t.colResult, t.lineWidth, t.colTraceDash);
    dot(pxFinal,  pyTM,   t.colResult, t.dotRadius+3);
  } else {
    line(pxWind, pyTMRef, pxWind, pyBot, t.colResult, t.lineWidth, t.colTraceDash);
  }
  dot(pxFinal, pyBot, t.colResult);

  // Labels
  lbl(pxLeft+10*sx, pyOAT-10*sy,   `${oat}°C`,              t.colTrace,  "left",   "bottom");
  lbl(pxBase,       pyWRef+14*sy,  `${Math.round(baseMass)}kg`,  t.colDot,    "center", "top");
  lbl(pxWind,       pyTMRef+14*sy, `${Math.round(windMass)}kg`,  t.colDot,    "center", "top");
  lbl(pxFinal,      pyBot+14*sy,   `${Math.round(finalMass)}kg`, t.colResult, "center", "top");
}

function _buildHovSummaryRow(result, oat, wind, tm) {
  if (!result || !result.ok) return null;
  if (result.unrestricted) {
    return el("div", { class: "trace-summary" },
      el("div", { class: "trace-summary__row trace-summary__row--result" },
        el("span", { class: "trace-summary__label" }, "Max Mass to Hover"),
        el("span", { class: "trace-summary__value trace-summary__value--result" }, "Unrestricted"),
      ),
    );
  }
  const { baseMass, windMass, finalMass, windClamped, tmClamped } = result;
  const windKt = wind || 0;
  const tmPct  = tm   || 0;
  return el("div", { class: "trace-summary" },
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "OAT"),
      el("span", { class: "trace-summary__value" }, `${oat}°C`),
    ),
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "Base mass (no wind)"),
      el("span", { class: "trace-summary__value" }, `${Math.round(baseMass)} kg`),
    ),
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, `Wind (${windKt} kt${windClamped ? ", clamped" : ""})`),
      el("span", { class: "trace-summary__value" }, `${Math.round(windMass)} kg`),
    ),
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, `TM (${tmPct}%${tmClamped ? ", clamped" : ""})`),
      el("span", { class: "trace-summary__value" }, `${Math.round(windMass)} kg`),
    ),
    el("div", { class: "trace-summary__row trace-summary__row--result" },
      el("span", { class: "trace-summary__label" }, "Max Mass to Hover"),
      el("span", { class: "trace-summary__value trace-summary__value--result" }, `${Math.round(finalMass)} kg`),
    ),
  );
}


function renderHoverCharts(resultMC, result30, oat, wind, tm) {
  const card = $("#hovChartsCard");
  const body = $("#hovChartsBody");
  if (!card || !body) return;

  const hasResult = (resultMC && resultMC.ok && !resultMC.unrestricted)
                 || (result30 && result30.ok && !result30.unrestricted);
  if (!hasResult) { card.hidden = true; return; }

  const aiOn       = STORE.antiIce === "ON";
  const aiStateKey = aiOn ? "aiOn" : "aiOff";
  const imgs       = (AC.chartImages && AC.chartImages[aiStateKey]) || {};

  clearEl(body);
  const list = el("div", { class: "chart-refs" });
  const entryMC = imgs.hovMaxMass;
  const entry30 = imgs.hovMaxMass30Min;
  if (!entryMC && !entry30) { card.hidden = true; return; }

  if (entryMC) {
    const traceFn   = (resultMC && resultMC.ok && !resultMC.unrestricted)
      ? (canvas) => _drawHovTrace(canvas, resultMC, oat, wind, tm, "maxCont", aiOn)
      : null;
    const summaryFn = (resultMC && resultMC.ok)
      ? () => _buildHovSummaryRow(resultMC, oat, wind, tm)
      : null;
    const d = buildChartDetailsWithTrace(entryMC, traceFn, summaryFn);
    if (d) list.appendChild(d);
  }
  if (entry30) {
    const traceFn   = (result30 && result30.ok && !result30.unrestricted)
      ? (canvas) => _drawHovTrace(canvas, result30, oat, wind, tm, "thirtyMin", aiOn)
      : null;
    const summaryFn = (result30 && result30.ok)
      ? () => _buildHovSummaryRow(result30, oat, wind, tm)
      : null;
    const d = buildChartDetailsWithTrace(entry30, traceFn, summaryFn);
    if (d) list.appendChild(d);
  }
  body.appendChild(list);
  card.hidden = false;
}

function renderHover() {
  const { auw, pa, oat, wind, tm } = STORE.hover;
  const antiIce = STORE.antiIce;   // read global AI state, same as all other tabs

  // Compute both ratings when minimum inputs (PA + OAT) are present
  let resultMC  = null;
  let result30  = null;
  if (pa !== null && oat !== null) {
    resultMC = getMaxMassToHover({ pa, oat, wind: wind ?? 0, tm: tm ?? 0, antiIce, rating: "maxCont" });
    result30 = getMaxMassToHover({ pa, oat, wind: wind ?? 0, tm: tm ?? 0, antiIce, rating: "thirtyMin" });
  }

  renderHoverWorking(resultMC, result30, auw, wind ?? 0, tm ?? 0);
  renderHoverResultPane(resultMC, auw, "#hovResultCard",      "#hovResultBody",      "Max Continuous");
  renderHoverResultPane(result30, auw, "#hovResultCard30Min", "#hovResultBody30Min", "30 Min Intermediate");
  renderHoverCharts(resultMC, result30, oat, wind ?? 0, tm ?? 0);
}



// ============================================================================
// Annex B Chart Trace Overlay
// ============================================================================
// Renders the Annex B chart image on a <canvas> and overlays the FE working
// trace for the given OAT and PA:
//   1. Cyan vertical line up from OAT on X axis
//   2. White dots at lower and upper bracketing PA curve intersections
//   3. Gold dot at the interpolated result point
//   4. Dashed green horizontal line left to Y axis
//   5. Green %Q label on Y axis
//
// Margin constants (fractions of image size) define the plotted area.
// Adjust if the chart image changes.

// Annex B pixel calibration (1700x2200px):
//   X (OAT): x=492 (-45C)  x=591 (-40C)  x=1373 (+40C)
//            -45 to -40: 19.8 px/C (doubled spacing)
//            -40 to +40: 9.775 px/C (normal spacing)
//   Y (%Q):  y=727 (140%)  y=1287 (70%)  k=8.0 px/%Q
//   Verified: PA=0 OAT=0C -> Q=133% @ (983,783) ✓
//             PA=5000 OAT=-30C -> Q=124% @ (689,856) ✓
//             PA=9000 OAT=-15C -> Q=99.5% @ (837,1051) ✓
const ANNEX_B_TRACE = {
  xOATneg45: 492,  xOATneg40: 591,  xOAT40: 1373,  oatMin: -45, oatMax: 40,
  yQ140:     727,  yQ70:      1287,  qMin:    70, qMax:  140,
  imgW:      1700, imgH:   2200,
  colTrace:     "rgba(0,0,0,0.85)",  colTraceDash: [12, 8],
  colDot:       "#ffcc00",
  colResult:    "#ff4444",
  colShadow:    "rgba(255,255,255,0.85)",
  lineWidth:    3.0,
  dotRadius:    7,
};

function _annexBPx(oat, q, W, H) {
  const t  = ANNEX_B_TRACE;
  const sx = W / t.imgW;
  const sy = H / t.imgH;
  const rawX = oat < -40
    ? t.xOATneg45  + (oat - (-45)) * (t.xOATneg40 - t.xOATneg45) / (-40 - (-45))
    : t.xOATneg40  + (oat - (-40)) * (t.xOAT40    - t.xOATneg40) / (40  - (-40));
  return {
    px: rawX * sx,
    py: (t.yQ140 + (q - t.qMax) * (t.yQ70 - t.yQ140) / (t.qMin - t.qMax)) * sy,
  };
}

function _drawAnnexBTrace(canvas, result) {
  if (!result || !result.ok) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const t  = ANNEX_B_TRACE;
  const sx = W / t.imgW;
  const sy = H / t.imgH;
  const { traceOAT, refQ, refQExact = refQ } = result;

  const dot = (px, py, col, r) => {
    ctx.beginPath(); ctx.arc(px, py, ((r || t.dotRadius) + 2) * sx, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, (r || t.dotRadius) * sx, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
  };
  const line = (x1, y1, x2, y2, col, w, dash) => {
    ctx.save(); ctx.beginPath();
    ctx.strokeStyle = col;
    ctx.lineWidth   = (w || t.lineWidth) * sx;
    ctx.setLineDash(dash ? dash.map(d => d * sx) : []);
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  };
  const lbl = (px, py, text, col, align, base) => {
    ctx.save();
    ctx.font         = `bold ${Math.round(13 * sx)}px sans-serif`;
    ctx.textAlign    = align || "center";
    ctx.textBaseline = base  || "middle";
    ctx.strokeStyle  = t.colShadow; ctx.lineWidth = 4 * sx; ctx.lineJoin = "round";
    ctx.strokeText(text, px, py);
    ctx.fillStyle = col; ctx.fillText(text, px, py);
    ctx.restore();
  };

  // Enter at OAT on X axis (bottom), read UP to PA curve, then LEFT to Y axis
  // Horizontal extends 50px into the white margin left of the Y axis legend (x=252).
  // OAT label sits at y=1389, clear of the x-axis legend area (y=1286-1463).
  const pRes      = _annexBPx(traceOAT, refQExact, W, H);
  const pYAxis    = _annexBPx(t.oatMin, refQ, W, H);
  const pxExtend  = 252 * sx;          // 50px into white margin past Y label
  const pyOATLbl  = 1389 * sy;         // clear of x-axis legend
  const pyBot     = (t.yQ70 + 30) * sy;

  // Vertical line up from bottom axis to result point on curve
  line(pRes.px,   pyBot,      pRes.px,   pRes.py,   t.colTrace, t.lineWidth, t.colTraceDash);
  dot(pRes.px,    pRes.py,    t.colDot);

  // Horizontal from result point left, extended into white margin
  line(pRes.px,   pRes.py,   pxExtend,  pRes.py,   t.colTrace, t.lineWidth, t.colTraceDash);
  dot(pxExtend,   pRes.py,   t.colResult);

  // Labels
  lbl(pRes.px,    pyOATLbl,  `${traceOAT}°C`,        t.colTrace,  "center", "middle");
  lbl(pxExtend - 10 * sx, pRes.py, `${refQ.toFixed(1)}%Q`, t.colResult, "right",  "middle");
}

// Build a container with the chart image and canvas trace overlay.
// The canvas is absolutely positioned over the image and sized to match
// the image's natural pixel dimensions for crisp rendering.
function buildAnnexBTraceCard(imgSrc, result) {
  const container = el("div", {
    style: "position:relative; width:100%; line-height:0; border-radius:6px; overflow:hidden;",
  });
  const img    = new Image();
  img.src      = imgSrc;
  img.style.cssText = "width:100%; display:block;";
  const canvas = el("canvas", {
    style: "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;",
  });

  // Draw once natural dimensions are known
  const tryDraw = () => {
    if (!img.naturalWidth) return;
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    _drawAnnexBTrace(canvas, result);
  };

  img.addEventListener("load", tryDraw);
  // Image may already be cached — draw immediately if so
  if (img.complete) setTimeout(tryDraw, 0);

  container.appendChild(img);
  container.appendChild(canvas);
  return container;
}


// ============================================================================
// buildChartDetailsWithTrace(imgEntry, traceFn, summaryFn)
//
// Shared factory for all traced charts.
// - <details> collapsed by default
// - Expanding shows plain thumbnail, no trace overlay
// - Tap thumbnail -> fullscreen viewer
// - Show/Hide Trace toggle lives inside fullscreen only
// - traceFn(canvas): draws trace when toggled ON
// - summaryFn(): optional DOM node with key values shown below thumbnail
// ============================================================================

function buildChartDetailsWithTrace(imgEntry, traceFn, summaryFn) {
  if (!imgEntry) return null;

  const chevron = el("svg", {
    class: "chart-ref__chevron", viewBox: "0 0 20 20",
    fill: "none", stroke: "currentColor", "stroke-width": "2",
    "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true",
  });
  const cPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  cPath.setAttribute("d", "M5 7.5l5 5 5-5");
  chevron.appendChild(cPath);

  const summary = el("summary", {},
    el("span", { class: "chart-ref__label" },
      document.createTextNode(imgEntry.title),
      el("span", { class: "chart-ref__fig" }, imgEntry.fig),
    ),
    chevron,
  );

  const thumb = el("img", {
    class: "chart-ref__thumb",
    src: imgEntry.src,
    alt: imgEntry.title,
    onClick: () => openChartViewer(imgEntry, traceFn || null),
  });

  const tapHint = el("div", { class: "chart-ref__tap-hint" },
    el("span", {}, traceFn
      ? "Tap to expand — trace available fullscreen"
      : "Tap image to expand fullscreen")
  );

  const caption = el("p", { class: "chart-ref__caption" },
    `${imgEntry.fig} — ${imgEntry.title}`
  );

  const summaryNode = (summaryFn && traceFn) ? summaryFn() : null;
  const bodyChildren = [thumb, tapHint];
  if (summaryNode) bodyChildren.push(summaryNode);
  bodyChildren.push(caption);

  const body = el("div", { class: "chart-ref__body" }, ...bodyChildren);
  return el("details", { class: "chart-ref" }, summary, body);
}

// ============================================================================
// Annex B Chart Details With Trace — SAR Check wrapper
// Wraps the existing _drawAnnexBTrace in the standard buildChartDetailsWithTrace
// pattern: <details> collapsed, Show Trace toggle, summary rows, fullscreen.
// AI ON correction note shown in summary when antiIce is ON.
// ============================================================================

function _buildAnnexBSummaryRow(result, aiOn) {
  if (!result || !result.ok) return null;
  const { refQ, traceOAT, tracePA } = result;
  const aiOnPenalty = (AC.perf && AC.perf.aiOnPenaltyPct) || 8;
  const correctedQ  = refQ - aiOnPenalty;
  return el("div", { class: "trace-summary" },
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "Pressure Altitude"),
      el("span", { class: "trace-summary__value" }, `${tracePA} ft`),
    ),
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "OAT"),
      el("span", { class: "trace-summary__value" }, `${traceOAT} C`),
    ),
    el("div", { class: "trace-summary__row trace-summary__row--result" },
      el("span", { class: "trace-summary__label" }, "OEI Power Avail (chart)"),
      el("span", { class: "trace-summary__value trace-summary__value--result" }, `${refQ}%Q`),
    ),
    aiOn && el("div", { class: "trace-summary__row trace-summary__row--note" },
      el("span", { class: "trace-summary__label" }, "AI ON correction"),
      el("span", { class: "trace-summary__value" },
        `${refQ}%Q \u2212 ${aiOnPenalty}%Q \u2192 ${correctedQ}%Q used`),
    ),
  );
}

function buildAnnexBChartDetailsWithTrace(imgEntry, result, aiOn) {
  const traceFn   = (result && result.ok)
    ? (canvas) => _drawAnnexBTrace(canvas, result)
    : null;
  const summaryFn = (result && result.ok)
    ? () => _buildAnnexBSummaryRow(result, aiOn)
    : null;
  return buildChartDetailsWithTrace(imgEntry, traceFn, summaryFn);
}




// ============================================================================
// HOGE Chart Trace — Fig 4-67 AI OFF / Fig 4-54 AI ON
// Two-panel nomogram, shared X axis (%Q).
//
// Upper panel: enter DA on Y → read across to AUW curve → drop to join line → Q_ref
// Lower panel: enter Q_ref on X at join line → read down to wind curve → Q_final
//
// Calibration (1700x2200px, AI OFF Fig 4-67):
//   X (%Q):    x=446 (50%Q)   x=1475 (130%Q)
//   Upper Y:   y=1357 (-8000ft DA)  y=585 (+16000ft DA)
//   Lower Y:   y=1395 (0kt join)    y=1781 (30kt)
//   Verified: AUW=13000 DA=0 -> Q_ref=88.1%Q @ (936,1100) ✓
//             Q_entry=70 wind=15kt -> Q_final=65.2%Q @ (641,1588) ✓
// ============================================================================

// AI OFF — Fig 4-67 (1700x2200px)
const HOGE_TRACE_AI_OFF = {
  xQ50:        446,   xQ130:   1475,
  yDAneg8000:  1357,  yDA16000: 585,  daMin: -8000, daMax: 16000,
  yWind0:      1395,  yWind30: 1781,  windMax: 30,
  imgW:        1700,  imgH:    2200,
  colTrace:    "rgba(0,0,0,0.85)",  colTraceDash: [12, 8],
  colDot:      "#ffcc00",           colResult:    "#ff4444",
  colShadow:   "rgba(255,255,255,0.85)",
  lineWidth:   3.0,   dotRadius: 7,
};

// AI ON — Fig 4-54 (1700x2200px)
// Verified: AUW=13000 DA=0 -> Q_ref=91.0%Q @ (834,1095) ✓
//           Q_entry=80 wind=15kt -> Q_final=74.6%Q @ (623,1584) ✓
const HOGE_TRACE_AI_ON = {
  xQ50:        307,   xQ130:    1336,
  yDAneg8000:  1352,  yDA16000:  580,  daMin: -8000, daMax: 16000,
  yWind0:      1392,  yWind30:  1776,  windMax: 30,
  imgW:        1700,  imgH:     2200,
  colTrace:    "rgba(0,0,0,0.85)",  colTraceDash: [12, 8],
  colDot:      "#ffcc00",           colResult:    "#ff4444",
  colShadow:   "rgba(255,255,255,0.85)",
  lineWidth:   3.0,   dotRadius: 7,
};

function _hogeTrace(aiOn) {
  return aiOn ? HOGE_TRACE_AI_ON : HOGE_TRACE_AI_OFF;
}

function _hogeQ2px(q, t) {
  return t.xQ50 + (q - 50) * (t.xQ130 - t.xQ50) / (130 - 50);
}

function _hogeDA2py(da, t) {
  return t.yDAneg8000 - (da - t.daMin) * (t.yDAneg8000 - t.yDA16000) / (t.daMax - t.daMin);
}

function _hogeWind2py(kt, t) {
  return t.yWind0 + kt * (t.yWind30 - t.yWind0) / t.windMax;
}

function _drawHOGETrace(canvas, hogeResult, wind, aiOn) {
  if (!hogeResult || !hogeResult.ok) return;
  const ctx = canvas.getContext("2d");
  const CW = canvas.width, CH = canvas.height;
  ctx.clearRect(0, 0, CW, CH);
  const t  = _hogeTrace(aiOn);
  const sx = CW / t.imgW;
  const sy = CH / t.imgH;
  const { da, qRef, qHover } = hogeResult;
  const windKt = (wind === null || wind === undefined) ? 0 : wind;

  // Key pixel positions
  const pxQref   = _hogeQ2px(qRef,   t) * sx;
  const pxFinal  = _hogeQ2px(qHover, t) * sx;
  const pyDA     = _hogeDA2py(da,    t) * sy;
  const pyJoin   = t.yWind0             * sy;   // join line = wind 0
  const pyWind   = _hogeWind2py(windKt, t) * sy;
  const pyTop    = (t.yDA16000  - 30)  * sy;
  const pyBot    = (t.yWind30   + 30)  * sy;
  const pxLeft   = (t.xQ50     - 15)  * sx;

  const dot = (px, py, col, r) => {
    ctx.beginPath(); ctx.arc(px, py, ((r || t.dotRadius) + 2) * sx, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, (r || t.dotRadius) * sx, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
  };

  const line = (x1, y1, x2, y2, col, w, dash) => {
    ctx.save(); ctx.beginPath();
    ctx.strokeStyle = col;
    ctx.lineWidth   = (w || t.lineWidth) * sx;
    ctx.setLineDash(dash ? dash.map(d => d * sx) : []);
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  };

  const lbl = (px, py, text, col, align, base) => {
    ctx.save();
    ctx.font          = `bold ${Math.round(13 * sx)}px sans-serif`;
    ctx.textAlign     = align || "center";
    ctx.textBaseline  = base  || "middle";
    ctx.strokeStyle   = t.colShadow; ctx.lineWidth = 4 * sx; ctx.lineJoin = "round";
    ctx.strokeText(text, px, py);
    ctx.fillStyle = col; ctx.fillText(text, px, py);
    ctx.restore();
  };

  // Upper panel: horizontal from left edge to Q_ref at DA height
  line(pxLeft, pyDA, pxQref, pyDA, t.colTrace, t.lineWidth, t.colTraceDash);
  dot(pxQref, pyDA, t.colDot);

  // Drop from DA intersection down to join line
  line(pxQref, pyDA, pxQref, pyJoin, t.colTrace, t.lineWidth, t.colTraceDash);
  dot(pxQref, pyJoin, t.colDot);

  // Lower panel
  if (windKt > 0) {
    // Horizontal at wind height from Q_ref to Q_final
    line(pxQref,  pyWind, pxFinal, pyWind, t.colTrace, t.lineWidth, t.colTraceDash);
    dot(pxQref,   pyWind, t.colDot);
    // Drop from wind intersection to bottom
    line(pxFinal, pyWind, pxFinal, pyBot, t.colResult, t.lineWidth, t.colTraceDash);
    dot(pxFinal,  pyWind, t.colResult, t.dotRadius + 3);
  } else {
    // No wind — drop straight from join line
    line(pxQref, pyJoin, pxQref, pyBot, t.colResult, t.lineWidth, t.colTraceDash);
  }

  dot(pxFinal, pyBot, t.colResult);

  // Labels
  lbl(pxQref  - 10 * sx, pyDA    - 12 * sy, `DA ${Math.round(da)} ft`,   t.colTrace,  "right",  "bottom");
  lbl(pxQref,             pyJoin  + 14 * sy, `${qRef.toFixed(1)}%Q`,      t.colDot,    "center", "top");
  lbl(pxFinal,            pyBot   + 14 * sy, `${qHover.toFixed(1)}%Q`,    t.colResult, "center", "top");
}

function _buildHOGESummaryRow(hogeResult, wind) {
  if (!hogeResult || !hogeResult.ok) return null;
  const { da, qRef, qHover } = hogeResult;
  const windKt = (wind === null || wind === undefined) ? 0 : wind;
  return el("div", { class: "trace-summary" },
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "Density Altitude"),
      el("span", { class: "trace-summary__value" }, `${Math.round(da)} ft`),
    ),
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "Q ref (no wind)"),
      el("span", { class: "trace-summary__value" }, `${qRef.toFixed(1)}%Q`),
    ),
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "Headwind"),
      el("span", { class: "trace-summary__value" }, `${windKt} kt`),
    ),
    el("div", { class: "trace-summary__row trace-summary__row--result" },
      el("span", { class: "trace-summary__label" }, "Q to Hover (HOGE)"),
      el("span", { class: "trace-summary__value trace-summary__value--result" }, `${qHover.toFixed(1)}%Q`),
    ),
  );
}

function buildHOGEChartDetailsWithTrace(imgEntry, hogeResult, wind, aiOn) {
  const traceFn   = (hogeResult && hogeResult.ok)
    ? (canvas) => _drawHOGETrace(canvas, hogeResult, wind, aiOn)
    : null;
  const summaryFn = (hogeResult && hogeResult.ok)
    ? () => _buildHOGESummaryRow(hogeResult, wind)
    : null;
  return buildChartDetailsWithTrace(imgEntry, traceFn, summaryFn);
}




// ============================================================================
// Transfer Value Chart Trace — Fig 4-66 AI OFF / Fig 4-70 AI ON
// Single panel. X = Transfer Value (1–14). Y = OAT °C (+40 top, -45 bottom).
//
// AI OFF (Fig 4-66, 1700x2200px):
//   x=510 (TV=1)  x=1382 (TV=14)  y=633 (OAT=+40)  y=1776 (OAT=-45)
//   Verified: OAT=+18 PA=0 -> TV=10.0 @ (1114,927) ✓
//             OAT=-32 PA=5000 -> TV=9.87 @ (1119,1600) ✓
// AI ON (Fig 4-70, 1700x2200px):
//   x=383 (TV=1)  x=1229 (TV=14)  y=653 (OAT=+40)  y=1758 (OAT=-45)
//   Verified: OAT=+18 PA=0 -> TV=8.67 @ (882,939) ✓
//             OAT=-32 PA=5000 -> TV=8.52 @ (873,1589) ✓
// ============================================================================

const TV_TRACE_AI_OFF = {
  xTV1:  510,  xTV14: 1382,  tvMin: 1,  tvMax: 14,
  yOAT40: 633, yOATneg45: 1776, oatTop: 40, oatBot: -45,
  imgW: 1700,  imgH: 2200,
  colTrace:  "rgba(0,0,0,0.85)",  colTraceDash: [12, 8],
  colDot:    "#ffcc00",           colResult:    "#ff4444",
  colShadow: "rgba(255,255,255,0.85)",
  lineWidth: 3.0,  dotRadius: 7,
};

const TV_TRACE_AI_ON = {
  xTV1:  383,  xTV14: 1229,  tvMin: 1,  tvMax: 14,
  yOAT40: 653, yOATneg45: 1758, oatTop: 40, oatBot: -45,
  imgW: 1700,  imgH: 2200,
  colTrace:  "rgba(0,0,0,0.85)",  colTraceDash: [12, 8],
  colDot:    "#ffcc00",           colResult:    "#ff4444",
  colShadow: "rgba(255,255,255,0.85)",
  lineWidth: 3.0,  dotRadius: 7,
};

function _tvTrace(aiOn) { return aiOn ? TV_TRACE_AI_ON : TV_TRACE_AI_OFF; }

function _tvTV2px(tv, t) {
  return t.xTV1 + (tv - t.tvMin) * (t.xTV14 - t.xTV1) / (t.tvMax - t.tvMin);
}

function _tvOAT2py(oat, t) {
  return t.yOAT40 + (t.oatTop - oat) * (t.yOATneg45 - t.yOAT40) / (t.oatTop - t.oatBot);
}

function _drawTVTrace(canvas, tvResult, oat, aiOn) {
  if (!tvResult || !tvResult.ok) return;
  const ctx = canvas.getContext("2d");
  const CW = canvas.width, CH = canvas.height;
  ctx.clearRect(0, 0, CW, CH);
  const t  = _tvTrace(aiOn);
  const sx = CW / t.imgW;
  const sy = CH / t.imgH;
  const { tv } = tvResult;

  const pxTV   = _tvTV2px(tv, t)  * sx;
  const pyOAT  = _tvOAT2py(oat, t) * sy;
  const pyTop  = (t.yOAT40    - 30) * sy;
  const pyBot  = (t.yOATneg45 + 30) * sy;
  const pxLeft = (t.xTV1      - 15) * sx;

  const dot = (px, py, col, r) => {
    ctx.beginPath(); ctx.arc(px, py, ((r || t.dotRadius) + 2) * sx, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, (r || t.dotRadius) * sx, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
  };

  const line = (x1, y1, x2, y2, col, w, dash) => {
    ctx.save(); ctx.beginPath();
    ctx.strokeStyle = col;
    ctx.lineWidth   = (w || t.lineWidth) * sx;
    ctx.setLineDash(dash ? dash.map(d => d * sx) : []);
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  };

  const lbl = (px, py, text, col, align, base) => {
    ctx.save();
    ctx.font         = `bold ${Math.round(13 * sx)}px sans-serif`;
    ctx.textAlign    = align || "center";
    ctx.textBaseline = base  || "middle";
    ctx.strokeStyle  = t.colShadow; ctx.lineWidth = 4 * sx; ctx.lineJoin = "round";
    ctx.strokeText(text, px, py);
    ctx.fillStyle = col; ctx.fillText(text, px, py);
    ctx.restore();
  };

  // Horizontal line from left edge to TV at OAT height
  line(pxLeft, pyOAT, pxTV, pyOAT, t.colTrace, t.lineWidth, t.colTraceDash);
  dot(pxTV, pyOAT, t.colDot);

  // Drop from intersection to bottom axis
  line(pxTV, pyOAT, pxTV, pyBot, t.colResult, t.lineWidth, t.colTraceDash);
  dot(pxTV, pyBot, t.colResult);

  // Labels
  lbl(pxLeft + 10 * sx, pyOAT - 12 * sy, `${oat}°C`, t.colTrace, "left", "bottom");
  lbl(pxTV, pyBot + 14 * sy, `TV ${tv.toFixed(1)}`, t.colResult, "center", "top");
}

function _buildTVSummaryRow(tvResult, oat, pa) {
  if (!tvResult || !tvResult.ok) return null;
  const { tv, da } = tvResult;
  return el("div", { class: "trace-summary" },
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "Pressure Altitude"),
      el("span", { class: "trace-summary__value" }, `${pa} ft`),
    ),
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "OAT"),
      el("span", { class: "trace-summary__value" }, `${oat}°C`),
    ),
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "Density Altitude"),
      el("span", { class: "trace-summary__value" }, `${Math.round(da)} ft`),
    ),
    el("div", { class: "trace-summary__row trace-summary__row--result" },
      el("span", { class: "trace-summary__label" }, "Transfer Value"),
      el("span", { class: "trace-summary__value trace-summary__value--result" }, tv.toFixed(1)),
    ),
  );
}

function buildTVChartDetailsWithTrace(imgEntry, tvResult, oat, pa, aiOn) {
  const traceFn   = (tvResult && tvResult.ok)
    ? (canvas) => _drawTVTrace(canvas, tvResult, oat, aiOn)
    : null;
  const summaryFn = (tvResult && tvResult.ok)
    ? () => _buildTVSummaryRow(tvResult, oat, pa)
    : null;
  return buildChartDetailsWithTrace(imgEntry, traceFn, summaryFn);
}



// ============================================================================
// Safe Reject Chart Trace — Fig 4-69 AI OFF / Fig 4-72 AI ON
// Two-panel nomogram. X axis = SR height (ft). Y axes = TV (upper) / wind (lower).
//
// AI OFF (Fig 4-69, 1700x2200px):
//   X: x=627 (0ft)  x=1176 (80ft)
//   Upper Y (TV): y=564 (TV=14)  y=1320 (TV=3)
//   Lower Y (wind): y=1360 (0kt)  y=1773 (30kt)
//   Verified: AUW=13000 TV=8 -> xRef=55.4ft @ (1007,976) ✓
//             xRef=20 wind=15kt -> SR=15ft @ (729,1567) ✓
// AI ON (Fig 4-72, 1700x2200px):
//   X: x=504 (0ft)  x=1024 (80ft)
//   Upper Y (TV): y=568 (TV=14)  y=1349 (TV=2)
//   Lower Y (wind): y=1388 (0kt)  y=1778 (30kt)
//   Verified (5 points, all within 4px) ✓
// ============================================================================

const SR_TRACE_AI_OFF = {
  xSR0:   627,  xSR80:  1176,  srMax: 80,
  yTV14:  564,  yTV3:   1320,  tvTop: 14, tvBot: 3,
  yWind0: 1360, yWind30: 1773, windMax: 30,
  imgW: 1700,   imgH: 2200,
  colTrace:  "rgba(0,0,0,0.85)",  colTraceDash: [12, 8],
  colDot:    "#ffcc00",           colResult:    "#ff4444",
  colShadow: "rgba(255,255,255,0.85)",
  lineWidth: 3.0,  dotRadius: 7,
};

const SR_TRACE_AI_ON = {
  xSR0:   504,  xSR80:  1024,  srMax: 80,
  yTV14:  568,  yTV2:   1349,  tvTop: 14, tvBot: 2,
  yWind0: 1388, yWind30: 1778, windMax: 30,
  imgW: 1700,   imgH: 2200,
  colTrace:  "rgba(0,0,0,0.85)",  colTraceDash: [12, 8],
  colDot:    "#ffcc00",           colResult:    "#ff4444",
  colShadow: "rgba(255,255,255,0.85)",
  lineWidth: 3.0,  dotRadius: 7,
};

function _srTrace(aiOn) { return aiOn ? SR_TRACE_AI_ON : SR_TRACE_AI_OFF; }

function _srSR2px(sr, t) {
  return t.xSR0 + sr * (t.xSR80 - t.xSR0) / t.srMax;
}

function _srTV2py(tv, t) {
  const tvBot = t.tvBot !== undefined ? t.tvBot : 3;
  const yTVBot = t.yTV3 !== undefined ? t.yTV3 : t.yTV2;
  return t.yTV14 + (t.tvTop - tv) * (yTVBot - t.yTV14) / (t.tvTop - tvBot);
}

function _srWind2py(kt, t) {
  return t.yWind0 + kt * (t.yWind30 - t.yWind0) / t.windMax;
}

function _drawSRTrace(canvas, srResult, wind, aiOn) {
  if (!srResult || !srResult.ok || srResult.anyHeight) return;
  const ctx = canvas.getContext("2d");
  const CW = canvas.width, CH = canvas.height;
  ctx.clearRect(0, 0, CW, CH);
  const t  = _srTrace(aiOn);
  const sx = CW / t.imgW;
  const sy = CH / t.imgH;
  const { tv, xRef, srFt } = srResult;
  const windKt = (wind === null || wind === undefined) ? 0 : wind;

  const pxXRef  = _srSR2px(xRef,  t) * sx;
  const pxFinal = _srSR2px(srFt,  t) * sx;
  const pyTV    = _srTV2py(tv,    t) * sy;
  const pyJoin  = t.yWind0           * sy;
  const pyWind  = _srWind2py(windKt, t) * sy;
  const pyTop   = (t.yTV14   - 30) * sy;
  const pyBot   = (t.yWind30 + 30) * sy;
  const pxLeft  = (t.xSR0   - 15) * sx;

  const dot = (px, py, col, r) => {
    ctx.beginPath(); ctx.arc(px, py, ((r || t.dotRadius) + 2) * sx, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, (r || t.dotRadius) * sx, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
  };

  const line = (x1, y1, x2, y2, col, w, dash) => {
    ctx.save(); ctx.beginPath();
    ctx.strokeStyle = col;
    ctx.lineWidth   = (w || t.lineWidth) * sx;
    ctx.setLineDash(dash ? dash.map(d => d * sx) : []);
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  };

  const lbl = (px, py, text, col, align, base) => {
    ctx.save();
    ctx.font         = `bold ${Math.round(13 * sx)}px sans-serif`;
    ctx.textAlign    = align || "center";
    ctx.textBaseline = base  || "middle";
    ctx.strokeStyle  = t.colShadow; ctx.lineWidth = 4 * sx; ctx.lineJoin = "round";
    ctx.strokeText(text, px, py);
    ctx.fillStyle = col; ctx.fillText(text, px, py);
    ctx.restore();
  };

  // Upper panel: horizontal from left to xRef at TV height
  line(pxLeft, pyTV, pxXRef, pyTV, t.colTrace, t.lineWidth, t.colTraceDash);
  dot(pxXRef, pyTV, t.colDot);

  // Drop from TV intersection to join line
  line(pxXRef, pyTV, pxXRef, pyJoin, t.colTrace, t.lineWidth, t.colTraceDash);
  dot(pxXRef, pyJoin, t.colDot);

  // Lower panel
  if (windKt > 0) {
    line(pxXRef,  pyWind, pxFinal, pyWind, t.colTrace, t.lineWidth, t.colTraceDash);
    dot(pxXRef,   pyWind, t.colDot);
    line(pxFinal, pyWind, pxFinal, pyBot,  t.colResult, t.lineWidth, t.colTraceDash);
    dot(pxFinal,  pyWind, t.colResult, t.dotRadius + 3);
  } else {
    line(pxXRef, pyJoin, pxXRef, pyBot, t.colResult, t.lineWidth, t.colTraceDash);
  }
  dot(pxFinal, pyBot, t.colResult);

  // Labels
  lbl(pxXRef  - 10 * sx, pyTV   - 12 * sy, `TV ${tv.toFixed(1)}`,    t.colTrace,  "right",  "bottom");
  lbl(pxXRef,             pyJoin + 14 * sy, `${Math.round(xRef)} ft`, t.colDot,    "center", "top");
  lbl(pxFinal,            pyBot  + 14 * sy, `${srFt} ft`,             t.colResult, "center", "top");
}

function _buildSRSummaryRow(srResult, wind) {
  if (!srResult || !srResult.ok) return null;
  const windKt = (wind === null || wind === undefined) ? 0 : wind;
  if (srResult.anyHeight) {
    return el("div", { class: "trace-summary" },
      el("div", { class: "trace-summary__row trace-summary__row--result" },
        el("span", { class: "trace-summary__label" }, "Max Vertical Reject Ht"),
        el("span", { class: "trace-summary__value trace-summary__value--result" }, "ANY HEIGHT"),
      ),
    );
  }
  const { tv, xRef, srFt } = srResult;
  return el("div", { class: "trace-summary" },
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "Transfer Value"),
      el("span", { class: "trace-summary__value" }, tv.toFixed(1)),
    ),
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "SR (no wind)"),
      el("span", { class: "trace-summary__value" }, `${Math.round(xRef)} ft`),
    ),
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "Headwind"),
      el("span", { class: "trace-summary__value" }, `${windKt} kt`),
    ),
    el("div", { class: "trace-summary__row trace-summary__row--result" },
      el("span", { class: "trace-summary__label" }, "Max Vertical Reject Ht"),
      el("span", { class: "trace-summary__value trace-summary__value--result" }, `${srFt} ft`),
    ),
  );
}

function buildSRChartDetailsWithTrace(imgEntry, srResult, wind, aiOn) {
  const traceFn   = (srResult && srResult.ok && !srResult.anyHeight)
    ? (canvas) => _drawSRTrace(canvas, srResult, wind, aiOn)
    : null;
  const summaryFn = (srResult && srResult.ok)
    ? () => _buildSRSummaryRow(srResult, wind)
    : null;
  return buildChartDetailsWithTrace(imgEntry, traceFn, summaryFn);
}



// ============================================================================
// HLDF Chart Trace — Fig 4-71 AI ON (same structure as AI OFF Fig 4-68)
// Two-panel nomogram, shared X axis (Height Loss / Min Fwd Reject Height, ft)
//
// Trace design rules applied:
// 1. buildChartDetailsWithTrace pattern
// 2. Trace opt-in toggle, off by default
// 3. High contrast: black dashed line, gold dots, red result, halo labels
// 4. Trace summary row below thumbnail with all intermediate values
// 5. Fullscreen composites trace at full natural resolution
//
// Calibration (1700x2200px image):
//   X: x=643 (HL=0ft) x=1168 (HL=400ft)
//   Panel 1 Y (TV):    y=601 (TV=14)  y=1316 (TV=3)
//   Panel 2 Y (wind):  y=1356 (0kt ref line)  y=1746 (30kt)
//   Verified: TV=8 @AUW=13500 -> HL=220ft @ pixel (931,991) check
// ============================================================================

// AI ON — Fig 4-71 (1700x2200px)
// Verified: TV=8 @AUW=13500 -> HL=220ft @ pixel (931,991)
const HLDF_TRACE_AI_ON = {
  xHL0:         643,   xHL400:  1168,  xHLmax: 400,
  yTV14:        601,   yTV3:    1316,
  yWind0:       1356,  yWind30: 1746,  windMax: 30,
  imgW:         1700,  imgH:    2200,
  colTrace:     "rgba(0,0,0,0.85)",  colTraceDash: [12, 8],
  colDot:       "#ffcc00",           colResult:    "#ff4444",
  colShadow:    "rgba(255,255,255,0.85)",
  lineWidth:    3.0,   dotRadius: 7,
};

// AI OFF — Fig 4-68 (1700x2200px)
// Verified: TV=8 @AUW=14000 -> HL~252ft @ pixel (828,969) vs expected (830,969)
const HLDF_TRACE_AI_OFF = {
  xHL0:         492,   xHL400:  1029,  xHLmax: 400,
  yTV14:        566,   yTV3:    1305,
  yWind0:       1346,  yWind30: 1750,  windMax: 30,
  imgW:         1700,  imgH:    2200,
  colTrace:     "rgba(0,0,0,0.85)",  colTraceDash: [12, 8],
  colDot:       "#ffcc00",           colResult:    "#ff4444",
  colShadow:    "rgba(255,255,255,0.85)",
  lineWidth:    3.0,   dotRadius: 7,
};

// Select correct calibration based on AI state
function _hldfTrace(aiOn) {
  return aiOn ? HLDF_TRACE_AI_ON : HLDF_TRACE_AI_OFF;
}

function _hldfHL2px(hl, t) {
  return t.xHL0 + hl / t.xHLmax * (t.xHL400 - t.xHL0);
}

function _hldfTV2px(tv, t) {
  const tvScale = (t.yTV3 - t.yTV14) / (14 - 3);
  return t.yTV14 + (14 - tv) * tvScale;
}

function _hldfWind2px(kt, t) {
  return t.yWind0 + kt / t.windMax * (t.yWind30 - t.yWind0);
}

function _drawHLDFTrace(canvas, hlResult, wind, aiOn) {
  if (!hlResult || !hlResult.ok) return;
  const ctx = canvas.getContext("2d");
  const CW = canvas.width, CH = canvas.height;
  ctx.clearRect(0, 0, CW, CH);
  const t = _hldfTrace(aiOn);
  const sx = CW / t.imgW;
  const sy = CH / t.imgH;
  const { tv, xRef, hlFt, anyHeight } = hlResult;
  const windKt = (wind === null || wind === undefined) ? 0 : wind;
  // If xRef is null (TV off chart), draw TV line only and stop
  if (anyHeight && xRef === null) {
    const pyTV = _hldfTV2px(tv, t) * sy;
    const pxLeft = (t.xHL0 - 15) * sx;
    const pxRight = (t.xHL400 + 50) * sx;
    ctx.save(); ctx.beginPath();
    ctx.strokeStyle = t.colTrace; ctx.lineWidth = t.lineWidth * sx;
    ctx.setLineDash(t.colTraceDash.map(d => d * sx));
    ctx.moveTo(pxLeft, pyTV); ctx.lineTo(pxRight, pyTV); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.font = `bold ${Math.round(13*sx)}px sans-serif`;
    ctx.textAlign = "right"; ctx.textBaseline = "bottom";
    ctx.strokeStyle = t.colShadow; ctx.lineWidth = 4*sx; ctx.lineJoin = "round";
    ctx.strokeText(`TV ${tv.toFixed(1)}`, pxRight - 8*sx, pyTV - 6*sy);
    ctx.fillStyle = t.colTrace;
    ctx.fillText(`TV ${tv.toFixed(1)}`, pxRight - 8*sx, pyTV - 6*sy);
    ctx.restore();
    return;
  }

  const pxXRef  = _hldfHL2px(xRef, t)  * sx;
  const pxFinal = _hldfHL2px(hlFt, t)  * sx;
  const pyTV    = _hldfTV2px(tv, t)    * sy;
  const pyRef   = t.yWind0            * sy;
  const pyWind  = _hldfWind2px(windKt, t) * sy;
  const pyTop   = (t.yTV14  - 30)   * sy;
  const pyBot   = (t.yWind30 + 30)  * sy;
  const pxLeft  = (t.xHL0   - 15)   * sx;

  const dot = (px, py, col, r) => {
    ctx.beginPath(); ctx.arc(px, py, ((r||t.dotRadius)+2)*sx, 0, Math.PI*2);
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, (r||t.dotRadius)*sx, 0, Math.PI*2);
    ctx.fillStyle = col; ctx.fill();
  };

  const line = (x1,y1,x2,y2,col,w,dash) => {
    ctx.save(); ctx.beginPath();
    ctx.strokeStyle = col;
    ctx.lineWidth = (w||t.lineWidth)*sx;
    ctx.setLineDash(dash ? dash.map(d=>d*sx) : []);
    ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.restore();
  };

  const lbl = (px, py, text, col, align, base) => {
    ctx.save();
    ctx.font = `bold ${Math.round(13*sx)}px sans-serif`;
    ctx.textAlign = align||"center"; ctx.textBaseline = base||"middle";
    ctx.strokeStyle = t.colShadow; ctx.lineWidth = 4*sx; ctx.lineJoin = "round";
    ctx.strokeText(text,px,py); ctx.fillStyle = col; ctx.fillText(text,px,py);
    ctx.restore();
  };

  // Panel 1: horizontal from left to xRef at TV height
  line(pxLeft, pyTV, pxXRef, pyTV, t.colTrace, t.lineWidth, t.colTraceDash);
  dot(pxXRef, pyTV, t.colDot);

  // Panel 1: vertical drop from TV intersection to ref line
  line(pxXRef, pyTV, pxXRef, pyRef, t.colTrace, t.lineWidth, t.colTraceDash);
  dot(pxXRef, pyRef, t.colDot);

  // Panel 2
  if (windKt > 0) {
    line(pxXRef,  pyWind, pxFinal, pyWind, t.colTrace, t.lineWidth, t.colTraceDash);
    dot(pxXRef,  pyWind, t.colDot);
    line(pxFinal, pyWind, pxFinal, pyBot, t.colResult, t.lineWidth, t.colTraceDash);
    dot(pxFinal,  pyWind, t.colResult, t.dotRadius + 3);
  } else {
    line(pxXRef, pyRef, pxXRef, pyBot, t.colResult, t.lineWidth, t.colTraceDash);
  }

  if (!anyHeight) dot(pxFinal, pyBot, t.colResult);

  // Labels
  lbl(pxXRef - 10*sx, pyTV - 12*sy, `TV ${tv.toFixed(1)}`, t.colTrace, "right", "bottom");
  lbl(pxXRef,         pyRef + 14*sy, `${Math.round(xRef)} ft`, t.colDot, "center", "top");
  if (!anyHeight) lbl(pxFinal, pyBot + 14*sy, `${hlFt} ft`, t.colResult, "center", "top");
}

function _buildHLDFSummaryRow(hlResult, wind) {
  if (!hlResult || !hlResult.ok) return null;
  const { tv, xRef, hlFt, anyHeight } = hlResult;
  const windKt = (wind === null || wind === undefined) ? 0 : wind;
  return el("div", { class: "trace-summary" },
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "Transfer Value"),
      el("span", { class: "trace-summary__value" }, tv.toFixed(1)),
    ),
    xRef !== null && el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "HL (no wind)"),
      el("span", { class: "trace-summary__value" }, `${Math.round(xRef)} ft`),
    ),
    el("div", { class: "trace-summary__row" },
      el("span", { class: "trace-summary__label" }, "Headwind"),
      el("span", { class: "trace-summary__value" }, `${windKt} kt`),
    ),
    el("div", { class: "trace-summary__row trace-summary__row--result" },
      el("span", { class: "trace-summary__label" }, "Min Fwd Reject Ht"),
      el("span", { class: "trace-summary__value trace-summary__value--result" },
        anyHeight ? "HT LOSS EXCEEDS 400 ft" : `${hlFt} ft`),
    ),
  );
}

function buildHLDFChartDetailsWithTrace(imgEntry, hlResult, wind, aiOn) {
  const hasTrace  = hlResult && hlResult.ok && hlResult.tv !== undefined;
  const traceFn   = hasTrace
    ? (canvas) => _drawHLDFTrace(canvas, hlResult, wind, aiOn)
    : null;
  const summaryFn = hasTrace
    ? () => _buildHLDFSummaryRow(hlResult, wind)
    : null;
  return buildChartDetailsWithTrace(imgEntry, traceFn, summaryFn);
}



function rerender() {
  if (STORE.currentTab === "pa") {
    applyLocks();
    for (const n of [1, 2, 3]) renderEngineCard(n);
    renderSummary();
  } else if (STORE.currentTab === "pretooff") {
    renderPreTakeOffPACalc();
    renderPreTakeOff();
  } else if (STORE.currentTab === "sarcb") {
    renderSARCheckHOGE();
  } else if (STORE.currentTab === "hover") {
    renderHover();
  }
}


// ---- Boot -----------------------------------------------------------------

// ---- Fuel Management ------------------------------------------------------

function fmtHrsMin(totalMins) {
  if (!isFinite(totalMins) || totalMins < 0) return "—";
  const h = Math.floor(totalMins / 60);
  const m = Math.round(totalMins % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function calcActualBurnRate() {
  const F = STORE.fuel;
  if (F.readings.length < 2) return null;
  const first  = F.readings[0];
  const latest = F.readings[F.readings.length - 1];
  const elapsedHrs = (latest.ts - first.ts) / 3_600_000;
  if (elapsedHrs <= 0) return null;
  const used = first.kg - latest.kg;
  if (used <= 0) return null;
  return used / elapsedHrs;
}

function calcIntervalBurnRate(prevKg, prevTs, currKg, currTs) {
  const elapsedHrs = (currTs - prevTs) / 3_600_000;
  if (elapsedHrs <= 0) return null;
  const used = prevKg - currKg;
  if (used <= 0) return null;
  return used / elapsedHrs;
}

function currentFuelKg() {
  const F = STORE.fuel;
  if (F.readings.length > 0) return F.readings[F.readings.length - 1].kg;
  return null;
}

function renderFuel() {
  renderFuelLog();
  renderFuelState();
  renderFuelLegs();
  renderFuelRouteSummary();
}

function renderFuelLog() {
  const logBody = $("#fuelLogBody");
  if (!logBody) return;
  clearEl(logBody);
  const F = STORE.fuel;
  const logBtn     = $("#fuelLogBtn");
  const inputLabel = $("#fuelCurrentLabel");
  const inputEl    = $("#fuelCurrentInput");
  const inputWrap  = inputEl && inputEl.closest(".field__input-wrap");

  const editing = F._editingIdx !== null;
  if (logBtn) logBtn.textContent = editing ? "Save Edit" : "Log Reading";

  // Update label and border to signal edit mode vs normal log mode
  if (inputLabel) {
    if (editing) {
      const r = F.readings[F._editingIdx];
      const tStr = new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      inputLabel.textContent = `Corrected Quantity — entry at ${tStr}`;
    } else {
      inputLabel.textContent = "Current Fuel";
    }
  }
  if (inputWrap) inputWrap.classList.toggle("field__input-wrap--editing", editing);

  if (editing) {
    const cancelBtn = el("button", {
      id: "fuelCancelEditBtn",
      class: "btn btn--secondary",
      type: "button",
      onClick: () => {
        STORE.fuel._editingIdx = null;
        renderFuelLog();
      }
    }, "Cancel");
    logBody.appendChild(cancelBtn);
  }
  const logEl = el("div", { class: "fuel-log-table" });
  logEl.appendChild(el("div", { class: "fuel-log-header" },
    el("span", {}, "Time"),
    el("span", {}, "Fuel (kg)"),
    el("span", {}, "Burn Rate"),
    el("span", {}),
  ));
  [...F.readings].reverse().forEach((r, revIdx) => {
    const idx = F.readings.length - 1 - revIdx;
    const isEditing = F._editingIdx === idx;
    const prevKg = idx === 0 ? r.kg : F.readings[idx - 1].kg;
    const prevTs = idx === 0 ? r.ts  : F.readings[idx - 1].ts;
    const intervalRate = calcIntervalBurnRate(prevKg, prevTs, r.kg, r.ts);
    const tStr = new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const rateCell = el("span", { class: "fuel-reading-rate" },
      intervalRate ? `${Math.round(intervalRate)} kg/hr` : "—"
    );
    const editBtn = el("button", {
      class: "fuel-log-edit-btn" + (isEditing ? " fuel-log-edit-btn--active" : ""),
      type: "button",
      title: "Edit quantity for this entry — time and burn rate will not change",
      onClick: () => {
        if (isEditing) {
          STORE.fuel._editingIdx = null;
        } else {
          STORE.fuel._editingIdx = idx;
        }
        renderFuelLog();
      }
    }, isEditing ? "✎ editing" : "✎ edit qty");
    const row = el("div", {
      class: "fuel-log-row" + (isEditing ? " fuel-log-row--editing" : ""),
    },
      el("span", { class: "fuel-reading-time" }, tStr),
      r.editedAt
        ? el("span", { class: "fuel-reading-kg" },
            r.kg.toLocaleString(),
            el("span", { class: "fuel-log-edited-note" }, " (edited)"))
        : el("span", { class: "fuel-reading-kg" }, r.kg.toLocaleString()),
      rateCell,
      editBtn,
    );
    logEl.appendChild(row);
  });
  // First reading serves as session start — no separate row needed
  logBody.appendChild(logEl);
}

function renderFuelState() {
  const card = $("#fuelStateCard");
  const body = $("#fuelStateBody");
  if (!card || !body) return;
  const F = STORE.fuel;
  if (F.readings.length === 0) { card.hidden = true; return; }
  card.hidden = false;
  clearEl(body);
  const bingo       = F.bingoKg != null ? F.bingoKg : 250;
  const planRate    = F.planRateKgHr != null ? F.planRateKgHr : 800;
  const current     = currentFuelKg();
  const actualRate  = calcActualBurnRate();
  const displayRate = actualRate || planRate;
  const anomaly     = actualRate && actualRate > planRate * 1.1;
  const usable      = current - bingo;
  const timeToBingoMins = usable > 0 ? (usable / displayRate) * 60 : 0;
  const timeToEmptyMins = current > 0 ? (current / displayRate) * 60 : 0;
  const lastTs = F.readings.length > 0 ? F.readings[F.readings.length - 1].ts : null;
  const staleMins = lastTs !== null ? Math.round((Date.now() - lastTs) / 60000) : null;
  const mkRow = (label, value, opts = {}) => {
    const r = el("div", { class: "summary-row" },
      el("span", { class: "summary-row__label" }, label),
      el("span", { class: "summary-row__value" + (opts.cls ? " " + opts.cls : "") }, value),
    );
    if (opts.note) r.appendChild(el("span", { class: "fuel-note" }, opts.note));
    return r;
  };
  const table = el("div", { class: "summary-table" });
  const ageSpan = el("span", { class: "fuel-note", id: "fuelReadingAge" },
    lastTs !== null ? `reading ${staleMins} min ago` : "session start");
  const currentRow = mkRow("Current Fuel", `${Math.round(current).toLocaleString()} kg`);
  currentRow.appendChild(ageSpan);
  table.appendChild(currentRow);
  table.appendChild(mkRow("Reserve Fuel", `${bingo.toLocaleString()} kg`));
  table.appendChild(mkRow("Usable Remaining",
    `${Math.max(0, Math.round(usable)).toLocaleString()} kg`,
    { cls: usable < 0 ? "fuel-bad" : usable < bingo * 0.3 ? "fuel-warn" : "summary-row--pass" }
  ));
  const startKgForCalc = F.readings.length > 0 ? F.readings[0].kg : null;
  table.appendChild(mkRow("Fuel Used", startKgForCalc != null
    ? `${Math.round(startKgForCalc - current).toLocaleString()} kg` : "—"));
  table.appendChild(mkRow("Burn Rate",
    actualRate ? `${Math.round(actualRate)} kg/hr` : `${planRate} kg/hr`,
    {
      cls: anomaly ? "fuel-warn" : "",
      note: actualRate ? "actual (rolling average)" : "planning figure — log readings to update",
    }
  ));
  if (anomaly) {
    body.appendChild(el("div", { class: "fuel-anomaly" },
      `⚠ Actual burn ${Math.round(actualRate)} kg/hr exceeds plan ${planRate} kg/hr`));
  }
  table.appendChild(mkRow("Time to Reserve", fmtHrsMin(timeToBingoMins),
    { cls: timeToBingoMins < 30 ? "fuel-warn" : "" }));
  table.appendChild(mkRow("Time to Empty", fmtHrsMin(timeToEmptyMins)));
  body.appendChild(table);
}

function renderFuelLegs() {
  const addBtn    = $("#fuelAddLegBtn");
  const legsBody  = $("#fuelLegsBody");
  const legsCard  = $("#fuelLegsCard");
  if (!addBtn || !legsBody || !legsCard) return;
  const F = STORE.fuel;
  const legs = F.legs;
  if (F.readings.length === 0 || legs.length === 0) { legsCard.hidden = true; return; }
  legsCard.hidden = false;
  clearEl(legsBody);
  const bingo   = F.bingoKg != null ? F.bingoKg : 250;
  const planRate = F.planRateKgHr != null ? F.planRateKgHr : 800;
  const actualRate = calcActualBurnRate();
  legs.forEach((leg, i) => {
    const legEl = el("div", { class: "fuel-leg" },
      el("div", { class: "fuel-leg__header" },
        el("span", { class: "fuel-leg__num" }, `Leg ${i + 1}`),
        el("button", {
          class: "fuel-leg__remove", type: "button", "aria-label": "Remove leg",
          onClick: () => { F.legs.splice(i, 1); renderFuel(); },
        }, "×"),
      ),
    );
    const nameInput = el("input", { class: "field__input", type: "text", placeholder: "Leg name (optional)",
      value: leg.name || "", onInput: (e) => { F.legs[i].name = e.target.value; } });
    const distInput = el("input", { class: "field__input mono", type: "number",
      inputmode: "numeric", step: "1", placeholder: "Distance (nm)",
      value: leg.distNm != null ? String(leg.distNm) : "",
      onInput: (e) => {
        const v = parseFloat(e.target.value);
        F.legs[i].distNm = isNaN(v) ? null : v;
        renderFuelRouteSummary();
      }
    });
    legEl.appendChild(nameInput);
    legEl.appendChild(distInput);
    legsBody.appendChild(legEl);
  });
  addBtn.disabled = legs.length >= 3;
}

function renderFuelRouteSummary() {
  const card = $("#fuelRouteSummaryCard");
  const body = $("#fuelRouteSummaryBody");
  if (!card || !body) return;
  const F    = STORE.fuel;
  const legs = F.legs.filter(l => l.distNm != null && l.distNm > 0);
  if (F.readings.length === 0 || legs.length === 0) { card.hidden = true; return; }
  card.hidden = false;
  clearEl(body);
  const bingo      = F.bingoKg != null ? F.bingoKg : 250;
  const planRate   = F.planRateKgHr != null ? F.planRateKgHr : 800;
  const actualRate = calcActualBurnRate();
  const useRate    = actualRate || planRate;
  const current    = currentFuelKg();
  let fuelAfter = current;
  legs.forEach((leg, i) => {
    const nm = leg.distNm;
    const fuelReqPlan   = gs ? (nm / gs) * planRate : null;
    const fuelReqActual = (gs && actualRate) ? (nm / gs) * actualRate : null;
    fuelAfter -= (fuelReqPlan || 0);
    const usableAfter    = fuelAfter - bingo;
    const goNoGo         = fuelReqPlan != null ? fuelAfter >= bingo : null;
    const legSummary = el("div", { class: "fuel-leg-summary" });
    const hdr = el("div", { class: "fuel-leg-summary-header" },
      el("span", {}, leg.name || `Leg ${i+1}`),
      goNoGo !== null
        ? el("span", { class: `fuel-leg-badge ${goNoGo ? "fuel-leg-badge--go" : "fuel-leg-badge--nogo"}` },
            goNoGo ? "GO" : "NO-GO")
        : el("span", { class: "fuel-leg-badge" }, `${nm} nm`),
    );
    legSummary.appendChild(hdr);
    const t = el("div", { class: "summary-table" });
    if (fuelReqPlan != null)
      t.appendChild(el("div", { class: "summary-row" },
        el("span", { class: "summary-row__label" }, "Fuel required (plan)"),
        el("span", { class: "summary-row__value" }, `${Math.round(fuelReqPlan)} kg`),
      ));
    if (fuelReqActual != null)
      t.appendChild(el("div", { class: "summary-row" },
        el("span", { class: "summary-row__label" }, "Fuel required (actual rate)"),
        el("span", { class: "summary-row__value" }, `${Math.round(fuelReqActual)} kg`),
      ));
    t.appendChild(el("div", { class: "summary-row" },
      el("span", { class: "summary-row__label" }, "Above reserve after leg"),
      el("span", { class: `summary-row__value ${usableAfter < 0 ? "fuel-bad" : ""}` },
        `${Math.round(usableAfter)} kg`),
    ));
    legSummary.appendChild(t);
    body.appendChild(legSummary);
  });
  const goAll = fuelAfter >= bingo;
  body.appendChild(el("div", { class: `summary-row ${goAll ? "summary-row--pass" : "fuel-bad"}`,
    style: "margin-top: 12px; font-weight: 600;" },
    el("span", { class: "summary-row__label" }, "Fuel after all legs"),
    el("span", { class: "summary-row__value" }, `${Math.round(fuelAfter)} kg`),
  ));
}

function init() {
  initTheme();
  initChartViewer();

  // ± sign toggle — flips sign of PA and OAT inputs for numpad users.
  // Single delegated listener covers all fields tagged with data-sign-for.
  // Fires a native "input" event after flipping so STORE and rerender stay in sync.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-sign-for]");
    if (!btn) return;
    const input = document.getElementById(btn.dataset.signFor);
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val) || val === 0) return;
    input.value = String(-val);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  // Tab switching
  $$(".tab").forEach(btn => {
    if (btn.dataset.tab) {
      btn.addEventListener("click", (e) => {
        if (!btn.disabled) {
          showTab(btn.dataset.tab);
        }
      });
    }
  });

  // Pre-Take Off Anti-Ice toggle
  $$("[data-pretooff-ai]").forEach(btn => {
    btn.addEventListener("click", () => {
      setAntiIce(btn.dataset.pretooffAi);
    });
  });

  // SAR Check Anti-Ice toggle
  $$("[data-sarcb-ai]").forEach(btn => {
    btn.addEventListener("click", () => {
      setAntiIce(btn.dataset.sarcbAi);
    });
  });

  // Hover Performance Anti-Ice toggle
  $$("[data-hov-ai]").forEach(btn => {
    if (btn) btn.addEventListener("click", () => {
      setAntiIce(btn.dataset.hovAi);
    });
  });

  // Hover Performance: condition fields
  // Guard against null — throws and kills init() if index.html lacks the hover panel
  const hovBind = (id, prop) => {
    const input = $(id);
    if (!input) return;
    input.addEventListener("input", (e) => {
      STORE.hover[prop] = num(e.target.value);
      rerender();
    });
  };
  hovBind("#hovAuwInput",  "auw");
  hovBind("#hovPaInput",   "pa");
  hovBind("#hovOatInput",  "oat");
  hovBind("#hovWindInput", "wind");
  hovBind("#hovTmInput",   "tm");

  // Power Assurance: Mode toggle (scoped to its own group)
  $$("#modeSegGroup .seg__btn").forEach(btn => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  // Power Assurance: Shared condition fields
  $("#oatInput").addEventListener("input", (e) => {
    STORE.powerAssurance.oat = num(e.target.value);
    rerender();
  });
  $("#paInput").addEventListener("input", (e) => {
    STORE.powerAssurance.pa = num(e.target.value);
    rerender();
  });

  // Pre-Take Off: QNH unit toggle
  $$("[data-pretooff-qnh]").forEach(btn => {
    btn.addEventListener("click", () => {
      STORE.preTakeOff.qnhUnit = btn.dataset.pretooffQnh;
      $$("[data-pretooff-qnh]").forEach(b => {
        b.classList.toggle("seg__btn--active", b.dataset.pretooffQnh === STORE.preTakeOff.qnhUnit);
      });
      const unitLabel = $("#pretooffQnhUnit");
      if (unitLabel) unitLabel.textContent = STORE.preTakeOff.qnhUnit === "inhg" ? "inHg" : "mbar";
      renderPreTakeOffPACalc();
    });
  });

  // Pre-Take Off: PA calculator fields
  $("#pretooffElevInput").addEventListener("input", (e) => {
    STORE.preTakeOff.elev = num(e.target.value);
    renderPreTakeOffPACalc();
  });
  $("#pretooffQnhInput").addEventListener("input", (e) => {
    STORE.preTakeOff.qnh = num(e.target.value);
    renderPreTakeOffPACalc();
  });

  // Pre-Take Off: Condition fields
  $("#pretooffAuwInput").addEventListener("input", (e) => {
    STORE.preTakeOff.auw = num(e.target.value);
    rerender();
  });
  $("#pretooffPaInput").addEventListener("input", (e) => {
    STORE.preTakeOff.pa = num(e.target.value);
    rerender();
  });
  $("#pretooffOatInput").addEventListener("input", (e) => {
    STORE.preTakeOff.oat = num(e.target.value);
    rerender();
  });

  // SAR Check: Condition fields
  $("#sarcbAuwInput").addEventListener("input", (e) => {
    STORE.sarCheck.auw = num(e.target.value);
    rerender();
  });
  $("#sarcbPaInput").addEventListener("input", (e) => {
    STORE.sarCheck.pa = num(e.target.value);
    rerender();
  });
  $("#sarcbOatInput").addEventListener("input", (e) => {
    STORE.sarCheck.oat = num(e.target.value);
    rerender();
  });
  $("#sarcbWindInput").addEventListener("input", (e) => {
    STORE.sarCheck.wind = num(e.target.value);
    rerender();
  });

  // SAR Check: HOGE — pilot entry (clears chart source)
  $("#sarcbHogeInput").addEventListener("input", (e) => {
    const v = num(e.target.value);
    STORE.sarCheck.hogeValue  = v;
    STORE.sarCheck.hogeSource = "pilot";
    rerender();
  });

  // SAR Check: HOGE — derive from chart
  $("#sarcbHogeCalcBtn").addEventListener("click", () => {
    deriveHOGEFromChart();
  });

  // Build the dynamic bits. Power Assurance setup.
  renderEngines();
  setMode(STORE.powerAssurance.mode);


  // ---- Fuel Management event listeners ------------------------------------

  const fuelBind = (id, storeProp) => {
    const input = $(id);
    if (!input) return;
    input.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      STORE.fuel[storeProp] = isNaN(v) ? null : v;
      renderFuel();
    });
  };

  fuelBind("#fuelBingoInput",    "bingoKg");
  fuelBind("#fuelPlanRateInput", "planRateKgHr");

  $("#fuelLogBtn").addEventListener("click", () => {
    const input = $("#fuelCurrentInput");
    const v = parseFloat(input.value);
    if (isNaN(v) || v <= 0) return;
    if (STORE.fuel._editingIdx !== null) {
      const idx = STORE.fuel._editingIdx;
      STORE.fuel.readings[idx].kg = v;
      STORE.fuel.readings[idx].editedAt = Date.now();
      STORE.fuel._editingIdx = null;
    } else {
      if (!STORE.fuel._sessionStart) STORE.fuel._sessionStart = Date.now();
      STORE.fuel.readings.push({ kg: v, ts: Date.now() });
    }
    input.value = "";
    input.focus();
    renderFuel();
  });

  $("#fuelAddLegBtn").addEventListener("click", () => {
    if (STORE.fuel.legs.length >= 3) return;
    STORE.fuel.legs.push({ name: "", distNm: null });
    renderFuelLegs();
  });

  $("#fuelResetBtn").addEventListener("click", () => {
    if (!confirm("Reset session? All fuel readings, legs, and setup values will be cleared.")) return;
    STORE.fuel = {
      bingoKg:       250,
      planRateKgHr:  800,
      readings:      [],
      legs:          [],
      _sessionStart: null,
      _editingIdx:   null,
    };
    ["#fuelBingoInput",
     "#fuelPlanRateInput", "#fuelCurrentInput"].forEach(id => {
      const el = $(id);
      if (el) el.value = "";
    });
    renderFuel();
  });
  // Show the active tab
  showTab(STORE.currentTab);
}

// ---- Splash screen ---------------------------------------------------------
function initSplash() {
  const splash = document.getElementById("splashScreen");
  const btn    = document.getElementById("splashAcceptBtn");
  const ver    = document.getElementById("splashVersion");
  if (!splash) return;

  // Populate version from config
  if (ver && typeof AC !== "undefined" && AC.version) {
    ver.textContent = "v" + AC.version;
  }

  // Dismiss on button click
  btn.addEventListener("click", function () {
    splash.style.opacity = "0";
    splash.style.transition = "opacity 0.3s";
    setTimeout(function () { splash.remove(); }, 300);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () { init(); initSplash(); });
} else {
  init();
  initSplash();
}

// Live-update the reading age display every 30 seconds
setInterval(() => {
  const F = STORE.fuel;
  if (F.readings.length === 0) return;
  const ageSpan = document.getElementById("fuelReadingAge");
  if (!ageSpan) return;
  const staleMins = Math.round((Date.now() - F.readings[F.readings.length - 1].ts) / 60000);
  ageSpan.textContent = `reading ${staleMins} min ago`;
}, 30000);