/** Exercise quick/full parity and responsive camera controls through public browser interactions. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:5177/';
const session = 'vanta-control-polish-qa';
const { devices } = JSON.parse(readFileSync(new URL('../src/house-manifest.json', import.meta.url), 'utf8'));

/** Keep QA in a separate browser without touching the owner's saved preview. */
function browser(...args) {
  const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], {
    encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
  }));
  assert.equal(result.success, true, result.error ?? args.join(' '));
  return result.data;
}

/** Observe rendered UI and its layout, never import internal app stores. */
function evaluate(expression) { return browser('eval', expression).result; }

/** Re-select the QA tab after navigation; hidden tabs intentionally suspend scene rendering. */
function activateTab() {
  const tab = browser('tab', 'list').tabs.find((candidate) => candidate.active);
  assert.ok(tab?.tabId, 'The isolated QA tab exists');
  browser('tab', tab.tabId);
}

/** Wait for the UI or responsive layout to settle without assuming rendering speed. */
function waitFor(expression) {
  assert.equal(evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 45000;
    function check() {
      if (${expression}) return resolve(true);
      if (performance.now() > deadline) return reject(new Error('UI did not settle'));
      setTimeout(check, 40);
    }
    check();
  })`), true);
}

/** Select an actual catalog fixture through the searchable device collection. */
function selectDevice(id, landscape) {
  const device = devices.find((item) => item.id === id);
  browser('click', landscape ? '.dashboard-browse-devices' : '.dashboard-dock button:last-child');
  browser('wait', '#device-search');
  browser('fill', '#device-search', device.name);
  for (let page = 0; page < 30; page++) {
    if (evaluate(`!!document.querySelector('[data-library-device="${id}"]')`)) break;
    assert.equal(evaluate('document.querySelector("[aria-label=\"Next results page\"]").disabled'), false);
    browser('click', '[aria-label="Next results page"]');
  }
  browser('click', `[data-library-device="${id}"]`);
  browser('wait', '#full-device-controls[open]');
  browser('press', 'Escape');
  waitFor(`!!document.querySelector('[data-device-hotspot="${id}"]') && !document.querySelector('#full-device-controls')`);
}

/** Require the control's center to be visibly clickable, with no page-level scrolling. */
function verifyReachable(selector) {
  const result = evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { hit: element.contains(hit), width: rect.width, height: rect.height,
      overflow: document.documentElement.scrollHeight - innerHeight,
      bottom: rect.bottom, right: rect.right, viewportHeight: innerHeight, viewportWidth: innerWidth };
  })()`);
  assert.ok(result.hit && result.width >= 44 && result.height >= 44, `${selector}: reachable touch target`);
  assert.ok(result.overflow <= 1 && result.bottom <= result.viewportHeight + 1 && result.right <= result.viewportWidth + 1, `${selector}: fits the viewport`);
}

try {
  browser('open', 'about:blank');
  browser('set', 'viewport', '390', '844');
  browser('set', 'media', 'light', 'reduced-motion');
  browser('open', url);
  activateTab();
  waitFor('document.querySelector("#house-preview")?.dataset.sceneReady === "true"');
  browser('click', '[data-device-hotspot="living-light"]');
  verifyReachable('#quick-level-living-light');
  if (evaluate('document.querySelector(".quick-device-toggle").getAttribute("aria-checked") === "true"')) browser('click', '.quick-device-toggle');
  browser('focus', '#quick-level-living-light');
  browser('press', 'Home');
  browser('press', 'ArrowRight');
  assert.equal(evaluate('document.querySelector("#quick-level-living-light").value'), '1');
  assert.equal(evaluate('document.querySelector(".quick-device-toggle").getAttribute("aria-checked")'), 'false');
  assert.equal(evaluate('document.querySelector(".quick-level-hint").textContent'), 'Value kept while off');
  browser('click', '.quick-device-full');
  assert.equal(evaluate('document.querySelector("#sheet-level-living-light").value'), '1', 'Full controls share quick brightness');
  browser('press', 'Escape');
  browser('reload');
  activateTab();
  waitFor('document.querySelector("#house-preview")?.dataset.sceneReady === "true"');
  browser('click', '[data-device-hotspot="living-light"]');
  assert.equal(evaluate('document.querySelector("#quick-level-living-light").value'), '1', 'Quick brightness survives reload');
  browser('press', 'Escape');

  for (const [width, height] of [[320, 562], [390, 844], [834, 1194], [1194, 834], [960, 600]]) {
    browser('set', 'viewport', String(width), String(height));
    waitFor(`innerWidth === ${width} && document.querySelector('#house-preview')?.dataset.sceneReady === 'true'`);
    assert.equal(evaluate('!!document.querySelector(".reset-view-control, .cinematic-view-control")'), false, 'Presentation starts automatically without dashboard buttons');
    browser('click', '[data-device-hotspot="living-light"]');
    const landscape = width > height;
    assert.equal(evaluate('!!document.querySelector("#quick-device-controls")'), !landscape, 'Tablet inspector avoids a duplicate popup');
    if (!landscape) {
      verifyReachable('.quick-device-full');
      verifyReachable('.quick-device-toggle');
      if (height > 640) verifyReachable('#quick-level-living-light');
      browser('press', 'Escape');
    } else verifyReachable('.dashboard-full-controls');
    console.log(`PASS ${width}x${height}: quick actions and no duplicate inspector`);
  }

  browser('set', 'viewport', '1194', '834');
  selectDevice('master-bedside-left', true);
  verifyReachable('#dashboard-level-master-bedside-left');
  browser('focus', '#dashboard-level-master-bedside-left');
  browser('press', 'End');
  browser('click', '.dashboard-full-controls');
  assert.equal(evaluate('document.querySelector("#sheet-master-bedside-left-light-brightness").value'), '100', 'Additional fixtures share full-control settings');
  browser('press', 'Escape');
  selectDevice('bedroom-1-ac', true);
  verifyReachable('#dashboard-level-bedroom-1-ac');
  browser('focus', '#dashboard-level-bedroom-1-ac');
  browser('press', 'End');
  assert.equal(evaluate('document.querySelector("#dashboard-level-bedroom-1-ac").getAttribute("aria-valuetext")'), '28°C');
  assert.deepEqual(browser('errors').errors, []);
  console.log('PASS saved brightness, off-state semantics, repeated fixture controls, Celsius');
} catch (error) {
  browser('screenshot', '/tmp/vantahome-control-polish-failure.png');
  console.error(JSON.stringify({ errors: browser('errors'), scene: evaluate('({ hidden: document.hidden, loading: !!document.querySelector(".scene-loading"), fallback: document.querySelector(".scene-fallback")?.textContent })') }));
  throw error;
} finally {
  browser('close');
}
