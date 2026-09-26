/** Serial public-UI verification. Synthetic weather is always reported separately from live observations. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:5177';
const session = process.env.VANTA_QA_SESSION ?? 'vanta-weather-qa';
const resume = process.env.VANTA_WEATHER_QA_CONTINUE === '1';
const forceFetch = process.env.VANTA_WEATHER_FORCE_FETCH === '1';
const outputDirectory = process.env.VANTA_QA_OUTPUT_DIR ?? resolve('../../work/weather/browser');
const manifest = JSON.parse(readFileSync(new URL('../src/house-manifest.json', import.meta.url), 'utf8'));
const poles = manifest.devices.filter((device) => device.model === 'solar-streetlight');
const apiPattern = '**/api.open-meteo.com/v1/forecast**';
const cacheKey = 'vantahome-weather-v1:18.4538:-78.01534:America/Jamaica';
const stateExpression = "JSON.parse(localStorage.getItem('vantahome-simulation-v2'))?.state";
const assertions = [], screenshots = [], scenarios = [], limitations = [], retries = [];
let originalStorage = null, assets = null, routeSupported = forceFetch ? false : null, fixtureTransport = null;
let collectingEvidence = false, phase = 'live', expectedNetworkFailure = false;

/** Invoke a single isolated foreground browser; never replay a failed mutation. */
function browser(...args) {
  const options = { encoding: 'utf8', timeout: collectingEvidence ? 5000 : 30_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '12000' } };
  let raw;
  try { raw = execFileSync('agent-browser', ['--session', session, '--json', ...args], options); }
  catch (error) {
    if (collectingEvidence || args[0] !== 'eval' || !args[1].startsWith('new Promise') || error.code !== 'ETIMEDOUT') throw error;
    retries.push({ expression: args[1], reason: error.code });
    raw = execFileSync('agent-browser', ['--session', session, '--json', ...args], options);
  }
  const response = JSON.parse(raw);
  assert.equal(response.success, true, response.error ?? args.join(' '));
  return response.data;
}

/** Read browser-visible DOM, browser API state, or versioned public persistence. */
function evaluate(expression) { return browser('eval', expression).result; }

/** Poll an observable product condition with a bounded deadline. */
function waitFor(expression, timeout = 15_000) {
  assert.equal(evaluate(`new Promise((resolve,reject) => {
    const start = performance.now();
    function poll() { try {
      if (${expression}) return resolve(true);
      if (performance.now()-start > ${timeout}) return reject(new Error('Timed out: '+${JSON.stringify(expression)}));
      setTimeout(poll,40);
    } catch(error) { reject(error); } }
    poll();
  })`), true);
}

/** Give every result a stable label and mark whether external data was synthetic. */
function check(condition, description) {
  assertions.push({ phase, description, passed: Boolean(condition) });
  assert.ok(condition, description);
}

/** Wait for the actual canvas and projected controls rather than assuming asset timing. */
function ready() {
  waitFor('!document.hidden && !document.querySelector(".scene-loading") && document.querySelector("#house-preview canvas")?.checkVisibility() && document.querySelectorAll("[data-device-hotspot]").length > 0');
}

/** Dismiss only the visible dialog or quick controls before opening another UI surface. */
function dismiss() {
  if (evaluate('!!document.querySelector("dialog:modal")')) browser('press', 'Escape');
  if (evaluate('!!document.querySelector("#quick-device-controls")')) browser('click', '[aria-label="Close quick controls"]');
  waitFor('!document.querySelector("dialog:modal") && !document.querySelector("#quick-device-controls")');
}

/** Open the shared settings surface and its environment page using real controls. */
function openEnvironment() {
  if (evaluate('!!document.querySelector(".environment-panel")')) return;
  dismiss();
  browser('click', '[aria-label="Home settings and help"]');
  browser('wait', '#dashboard-library[open]');
  browser('click', '#dashboard-library .dashboard-preference:last-of-type');
  browser('wait', '.environment-panel');
}

/** Open room or device browsing in either the landscape inspector or portrait dock. */
function openLibrary(view) {
  dismiss();
  const landscape = evaluate('document.querySelector(".device-viewport")?.dataset.layout === "tablet-landscape"');
  browser('click', view === 'rooms' ? (landscape ? '.dashboard-browse' : '.dashboard-dock button:first-child') : (landscape ? '.dashboard-browse-devices' : '.dashboard-dock button:last-child'));
  browser('wait', '#dashboard-library[open]');
}

/** Keep model and weather controls reachable without any document scrolling. */
function pageFits(label) {
  const layout = evaluate(`(() => ({width:innerWidth,height:innerHeight,
    overflowX:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
    overflowY:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)-innerHeight,
    scrollX,scrollY,layout:document.querySelector('.device-viewport')?.dataset.layout,
    controls:[...document.querySelectorAll('.light-mode-switch button, .environment-modes button, [aria-label="Close home browser"]')].filter(e=>e.checkVisibility()).map(e=>{
      const r=e.getBoundingClientRect();const target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {label:e.getAttribute('aria-label')||e.textContent.trim(),height:r.height,fits:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,reachable:e.disabled||e.contains(target)};
    })}))()`);
  check(layout.overflowX <= 1 && layout.overflowY <= 1 && Math.abs(layout.scrollX) <= 1 && Math.abs(layout.scrollY) <= 1, `${label}: no page scroll or overflow`);
  const modal = evaluate('!!document.querySelector("dialog:modal")');
  const relevant = modal ? layout.controls.filter((control) => !['Automatic local daylight', 'Daylight preview', 'Night lighting preview'].includes(control.label)) : layout.controls;
  check(relevant.length > 0 && relevant.every((control) => control.fits && control.height >= 44 && control.reachable), `${label}: environment actions fit and have reachable touch targets`);
  return layout;
}

/** Save viewport evidence after render frames, without touching React or Three internals. */
function screenshot(name) {
  evaluate('new Promise(resolve=>{let frames=0;function next(){if(++frames>=18)resolve(true);else requestAnimationFrame(next);}requestAnimationFrame(next);})');
  mkdirSync(outputDirectory, { recursive: true });
  const path = resolve(outputDirectory, `${name}.png`);
  browser('screenshot', path);
  screenshots.push({ name, phase, path });
}

/** Capture only public evidence so the resulting report can be independently reviewed. */
function snapshot() {
  return evaluate(`({state:${stateExpression},status:document.querySelector('.environment-status')?.textContent??null,
    measurements:document.querySelector('.environment-measurements')?.textContent??null,
    brand:document.querySelector('.dashboard-brand')?.textContent??null,
    cache:JSON.parse(localStorage.getItem(${JSON.stringify(cacheKey)})||'null'),
    hotspots:[...document.querySelectorAll('[data-device-hotspot]')].map(e=>({id:e.dataset.deviceHotspot,label:e.getAttribute('aria-label')})),
    layout:document.querySelector('.device-viewport')?.dataset.layout,
    canvasVisible:document.querySelector('#house-preview canvas')?.checkVisibility()??false})`);
}

/** Select grounds through searchable room navigation and frame the full property. */
function showProperty() {
  const grounds = manifest.rooms.find((room) => room.id === 'grounds');
  openLibrary('rooms');
  browser('fill', '#room-search', grounds.name);
  browser('click', '[data-library-room="grounds"]');
  waitFor(`${stateExpression}?.roomId === 'grounds' && !document.querySelector('dialog:modal')`);
  if (evaluate(`${stateExpression}?.view`) !== 'exterior') browser('click', '.view-controls button:nth-child(1)');
  waitFor(`${stateExpression}?.view === 'exterior'`);
  ready();
}

/** Check all four devices agree with the mode shown in the actual header controls. */
function checkPoles(on, description) {
  waitFor(`${JSON.stringify(poles.map((pole) => pole.id))}.every(id=>${stateExpression}?.deviceStates[id]?.on===${on})`);
  check(poles.length === 4, 'exactly four corner solar streetlights are cataloged');
  check(poles.every((pole) => snapshot().state.deviceStates[pole.id].on === on), description);
}

/** Verify every new light through its own touch target, full sheet and power switch. */
function verifyPoleControls() {
  for (const pole of poles) {
    const target = `[data-device-hotspot="${pole.id}"]`;
    browser('wait', target);
    waitFor(`(() => {const e=document.querySelector(${JSON.stringify(target)});const r=e.getBoundingClientRect();return e.checkVisibility()&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('[data-device-hotspot]')===e;})()`);
    check(true, `${pole.name}: hotspot visible with unobstructed tap center`);
    browser('click', target);
    waitFor(`${stateExpression}?.selectedDevice === ${JSON.stringify(pole.id)}`);
    browser('click', '.dashboard-full-controls');
    browser('wait', '#full-device-controls[open]');
    check(evaluate('document.querySelector("#sheet-device-control-title")?.textContent') === pole.name, `${pole.name}: correct full controls open`);
    const before = snapshot().state.deviceStates[pole.id].on;
    browser('click', `#full-device-controls [aria-label="${pole.name} power"]`);
    waitFor(`${stateExpression}?.deviceStates[${JSON.stringify(pole.id)}]?.on === ${!before}`);
    check(true, `${pole.name}: individual power control responds`);
    dismiss();
  }
}

/** Verify irrigation via public inventory controls, leaving an operating scene for visual review. */
function startIrrigation() {
  openLibrary('devices');
  browser('fill', '#device-search', 'East lawn irrigation');
  browser('click', '[data-library-device="grounds-sprinkler"]');
  browser('wait', '#full-device-controls[open]');
  if (!snapshot().state.deviceStates['grounds-sprinkler'].on) browser('click', '#full-device-controls [aria-label="East lawn irrigation power"]');
  waitFor(`${stateExpression}?.deviceStates['grounds-sprinkler']?.on === true`);
  check(true, 'irrigation switches on through full device controls');
  dismiss();
  screenshot('weather-irrigation-running');
}

/** Construct documented API responses using this run's timestamp; these are QA conditions, never observations. */
function weatherFixture(code, lighting = 'day') {
  const now = Math.floor(Date.now() / 1000);
  const rain = [61, 63, 65].includes(code) ? 2.4 : 0;
  const snow = code === 73 ? 0.4 : 0;
  return {
    timezone: 'America/Jamaica',
    current_units: { time: 'unixtime', temperature_2m: '°C', precipitation: 'mm', rain: 'mm', showers: 'mm', snowfall: 'cm', cloud_cover: '%', wind_speed_10m: 'km/h', wind_direction_10m: '°' },
    current: { time: now, interval: 900, temperature_2m: snow ? 1 : 28, precipitation: rain + snow, rain, showers: 0, snowfall: snow, cloud_cover: code === 0 ? 10 : 95, wind_speed_10m: 18, wind_direction_10m: 75, weather_code: code },
    daily: { time: [now], sunrise: [now - 7200], sunset: [lighting === 'night' ? now - 60 : now + 7200] },
  };
}

/** Install an API-only test boundary; unsupported native routing is disclosed and never silently ignored. */
function setResponse(body, abort = false) {
  if (routeSupported !== false) {
    try {
      if (routeSupported) browser('network', 'unroute', apiPattern);
      browser('network', 'route', apiPattern, ...(abort ? ['--abort'] : ['--body', JSON.stringify(body)]));
      routeSupported = true;
      if (!abort) {
        const probe = evaluate(`fetch('https://api.open-meteo.com/v1/forecast?weatherQaProbe=1').then(async response=>({ok:response.ok,body:await response.text()})).catch(error=>({error:error.message}))`);
        if (!probe.ok || probe.body !== JSON.stringify(body)) throw new Error(`Mock route failed browser response probe: ${JSON.stringify(probe)}`);
      }
      fixtureTransport = 'agent-browser network route'; return;
    } catch (error) {
      try { browser('network', 'unroute', apiPattern); } catch { /* The scoped fetch fallback replaces only the weather endpoint. */ }
      routeSupported = false;
      limitations.push(`Native request routing unavailable: ${error.message}. Refresh tests use an isolated fetch boundary; cold-start cache reload/unavailable checks are omitted.`);
    }
  }
  fixtureTransport = 'isolated fetch-boundary fallback';
  evaluate(`(() => {
    window.__vantaWeatherQaOriginalFetch ??= window.fetch;
    const original=window.__vantaWeatherQaOriginalFetch;
    window.fetch=function(input,init) {
      const address=typeof input==='string'?input:input instanceof URL?input.href:input.url;
      if(address.startsWith('https://api.open-meteo.com/v1/forecast')) {
        ${abort ? "return Promise.reject(new TypeError('QA simulated offline weather request'));" : `return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(body))},{status:200,headers:{'Content-Type':'application/json'}}));`}
      }
      return original.call(this,input,init);
    };return true;
  })()`);
}

/** Refresh a fixture through the application's own refresh control and validate its visible description. */
function fixtureScenario(name, code, description, lighting = 'day') {
  phase = `synthetic:${name}`; console.log(`Checking ${phase}`);
  const fixture = weatherFixture(code, lighting);
  setResponse(fixture);
  openEnvironment();
  waitFor(`!document.querySelector('[aria-label="Refresh live weather"]').disabled`);
  browser('click', '[aria-label="Refresh live weather"]');
  waitFor(`document.querySelector('.environment-status')?.textContent.includes(${JSON.stringify(description)}) && JSON.parse(localStorage.getItem(${JSON.stringify(cacheKey)}))?.weatherCode === ${code} && JSON.parse(localStorage.getItem(${JSON.stringify(cacheKey)}))?.daylightDays[0]?.sunset === ${fixture.daily.sunset[0] * 1000}`);
  check(evaluate('document.querySelector(".environment-status")?.textContent.startsWith("Live weather")'), `${name}: successful synthetic response accepted and described`);
  check(evaluate('document.querySelector(".environment-location")?.textContent.includes("Hopewell, Jamaica")'), `${name}: property location stays explicit`);
  scenarios.push({ name, source: 'Synthetic QA API response, not current weather', fixtureTransport, fixture, evidence: snapshot() });
  screenshot(`weather-fixture-${name}-status`);
  dismiss();
  screenshot(`weather-fixture-${name}-scene`);
}

/** Exercise responsive outdoor and weather views without building a large duplicate matrix. */
function responsiveChecks() {
  phase = 'responsive';
  for (const [width, height, layout] of [[1920,1080,'tablet-landscape'], [834,1194,'tablet-portrait'], [390,844,'mobile-portrait'], [320,568,'mobile-portrait']]) {
    browser('set', 'viewport', String(width), String(height));
    waitFor(`document.querySelector('.device-viewport')?.dataset.layout === ${JSON.stringify(layout)}`);
    ready();
    pageFits(`${width}×${height} scene`);
    screenshot(`weather-scene-${width}x${height}`);
    openEnvironment();
    pageFits(`${width}×${height} time and weather`);
    screenshot(`weather-panel-${width}x${height}`);
    dismiss();
  }
}

/** Toggle the actual user preference and verify persisted and visible reduced-motion state. */
function reducedMotionCheck() {
  phase = 'reduced-motion';
  browser('click', '[aria-label="Home settings and help"]');
  browser('wait', '#dashboard-library[open]');
  const disabled = evaluate('document.querySelector(".dashboard-preference[aria-pressed]").disabled');
  if (!disabled && !snapshot().state.motionDisabled) browser('click', '.dashboard-preference[aria-pressed]');
  check(evaluate('document.querySelector(".dashboard-preference[aria-pressed]").getAttribute("aria-pressed") === "true" && document.querySelector(".app-shell").classList.contains("reduce-motion")'), 'motion preference is active and visibly reflected');
  dismiss();
  screenshot('weather-reduced-motion-scene');
  if (disabled) limitations.push('System reduced-motion was already active; enabling motion could not be exercised through the disabled user toggle.');
}

/** Simulate errors after good data, preserving honest saved-weather status and a usable daylight clock. */
function failureChecks() {
  phase = 'synthetic:offline'; expectedNetworkFailure = true;
  setResponse(null, true);
  openEnvironment();
  browser('click', '[aria-label="Refresh live weather"]');
  waitFor('document.querySelector(".environment-status")?.textContent.startsWith("Saved weather")');
  check(snapshot().cache !== null, 'failed weather refresh retains the last validated persisted conditions');
  check(evaluate('document.querySelector(".environment-footer")?.textContent.includes("keeps working offline")'), 'offline status explicitly preserves the local daylight clock');
  scenarios.push({ name: 'offline-with-last-good-weather', source: 'Synthetic request failure', fixtureTransport, evidence: snapshot() });
  screenshot('weather-offline-cached');

  phase = 'synthetic:invalid-response';
  setResponse({ timezone:'America/Jamaica', current:{temperature_2m:999,weather_code:42} });
  const cachedBefore = JSON.stringify(snapshot().cache);
  browser('click', '[aria-label="Refresh live weather"]');
  waitFor('document.querySelector(".environment-status")?.textContent.startsWith("Saved weather")');
  check(JSON.stringify(snapshot().cache) === cachedBefore, 'invalid API data cannot replace validated cached conditions');
  if (routeSupported) {
    evaluate(`localStorage.removeItem(${JSON.stringify(cacheKey)});true`);
    browser('reload'); ready(); openEnvironment();
    waitFor('document.querySelector(".environment-status")?.textContent === "Weather unavailable"');
    check(snapshot().cache === null && !evaluate('!!document.querySelector(".environment-measurements")'), 'unavailable weather shows no invented temperature, rain or wind');
    scenarios.push({ name:'invalid-response-without-cache', source:'Synthetic malformed response after clearing weather cache', fixtureTransport, evidence:snapshot() });
    screenshot('weather-unavailable');
  }
}

/** Preserve useful diagnostics on failure and explicitly separate expected injected network errors. */
function report(status, error) {
  mkdirSync(outputDirectory, { recursive:true });
  let current=null, errors=null, messages=null;
  try { current=snapshot(); } catch { /* A page crash is retained by the main error field. */ }
  try { errors=browser('errors').errors;messages=browser('console').messages; } catch { /* Evidence gathering is bounded even if the browser becomes unavailable. */ }
  writeFileSync(resolve(outputDirectory,'weather-verification.json'),JSON.stringify({status,url,assets,phase,checks:assertions.filter(item=>item.passed).length,assertions,scenarios,screenshots,limitations,retries,fixtureTransport,expectedNetworkFailure,error:error?.message,snapshot:current,errors,consoleMessages:messages},null,2));
}

/** Remove all test network behavior and restore the isolated session's original application preferences. */
function cleanup() {
  try { if(routeSupported) browser('network','unroute',apiPattern); } catch (error) { limitations.push(`Route cleanup: ${error.message}`); }
  try {
    evaluate(`(() => {
      if(window.__vantaWeatherQaOriginalFetch){window.fetch=window.__vantaWeatherQaOriginalFetch;delete window.__vantaWeatherQaOriginalFetch;}
      const original=${JSON.stringify(originalStorage)};
      if(original){for(const key of Object.keys(localStorage).filter(k=>k.startsWith('vantahome-')))localStorage.removeItem(key);for(const [key,value]of Object.entries(original))localStorage.setItem(key,value);}
      return true;
    })()`);
  } catch (error) { limitations.push(`Storage cleanup: ${error.message}`); }
  try { browser('close'); } catch (error) { console.error('Weather browser cleanup failed:',error.message);process.exitCode=1; }
}

try {
  browser('open','about:blank'); browser('set','viewport','1024','768'); browser('open',url);
  const tabId=browser('tab','list').tabs.find(tab=>tab.active)?.tabId;
  assert.ok(tabId,'Isolated QA tab exists');browser('tab',tabId);ready();
  originalStorage=evaluate("Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('vantahome-')).map(k=>[k,localStorage.getItem(k)]))");
  assets=evaluate('({scripts:[...document.scripts].map(s=>s.src).filter(Boolean),stylesheets:[...document.querySelectorAll("link[rel=stylesheet]")].map(l=>l.href)})');
  openEnvironment();
  waitFor(`!document.querySelector('[aria-label="Refresh live weather"]').disabled`);
  browser('click','[aria-label="Refresh live weather"]');
  waitFor('document.querySelector(".environment-status")?.textContent.startsWith("Live weather")',20_000);
  check(snapshot().cache?.fetchedAt > Date.now()-60_000,'actual unmocked API request returned fresh validated data');
  check(evaluate('document.querySelector(".environment-footer a")?.href')==='https://open-meteo.com/','live model-weather attribution is visible');
  originalStorage[cacheKey] = JSON.stringify(snapshot().cache);
  scenarios.push({name:'actual-live-weather',source:'Unmocked Open-Meteo response',evidence:snapshot()});
  screenshot('weather-actual-live-status');dismiss();showProperty();
  if (!resume) {
  phase='controls';
  browser('click','[aria-label="Night lighting preview"]');checkPoles(true,'night preview automatically enables all four streetlights');screenshot('weather-four-streetlights-night');
  verifyPoleControls();
  browser('click','[aria-label="Daylight preview"]');checkPoles(false,'day preview automatically disables all four streetlights');screenshot('weather-four-streetlights-day');
  startIrrigation();
  check(browser('errors').errors.length===0,'live weather and light/irrigation controls produce no uncaught page errors');
  check(browser('console').messages.filter(m=>m.type==='error'||m.level==='error').length===0,'live weather and device controls produce no console errors');
  } else {
    limitations.push('Repeated four-light controls were omitted on this focused resumed run; earlier build verification is retained separately.');
    startIrrigation();
  }
  if(forceFetch) limitations.push('Native network interception produced an unusable browser response in the prior run; synthetic refresh scenarios use a scoped standard-fetch boundary. Cold-start cache reload/unavailable checks remain unverified in the browser.');
  fixtureScenario('rain',63,'Rain');
  fixtureScenario('fog',45,'Fog');
  fixtureScenario('snow',73,'Snow');
  fixtureScenario('auto-day',0,'Clear sky');
  browser('click','[aria-label="Automatic local daylight"]');checkPoles(false,'automatic mode follows the synthetic daytime sunrise/sunset schedule');
  fixtureScenario('auto-night',0,'Clear sky','night');
  checkPoles(true,'automatic mode follows a synthetic sunset transition without pressing the night control');
  check(evaluate(`document.querySelector('[aria-label="Automatic local daylight"]').getAttribute('aria-pressed')`)==='true','clock automation remains selected during the synthetic sunset transition');
  fixtureScenario('mobile-rain',63,'Rain');responsiveChecks();reducedMotionCheck();
  check(browser('errors').errors.length===0,'all visual weather scenarios produce no uncaught page errors');
  check(browser('console').messages.filter(m=>m.type==='error'||m.level==='error').length===0,'rain, fog, snow and wind compile without console/shader errors');
  failureChecks();
  check(browser('errors').errors.length===0,'offline and malformed-response handling produces no uncaught page errors');
  report(limitations.length?'passed-with-limitations':'passed');
  console.log(`PASS ${assertions.length} weather checks; ${limitations.length} disclosed limitations.`);
} catch(error) {
  collectingEvidence=true;report('failed',error);throw error;
} finally { cleanup(); }
