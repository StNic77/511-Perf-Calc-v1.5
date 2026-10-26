// Read-only audit of app source/data. No app files or browser state are modified.
// Run: node Handoff/Audit_2026-10-26/audit.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const elements = new Map();
class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.dataset = {}; this.style = {};
    this.value = ''; this.hidden = false; this._text = ''; this.handlers = {};
    this.classList = { toggle() {}, add() {}, remove() {}, contains() { return false; } };
  }
  get firstChild() { return this.children[0] || null; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(' '); }
  set textContent(value) { this._text = String(value); this.children = []; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, handler) { this.handlers[name] = handler; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() {}
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, new Element());
const document = {
  readyState: 'loading', addEventListener() {},
  querySelector: selector => selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null,
  querySelectorAll: () => [],
  getElementById: id => elements.get(id) || null,
  createElement: tag => new Element(tag),
  createElementNS: (_, tag) => new Element(tag),
  createTextNode: text => { const node = new Element('#text'); node.textContent = text; return node; }
};
const context = vm.createContext({ console, document, localStorage:{ getItem:()=>null },
  setInterval() {}, setTimeout() {}, navigator:{}, Date });
for (const file of ['config.js', 'compute.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename:file });
}
const run = source => vm.runInContext(source, context);
const api = run(`({ AC, STORE, getTransferValue, getHOGE, getPowerAvailable,
  getMaxMassToHover, getHeightLoss, getSafeReject, computeEnginePA, _climbLookup,
  _lookupHLSRUpper, _lookupHLSRLower, _hovPanel1, _hovPanel2, _hovPanel3,
  deriveHOGEFromChart, renderSARCheckHOGE, pullHoverToSar, SESSION,
  renderFuel, fmtHrsMin, buildSARCheckBrief,
  _paPAcurve2x, _paOAT2y, PA_TRACE_ENG13_LOW, PA_TRACE_ENG2_LOW,
  PA_TRACE_ENG13_MID, PA_TRACE_ENG2_MID, _drawPATrace, _drawAnnexBTrace,
  _drawHOGETrace, _drawTVTrace, _drawHLDFTrace, _drawSRTrace, _drawHovTrace,
  _drawClimbTrace, getAnnexBRefQ, CLIMB_TRACE_CAL, _climbMass2py,
  getPowerAssuranceMaxTIT, bracket })`);
const report = {};
report.version = api.AC.version;
report.phase = process.argv.includes('--post-fix') ? 'post-fix' : 'audit';
report.climb = [];
for (const variant of Object.keys(api.AC.perf.climbPerf)) {
  for (const [pa,oat,mass] of [[10000,-1,13900],[10000,-1,14000],[10000,20,10000],
      [10000,0,13000],[12000,0,13000],[-2000,0,13000]]) {
    report.climb.push({variant,pa,oat,mass,result:api._climbLookup(variant,pa,oat,mass)});
  }
}
report.hover = [];
for (const antiIce of ['OFF','ON']) for (const rating of ['maxCont','thirtyMin']) {
  for (const [pa,oat] of [[10000,-44],[10000,-45],[0,40],[0,41],[-1000,35],[-1001,35]]) {
    report.hover.push({antiIce,rating,pa,oat,
      result:api.getMaxMassToHover({pa,oat,wind:0,tm:0,antiIce,rating})});
  }
}
report.transfer = [];
for (const antiIce of ['OFF','ON']) for (const [pa,oat] of [[10000,20],[10000,40],[12000,20],[-2000,40],[0,-45],[0,-60]]) {
  report.transfer.push({antiIce,pa,oat,result:api.getTransferValue(pa,oat,antiIce)});
}
// HOGE stale result after a successful calculation is followed by an invalid one.
api.STORE.currentTab = 'sarcb';
Object.assign(api.STORE.sarCheck,{pa:0,oat:15,auw:12000,wind:0,hogeValue:null,hogeSource:'pilot'});
api.deriveHOGEFromChart();
report.staleHoge = {initial:{...api.STORE.sarCheck},initialDisplay:elements.get('sarcbHogeBody').textContent};
api.STORE.sarCheck.auw = 20000;
api.deriveHOGEFromChart();
report.staleHoge.afterFailure = {...api.STORE.sarCheck};
report.staleHoge.error = elements.get('sarcbHogeSourceLabel').textContent;
report.staleHoge.displayAfterFailure = elements.get('sarcbHogeBody').textContent;
api.renderSARCheckHOGE();
report.staleHoge.displayAfterRender = elements.get('sarcbHogeBody').textContent;
report.staleHoge.sourceAfterRender = elements.get('sarcbHogeSourceLabel').textContent;
// Pulling conditions bypasses the chart-HOGE refresh entirely.
Object.assign(api.STORE.sarCheck,{pa:0,oat:15,auw:12000,wind:0,hogeValue:null,hogeSource:'pilot'});
api.deriveHOGEFromChart();
api.SESSION.hover = {pa:0,oat:15,auw:14000,wind:0,time:new Date()};
api.pullHoverToSar();
report.pullHoge = {state:{...api.STORE.sarCheck},
  requiredHoge:api.getHOGE({pa:0,oat:15,auw:14000,wind:0,antiIce:'OFF'}),
  display:elements.get('sarcbHogeBody').textContent};
report.fuel = {};
api.STORE.fuel.readings = [{kg:1000,ts:0}];
report.fuel.timeFormatting = [59.5,119.5].map(minutes=>({minutes,text:api.fmtHrsMin(minutes)}));
report.brief = api.buildSARCheckBrief(false,14000,{oei:100,aeoEquiv:66},80,null,null,true);
report.hogeEndpoints = [];
for(const antiIce of ['OFF','ON']) for(const auw of [12000,15600]) for(const wind of [0,0.1,29,30]) {
  const inputs={pa:0,oat:15,auw,wind,antiIce};
  report.hogeEndpoints.push({inputs,result:api.getHOGE(inputs)});
}
report.heightLossLabels = [];
for(const inputs of [{pa:-1000,oat:-30,auw:12500,wind:0,antiIce:'ON'},
    {pa:-1000,oat:-10,auw:15600,wind:30,antiIce:'OFF'}]) {
  const result=api.getHeightLoss(inputs);
  const chart=api.AC.perf.heightLoss[inputs.antiIce==='ON'?'aiOn':'aiOff'];
  report.heightLossLabels.push({inputs,result,
    upper:api._lookupHLSRUpper(chart,result.tv,inputs.auw),
    hoge:api.getHOGE(inputs), power:api.getPowerAvailable(inputs.pa,inputs.oat,inputs.antiIce)});
}
report.overlay = {variant:'aeo_30min_ai_on',mass:14000,
  calculatedY:api._climbMass2py(14000,api.CLIMB_TRACE_CAL.aeo_30min_ai_on,2200),
  measuredDatumY:1557,
  measurement:'Dark horizontal grid row on the existing 1700x2200 source image.'};
report.powerAssuranceLowerBoundary = [];
for(const engineNum of [1,2]) {
  const chart=api.AC.perf.powerAssurance.bands.low.charts[engineNum===2?'2':'1_3'];
  report.powerAssuranceLowerBoundary.push({inputs:{engineNum,pa:0,oat:-45,eng_tq:51},
    result:api.getPowerAssuranceMaxTIT(chart,51,0,-45),
    lowerCurveFirstPoint:chart.lower.curves['-45'][0]});
}
// Check chart references and deterministic precache coverage without a network.
const images = new Set();
function walk(value) {
  if (typeof value === 'string' && value.startsWith('images/')) images.add(value);
  else if (Array.isArray(value)) value.forEach(walk);
  else if (value && typeof value === 'object') Object.values(value).forEach(walk);
}
walk(api.AC.chartImages);
const sw = fs.readFileSync(path.join(root,'sw.js'),'utf8');
report.assets = {missingFiles: [...images].filter(image=>!fs.existsSync(path.join(root,image))),
  notPrecached:[...images].filter(image=>!sw.includes(`'./${image}'`))};
// Schema, finite values and monotonic independent axes.
report.data = {nonFinite:[], axisProblems:[], curvesChecked:0, orderingProblems:[]};
function check(value, location='AC.perf') {
  if (typeof value === 'number' && !Number.isFinite(value)) report.data.nonFinite.push(location);
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    const first=value[0];
    if (first && typeof first==='object') {
      const key = ['oat','wind','tm','mass'].find(key=>key in first);
      if (key) {
        report.data.curvesChecked++;
        for(let i=1;i<value.length;i++) if(value[i][key]<value[i-1][key]) {
          report.data.orderingProblems.push({location,key,index:i});break;
        }
      }
    }
  } else {
    for(const [key,axis] of Object.entries(value)) if(key.endsWith('Axis') && Array.isArray(axis)) {
      for(let i=1;i<axis.length;i++) if(axis[i]<=axis[i-1]) report.data.axisProblems.push({location,key,index:i});
      if(value.curves && !Array.isArray(value.curves)) for(const entry of axis) {
        if(!value.curves[String(entry)]) report.data.axisProblems.push({location,key,missing:entry});
      }
    }
  }
  for(const [key,entry] of Object.entries(value)) check(entry,location+'.'+key);
}
check(api.AC.perf);
// These boundary arrays are sorted by OAT inside the calculation, so their
// storage order is informational, not a defect.
report.data.runtimeSortedBoundaryNotices = report.data.orderingProblems.filter(p=>p.location.endsWith('.rightBoundary'));
report.data.orderingProblems = report.data.orderingProblems.filter(p=>!p.location.endsWith('.rightBoundary'));
function checkPoints(points,key,location) {
  report.data.curvesChecked++;
  for(let i=1;i<points.length;i++) if(points[i][key]<points[i-1][key]) {
    report.data.orderingProblems.push({location,key,index:i}); break;
  }
}
for(const [key,curve] of Object.entries(api.AC.perf.powerAvailable.aiOff.curves)) checkPoints(curve,'x',`powerAvailable.${key}`);
for(const [bandName,band] of Object.entries(api.AC.perf.powerAssurance.bands)) for(const [group,chart] of Object.entries(band.charts)) {
  for(const [key,curve] of Object.entries(chart.upper.curves)) checkPoints(curve,'y',`powerAssurance.${bandName}.${group}.upper.${key}`);
  for(const [key,curve] of Object.entries(chart.lower.curves)) checkPoints(curve,'x',`powerAssurance.${bandName}.${group}.lower.${key}`);
}
for(const family of ['hoge','heightLoss','safeReject']) for(const [state,chart] of Object.entries(api.AC.perf[family])) {
  for(const [key,curve] of Object.entries(chart.upper.curves)) checkPoints(curve,'y',`${family}.${state}.upper.${key}`);
  if(family==='hoge') for(const [key,curve] of Object.entries(chart.lower.curves)) checkPoints(curve,'y',`${family}.${state}.lower.${key}`);
}
// Broad numerical sweeps: exceptions and nonfinite successful outputs.
report.sweep={calls:0,exceptions:[],nonFinite:[],successes:{},failures:{}};
function sample(name,inputs,fn) {
  report.sweep.calls++;
  try {
    const result=fn();
    const tally=result.ok?report.sweep.successes:report.sweep.failures;
    const key=name+(result.ok?'':':'+result.reason);
    tally[key]=(tally[key]||0)+1;
    if(result.ok) for(const [field,value] of Object.entries(result)) if(typeof value==='number'&&!Number.isFinite(value)) {
      if(report.sweep.nonFinite.length<20) report.sweep.nonFinite.push({name,inputs,field,value:String(value)});
    }
  } catch(error) { if(report.sweep.exceptions.length<20) report.sweep.exceptions.push({name,inputs,error:error.message}); }
}
for(const antiIce of ['OFF','ON']) for(let pa=-1000;pa<=10000;pa+=500) for(let oat=-45;oat<=40;oat+=5) {
  sample('transfer',{pa,oat,antiIce},()=>api.getTransferValue(pa,oat,antiIce));
  sample('power',{pa,oat,antiIce},()=>api.getPowerAvailable(pa,oat,antiIce));
  for(const rating of ['maxCont','thirtyMin']) for(const wind of [0,10,30]) for(const tm of [0,5,10]) {
    sample('hover',{pa,oat,antiIce,rating,wind,tm},()=>api.getMaxMassToHover({pa,oat,antiIce,rating,wind,tm}));
  }
  for(let auw=10000;auw<=15600;auw+=200) for(const wind of [0,10,30]) {
    const inputs={pa,oat,antiIce,auw,wind};
    sample('hoge',inputs,()=>api.getHOGE(inputs));
    sample('heightLoss',inputs,()=>api.getHeightLoss(inputs));
    sample('safeReject',inputs,()=>api.getSafeReject(inputs));
  }
  for(const engineState of ['aeo','oei']) for(const rating of ['mcp','30min']) for(let mass=10000;mass<=15600;mass+=100) {
    sample('climb',{pa,oat,antiIce,engineState,rating,mass},()=>api._climbLookup(`${engineState}_${rating}_ai_${antiIce.toLowerCase()}`,pa,oat,mass));
  }
}
for(let pa=-1000;pa<=4000;pa+=250) for(let oat=-45;oat<=40;oat+=5) for(let eng_tq=40;eng_tq<=90;eng_tq+=2) for(const engineNum of [1,2,3]) {
  for(const onGround of [false,true]) {
    const inputs={pa,oat,eng_tq,eng_tit:700,engineNum,onGround};
    sample('powerAssurance',inputs,()=>api.computeEnginePA(inputs));
  }
}
// Execute the plotting functions directly. This detects invalid drawing
// coordinates; it does not replace visual/browser/device validation.
report.drawing={calls:0,exceptions:[],nonFinite:[]};
function draw(name,fn) {
  const drawing=new Proxy({}, {get:(_,method)=>(...args)=>{
    for(const value of args) if(typeof value==='number'&&!Number.isFinite(value)) report.drawing.nonFinite.push({name,method,value:String(value)});
  }});
  const canvas={width:1700,height:2200,getContext:()=>drawing};
  report.drawing.calls++;
  try { fn(canvas); } catch(error) { report.drawing.exceptions.push({name,error:error.message}); }
}
for(const antiIce of ['OFF','ON']) {
  const inputs={pa:0,oat:15,auw:14000,wind:10,antiIce};const on=antiIce==='ON';
  draw(`hoge_${antiIce}`,canvas=>api._drawHOGETrace(canvas,api.getHOGE(inputs),10,on));
  draw(`transfer_${antiIce}`,canvas=>api._drawTVTrace(canvas,api.getTransferValue(0,15,antiIce),15,on));
  draw(`heightLoss_${antiIce}`,canvas=>api._drawHLDFTrace(canvas,api.getHeightLoss(inputs),10,on));
  draw(`safeReject_${antiIce}`,canvas=>api._drawSRTrace(canvas,api.getSafeReject(inputs),10,on));
  for(const rating of ['maxCont','thirtyMin']) draw(`hover_${rating}_${antiIce}`,canvas=>api._drawHovTrace(canvas,
    api.getMaxMassToHover({pa:0,oat:15,wind:10,tm:5,antiIce,rating}),15,10,5,rating,on));
}
for(const variant of Object.keys(api.AC.perf.climbPerf)) draw(variant,canvas=>api._drawClimbTrace(canvas,
  api._climbLookup(variant,0,15,14000),0,15,14000,variant));
draw('annexB',canvas=>api._drawAnnexBTrace(canvas,api.getAnnexBRefQ({pa:0,oat:15})));
report.paOverlayComparison=[];
for(const pa of [0,3000]) for(const engineNum of [1,2]) {
  const inputs={pa,oat:15,eng_tq:65,eng_tit:700,engineNum,onGround:false};
  const result=api.computeEnginePA(inputs);
  const calibration=pa===0?(engineNum===2?api.PA_TRACE_ENG2_LOW:api.PA_TRACE_ENG13_LOW):
    (engineNum===2?api.PA_TRACE_ENG2_MID:api.PA_TRACE_ENG13_MID);
  const xDrop=api._paPAcurve2x(65,pa,calibration);
  const y=api._paOAT2y(xDrop,15,calibration);
  const representedTIT=calibration.titMax-(y-calibration.botYT)/(calibration.botYB-calibration.botYT)*(calibration.titMax-calibration.titMin);
  report.paOverlayComparison.push({inputs,result,representedTIT,deltaC:representedTIT-result.chartTIT});
  draw(`powerAssurance_${pa}_${engineNum}`,canvas=>api._drawPATrace(canvas,result,65,pa,15,calibration));
}
const outputFile=process.argv.includes('--post-fix')?'post-fix-results.json':'results.json';
fs.writeFileSync(path.join(__dirname,outputFile),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({version:report.version,phase:report.phase,data:report.data,sweep:report.sweep,
  assets:report.assets,drawing:report.drawing,overlay:report.overlay},null,2));
