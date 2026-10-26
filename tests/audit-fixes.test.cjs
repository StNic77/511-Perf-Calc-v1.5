const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const loadApp = require('./support/load-app.cjs');

test('pulling heavier conditions refreshes chart HOGE and removes a false SAFE verdict',()=>{
  const {run,elements}=loadApp();
  run(`STORE.currentTab='sarcb'; Object.assign(STORE.sarCheck,
    {pa:0,oat:15,auw:12000,wind:0,hogeValue:null,hogeSource:'pilot'}); deriveHOGEFromChart();`);
  assert.match(elements.get('sarcbHogeBody').textContent,/SAFE OEI/);
  run(`SESSION.hover={pa:0,oat:15,auw:14000,wind:0,time:new Date()}; pullHoverToSar();`);
  assert.equal(run('STORE.sarCheck.hogeValue'),97.6);
  assert.match(elements.get('sarcbHogeBody').textContent,/NOT SAFE OEI/);
  assert.doesNotMatch(elements.get('sarcbHogeBody').textContent,/79%Q/);
});

test('failed/incomplete chart refresh clears HOGE, verdict and brief and recovers later',()=>{
  const {run,elements}=loadApp();
  run(`STORE.currentTab='sarcb'; Object.assign(STORE.sarCheck,
    {pa:0,oat:15,auw:12000,wind:0,hogeSource:'chart'}); renderSARCheckHOGE();
    STORE.sarCheck.auw=20000; deriveHOGEFromChart();`);
  assert.equal(run('STORE.sarCheck.hogeValue'),null);
  assert.equal(elements.get('sarcbHogeInput').value,'');
  assert.doesNotMatch(elements.get('sarcbHogeBody').textContent,/SAFE OEI/);
  assert.equal(elements.get('sarcbBriefCard').hidden,true);
  assert.match(elements.get('sarcbHogeSourceLabel').textContent,/Chart error/);
  run('STORE.sarCheck.auw=12000; STORE.sarCheck.oat=null; deriveHOGEFromChart();');
  assert.equal(run('STORE.sarCheck.hogeValue'),null);
  assert.match(elements.get('sarcbHogeSourceLabel').textContent,/Enter all conditions/);
  run('STORE.sarCheck.oat=15; deriveHOGEFromChart();');
  assert.equal(run('STORE.sarCheck.hogeValue'),79.1);
});

test('anti-ice refresh works across tabs; pilot-entered HOGE stays independent',()=>{
  const {run}=loadApp();
  run(`STORE.currentTab='sarcb'; Object.assign(STORE.sarCheck,
    {pa:0,oat:15,auw:12000,wind:0,hogeSource:'chart'}); renderSARCheckHOGE();
    STORE.currentTab='climb'; setAntiIce('ON');`);
  assert.equal(run('STORE.sarCheck.hogeValue'),81.5);
  run(`STORE.sarCheck.hogeValue=75; STORE.sarCheck.hogeSource='pilot'; setAntiIce('OFF');`);
  assert.equal(run('STORE.sarCheck.hogeValue'),75);
});

test('hover cold endpoints retain measured mass, apply TM, and never create unrestricted results',()=>{
  const {run}=loadApp();
  for(const antiIce of ['ON','OFF']) for(const rating of ['maxCont','thirtyMin']) {
    const result=run(`getMaxMassToHover({pa:10000,oat:-45,wind:0,tm:0,antiIce:'${antiIce}',rating:'${rating}'})`);
    assert.equal(result.ok,true);
    assert.equal(result.unrestricted,false);
    assert.ok(result.finalMass<14500);
    const reserve=run(`getMaxMassToHover({pa:10000,oat:-45,wind:0,tm:5,antiIce:'${antiIce}',rating:'${rating}'})`);
    assert.ok(reserve.finalMass<result.finalMass);
  }
  for(const [pa,oat] of [[-1001,35],[10001,0],[0,41],[10000,-50]]) {
    const r=run(`getMaxMassToHover({pa:${pa},oat:${oat},antiIce:'ON'})`);
    assert.equal(r.reason,'hover_outside_chart');
  }
});

test('hover failure display makes no unsupported zero-capability claim',()=>{
  const {run,elements}=loadApp();
  run(`STORE.currentTab='hover'; Object.assign(STORE.hover,{pa:-1001,oat:35}); renderHover();`);
  const text=elements.get('hovResultBody').textContent;
  assert.match(text,/Outside hover chart coverage/);
  assert.doesNotMatch(text,/No hover capability|No hover mass restriction/);
});

test('printed HOGE wind endpoints work; real partial-curve and wind limits stay enforced',()=>{
  const {run}=loadApp();
  for(const antiIce of ['ON','OFF']) for(const wind of [0,30]) {
    assert.equal(run(`getHOGE({pa:0,oat:15,auw:15600,wind:${wind},antiIce:'${antiIce}'}).ok`),true);
  }
  assert.equal(run(`getHOGE({pa:0,oat:15,auw:12000,wind:30,antiIce:'ON'}).ok`),true);
  assert.equal(run(`lookupHogeLower(AC.perf.hoge.aiOff,125,0)`),null);
  for(const wind of [-0.1,30.1]) assert.equal(run(`getHOGE({pa:0,oat:15,auw:12000,wind:${wind},antiIce:'ON'}).ok`),false);
});

test('transfer/climb reject unsupported PA and OAT instead of silently reusing endpoints',()=>{
  const {run}=loadApp();
  for(const antiIce of ['ON','OFF']) {
    assert.equal(run(`getTransferValue(10000,20,'${antiIce}').ok`),true);
    assert.equal(run(`getTransferValue(10000,40,'${antiIce}').ok`),false);
    assert.equal(run(`getTransferValue(12000,20,'${antiIce}').reason`),'pa_outside_chart');
    assert.equal(run(`getTransferValue(0,-60,'${antiIce}').ok`),false);
  }
  assert.equal(run(`_climbLookup('aeo_30min_ai_on',12000,0,13000).reason`),'pa_outside_chart');
  assert.equal(run(`_climbLookup('aeo_30min_ai_on',10000,20,10000).reason`),'climb_correction_outside_chart');
});

test('HLDF differentiates zero-side coverage from loss exceeding 400 ft',()=>{
  const {run}=loadApp();
  const low=run(`getHeightLoss({pa:-1000,oat:-30,auw:12500,wind:0,antiIce:'ON'})`);
  assert.equal(low.ok,false);
  assert.equal(low.reason,'hl_outside_chart');
  assert.equal(low.anyHeight,undefined);
  const wind=run(`getHeightLoss({pa:-1000,oat:-10,auw:15600,wind:30,antiIce:'OFF'})`);
  assert.equal(wind.ok,true);
  assert.equal(wind.anyHeight,undefined);
  assert.ok(wind.hlFt>=0 && wind.hlFt<400);
  // Physically adverse right-side exit remains explicitly beyond 400.
  run(`AC.perf.transferValue.aiOff={curve:[{x:-10000,y:1},{x:20000,y:1}]};`);
  const high=run(`getHeightLoss({pa:0,oat:15,auw:15600,wind:0,antiIce:'OFF'})`);
  assert.equal(high.anyHeight,true);
});

test('Power Assurance checks the lower-panel intersection before giving a TIT/pass',()=>{
  const {run}=loadApp();
  for(const engineNum of [1,2,3]) {
    const r=run(`computeEnginePA({pa:0,oat:-45,eng_tq:51,eng_tit:540,engineNum:${engineNum},onGround:false})`);
    assert.equal(r.ok,false);
    assert.equal(r.reason,'pa_lower_outside_curve');
    const normal=run(`computeEnginePA({pa:0,oat:15,eng_tq:65,eng_tit:700,engineNum:${engineNum},onGround:false})`);
    assert.equal(normal.ok,true);
    assert.equal(normal.pass,true);
  }
});

test('copied special results and corrected mass-overlay alignment',()=>{
  const {run}=loadApp();
  const text=run(`buildSARCheckBrief(false,14000,{oei:100,aeoEquiv:66},80,null,null,true,true)`);
  assert.match(text,/HT LOSS EXCEEDS 400 ft \/ ANY HEIGHT$/);
  assert.ok(Math.abs(run(`_climbMass2py(14000,CLIMB_TRACE_CAL.aeo_30min_ai_on,2200)`)-1557)<1);
  assert.equal(run(`_climbLookup('aeo_30min_ai_on',10000,-1,14000).finalRoc`),498);
});

test('fuel log and endurance calculations still render with actual burn',()=>{
  const {run,elements}=loadApp();
  run('STORE.fuel.readings=[{kg:2000,ts:0},{kg:1000,ts:3600000}]; renderFuel();');
  assert.equal(elements.get('fuelStateCard').hidden,false);
  assert.match(elements.get('fuelStateBody').textContent,/1000 kg\/hr/);
  assert.match(elements.get('fuelStateBody').textContent,/0h 45m/);
  assert.match(elements.get('fuelStateBody').textContent,/1h 00m/);
  assert.match(elements.get('fuelLogBody').textContent,/Fuel/);
});

test('fuel time displays roll over the hour correctly',()=>{
  const {run}=loadApp();
  assert.equal(run('fmtHrsMin(59.5)'),'1h 00m');
  assert.equal(run('fmtHrsMin(119.5)'),'2h 00m');
});

test('every chart image is precached; release versions agree and chart data is intact',()=>{
  const {run,root}=loadApp();
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const paths=[];
  function walk(v) {
    if(typeof v==='string' && v.startsWith('images/')) paths.push(v);
    else if(v && typeof v==='object') Object.values(v).forEach(walk);
  }
  walk(run('AC.chartImages'));
  for(const image of paths) { assert.ok(fs.existsSync(path.join(root,image))); assert.ok(sw.includes(`'./${image}'`),image); }
  const version=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')).version;
  assert.equal(run('AC.version'),version);
  assert.equal(version,'1.7.7');
  assert.ok(sw.includes(`'v${version}'`));
  assert.equal(run('AC.perf.aiOnPenaltyPct'),15);
  run('initSplash()');
});

test('change note starts with the bold version once, a plain hyphen and the change date',()=>{
  const {run,elements,root}=loadApp();
  run('initSplash()');
  assert.equal(elements.get('splashWhatsNewVersion').textContent,'v1.7.7 ');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const note=html.slice(html.indexOf('<div class="splash__whatsnew">'),html.indexOf('</div>',html.indexOf('<div class="splash__whatsnew">')));
  assert.match(note,/id="splashWhatsNewVersion"><\/span>- 26 October 2026/);
  assert.doesNotMatch(note,/v1\.7\.7:/);
});
