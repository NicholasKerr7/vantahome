/** Verify full device controls through public DOM interactions, including short phone screens. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:5177';
const session = process.env.VANTA_QA_SESSION ?? 'vanta-full-controls-qa';
const { devices } = JSON.parse(readFileSync(new URL('../src/house-manifest.json', import.meta.url), 'utf8'));
// Cover ranges, enums, actions, readings and schedules without repeatedly loading every room model.
const representatives = ['living-light', 'laundry-washer', 'entry-gate', 'family-tv'].map((id) => {
  const device = devices.find((candidate) => candidate.id === id);
  assert.ok(device, `Missing representative device ${id}`);
  return device;
});
let inspectedPages = 0;

/** Keep verification isolated from the user's browser and fail on any CLI error. */
function browser(...args) {
  const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], {
    encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '12000' },
  }));
  assert.equal(result.success, true, result.error ?? args.join(' '));
  return result.data;
}

/** Read rendered public controls without importing application state into the browser. */
function evaluate(expression) { return browser('eval', expression).result; }

/** Wait for a public UI state instead of assuming a transition's duration. */
function waitFor(expression) {
  assert.equal(evaluate(`new Promise((resolve, reject) => {
    const start = performance.now();
    function poll() {
      if (${expression}) return resolve(true);
      if (performance.now() - start > 12000) return reject(new Error('UI state did not settle'));
      setTimeout(poll, 30);
    }
    poll();
  })`), true);
}

/** Only inspect public rendered geometry; this expression also runs between page clicks. */
const PAGE_MEASUREMENT = `(() => {
    const dialog = document.querySelector('#full-device-controls');
    const panel = dialog.querySelector('[role="tabpanel"]');
    const bounds = panel.getBoundingClientRect();
    const allTargets = [...dialog.querySelectorAll('button, input, select')].filter(e => e.checkVisibility());
    const failures = allTargets.flatMap(e => {
      const r = e.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const name = e.getAttribute('aria-label') || e.id || e.textContent.trim();
      const clipped = panel.contains(e) && (r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1);
      return r.height < 43.9 || r.width < 43.9 || r.left < -1 || r.right > innerWidth + 1
        || r.top < -1 || r.bottom > innerHeight + 1 || clipped || !e.contains(hit)
        ? [{ name, width: r.width, height: r.height, clipped, hit: hit?.tagName }] : [];
    });
    return { failures, modal: dialog.matches(':modal'), overflow: [
      dialog.scrollHeight - dialog.clientHeight, dialog.scrollWidth - dialog.clientWidth,
      panel.scrollHeight - panel.clientHeight, panel.scrollWidth - panel.clientWidth,
      document.documentElement.scrollHeight - innerHeight,
    ], reduced: getComputedStyle(dialog).animationName === 'none' && getComputedStyle(dialog).scrollBehavior === 'auto',
      count: panel.querySelector('.capability-controls')?.children.length ?? 0,
      compact: panel.classList.contains('is-compact'), short: innerHeight <= 680,
      last: dialog.querySelector('[aria-label="Next controls page"]').disabled,
      page: dialog.querySelector('.device-control-pagination p').textContent };
  })()`;

/** Check every target against its clipping panel, viewport and actual hit-testing. */
function verifyPage(label, result) {
  assert.equal(result.modal, true, `${label}: native modality`);
  assert.equal(result.reduced, true, `${label}: respects reduced motion`);
  assert.deepEqual(result.failures, [], `${label}: all controls remain reachable at 44px`);
  assert.ok(result.overflow.every((value) => value <= 1), `${label}: no scrolling or clipped overflow ${result.overflow}`);
  assert.ok(result.count <= (result.compact ? 6 : result.short ? 2 : 3), `${label}: bounded page size`);
  inspectedPages++;
  return result;
}

/** Select a real inventory entry through the same searchable browser as the user. */
function openDevice(device) {
  const landscape = evaluate('document.querySelector(".device-viewport").dataset.layout === "tablet-landscape"');
  browser('click', landscape ? '.dashboard-browse-devices' : '.dashboard-dock button:last-child');
  browser('wait', '#device-search');
  browser('fill', '#device-search', device.name);
  // Repeated room fixtures can share a name; the public inventory is paginated.
  for (let index = 0; index < 30; index++) {
    if (evaluate(`!!document.querySelector('[data-library-device="${device.id}"]')`)) break;
    assert.equal(evaluate(`document.querySelector('[aria-label="Next results page"]').disabled`), false, `Missing inventory device ${device.id}`);
    browser('click', '[aria-label="Next results page"]');
  }
  browser('wait', `[data-library-device="${device.id}"]`);
  browser('click', `[data-library-device="${device.id}"]`);
  browser('wait', '#full-device-controls[open]');
  assert.equal(evaluate('document.activeElement?.id'), 'sheet-device-control-title');
}

/** Walk every available category and page, including both keyboard focus boundaries. */
function inspectDevice(device, size) {
  openDevice(device);
  // Batch public navigation clicks to avoid one browser-process round trip per page.
  // A posted task lets React flush before layout reads, even in a background QA tab.
  const pages = evaluate(`(async () => {
    const settle = () => new Promise(resolve => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
      channel.port2.postMessage(null);
    });
    const results = [];
    for (const tab of document.querySelectorAll('.device-control-tabs button:not(:disabled)')) {
      tab.click();
      await settle();
      for (let index = 0; index < 20; index++) {
        const result = ${PAGE_MEASUREMENT};
        results.push({ ...result, group: tab.dataset.controlGroup, index });
        if (result.last) break;
        if (index === 19) throw new Error('Control pagination did not terminate');
        document.querySelector('[aria-label="Next controls page"]').click();
        await settle();
      }
    }
    return results;
  })()`);
  for (const page of pages) verifyPage(`${size}/${device.kind}/${page.group}/${page.index + 1}`, page);
  if (device.kind === 'tv') verifyKeyboardNavigation();
  browser('press', 'Escape');
  waitFor('!document.querySelector("#full-device-controls") && !document.documentElement.classList.contains("device-sheet-open")');
}

/** Exercise real keyboard events on a dense device at each supported viewport. */
function verifyKeyboardNavigation() {
  const groups = evaluate('[...document.querySelectorAll(".device-control-tabs button:not(:disabled)")].map(e => e.dataset.controlGroup)');
  browser('focus', `[data-control-group="${groups[0]}"]`);
  browser('press', 'ArrowRight');
  assert.equal(evaluate('document.activeElement?.dataset.controlGroup'), groups[1] ?? groups[0], 'Arrow keys navigate categories');
  browser('focus', '[aria-label="Close full controls"]');
  browser('press', 'Shift+Tab');
  assert.equal(evaluate('document.querySelector("#full-device-controls").contains(document.activeElement)'), true, 'Reverse focus stays in dialog');
  browser('press', 'Tab');
  assert.equal(evaluate('document.activeElement?.getAttribute("aria-label")'), 'Close full controls', 'Forward focus wraps');
}

/** Confirm a real keyboard edit, dismissal and reopen all share the saved simulation. */
function verifySavedBrightness() {
  const device = devices.find((candidate) => candidate.id === 'living-light');
  openDevice(device);
  browser('focus', '#sheet-level-living-light');
  browser('press', 'End');
  assert.equal(evaluate('document.querySelector("#sheet-level-living-light").value'), '100');
  browser('press', 'Escape');
  openDevice(device);
  assert.equal(evaluate('document.querySelector("#sheet-level-living-light").value'), '100', 'Reopening keeps the saved brightness');
  browser('press', 'Escape');
}

try {
  browser('open', 'about:blank');
  browser('set', 'viewport', '320', '562');
  browser('set', 'media', 'light', 'reduced-motion');
  browser('open', url);
  const tabId = browser('tab', 'list').tabs.find((tab) => tab.active)?.tabId;
  assert.ok(tabId, 'The isolated QA tab exists');
  browser('tab', tabId);
  waitFor('!!document.querySelector(".dashboard-dock") && !document.querySelector("vite-error-overlay")');
  for (const device of representatives) {
    inspectDevice(device, '320x562');
    console.log(`PASS 320x562 ${device.kind}`);
  }
  for (const [width, height] of [[390, 844], [834, 1194], [1024, 768], [960, 600]]) {
    browser('set', 'viewport', String(width), String(height));
    waitFor(`document.querySelector('.device-viewport').dataset.layout === '${width > height ? 'tablet-landscape' : width < 600 ? 'mobile-portrait' : 'tablet-portrait'}'`);
    inspectDevice(representatives.find((device) => device.kind === 'tv'), `${width}x${height}`);
    console.log(`PASS ${width}x${height} tv`);
  }
  verifySavedBrightness();
  assert.deepEqual(browser('errors').errors, [], 'No uncaught browser errors');
  assert.equal(browser('console').messages.filter((entry) => entry.type === 'error' || entry.level === 'error').length, 0, 'No console errors');
  console.log(`PASS ${inspectedPages} full-control pages across ${representatives.length} device kinds and five viewports.`);
} finally {
  browser('close');
}
