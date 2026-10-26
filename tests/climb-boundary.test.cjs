// Run with: node --test tests/climb-boundary.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
function load() {
  const context = vm.createContext({ localStorage: { getItem: () => null }, console });
  for (const file of ['config.js', 'compute.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  }
  return context;
}
function lookup(context, mass) {
  return vm.runInContext(`_climbLookup('aeo_30min_ai_on', 10000, -1, ${mass})`, context);
}

test('reported AI ON conditions produce 498 ft/min; 13,900 kg stays at 537', () => {
  const context = load();
  const result = lookup(context, 14000);
  assert.equal(result.ok, true);
  assert.equal(result.finalRoc, 498);
  assert.equal(result.rawRoc, 1588);
  assert.equal(result.extrapolationWarning, false);
  assert.equal(lookup(context, 13900).finalRoc, 537);
  // Smooth, decreasing output across the neighbouring curve's 13,946 kg exit.
  let previous = Infinity;
  for (let mass = 13900; mass <= 14000; mass++) {
    const current = lookup(context, mass);
    assert.equal(current.ok, true, `mass ${mass}`);
    assert.ok(current.finalRoc <= previous);
    if (Number.isFinite(previous)) assert.ok(previous - current.finalRoc <= 1);
    previous = current.finalRoc;
  }
  assert.equal(lookup(context, 15600).reason, 'cannot_climb');
  assert.equal(lookup(context, 15601).reason, 'auw_above_max');
});

test('interpolated edge admits interior/zero traces and rejects outside/truncated data', () => {
  const context = load();
  // Two straight correction lines exit at 14,000 and 15,000 kg. The
  // reference RoC at their interpolated zero-climb edge at 14,500 is 150.
  vm.runInContext(`AC.perf.climbPerf.test = {
    xMin: 0, xMax: 3200,
    upperPanel: { PA_0: [{oat:-10,roc:100},{oat:0,roc:200}] },
    lowerPanel: {refMassKg:13000,maxMassKg:15600,lines:[
      {refRoc:100,points:[{mass:13000,roc:100},{mass:14000,roc:0}]},
      {refRoc:200,points:[{mass:13000,roc:200},{mass:15000,roc:0}]}
    ]}
  }`, context);
  const run = (oat, mass = 14500) => vm.runInContext(`_climbLookup('test',0,${oat},${mass})`, context);
  assert.equal(run(-2.5).finalRoc, 25);
  assert.equal(run(-5).finalRoc, 0);
  assert.equal(run(-5).ok, true);
  assert.equal(run(-5.1).reason, 'cannot_climb');
  assert.equal(run(0, 15000).finalRoc, 0);
  assert.equal(run(0, 15001).reason, 'cannot_climb');
  vm.runInContext('AC.perf.climbPerf.test.lowerPanel.lines[0].points[1].roc = 10', context);
  assert.equal(run(-2.5).reason, 'climb_correction_outside_chart');
});

test('corrected result draws the chart trace and the 498 ft/min label', () => {
  const context = load();
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const traceCode = app.slice(app.indexOf('const CLIMB_TRACE_CAL ='),
    app.indexOf('function _buildClimbSummaryRow('));
  vm.runInContext(traceCode, context);
  const calls = [];
  const drawing = new Proxy({}, {
    get: (_, method) => (...args) => {
      for (const value of args) {
        if (typeof value === 'number') assert.ok(Number.isFinite(value));
      }
      calls.push({ method, args });
    }
  });
  context.canvas = { width:1700, height:2200, getContext:() => drawing };
  vm.runInContext(`_drawClimbTrace(canvas,
    _climbLookup('aeo_30min_ai_on',10000,-1,14000),
    10000,-1,14000,'aeo_30min_ai_on')`, context);
  assert.ok(calls.some(call => call.method === 'lineTo'));
  assert.ok(calls.some(call => call.method === 'fillText' && call.args[0] === '498 ft/min'));
});
