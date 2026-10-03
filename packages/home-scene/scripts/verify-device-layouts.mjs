/** Verify supported tablet/phone layouts and rotation using an isolated browser. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:5177';
const session = process.env.VANTA_QA_SESSION ?? 'vanta-device-layouts-qa';
const artifactDirectory = process.env.VANTA_QA_OUTPUT_DIR;
const rotationOnly = process.env.VANTA_QA_GROUP === 'rotation';
const smokeOnly = process.env.VANTA_QA_GROUP === 'smoke';
const popup = '#quick-device-controls';
const modal = '#full-device-controls[open]';
const deviceId = 'living-light';
const hotspot = `[data-device-hotspot="${deviceId}"]`;
const assertions = [];
const layouts = [];
const readOnlyRetries = [];
let initialScripts = [];
let initialStylesheets = [];
let collectingFailureEvidence = false;

/** Invoke the installed CLI without shell interpolation or shared browser state. */
function browser(...args) {
  const options = {
    encoding: 'utf8', timeout: collectingFailureEvidence ? 5000 : 30_000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '12000' },
  };
  let output;
  try { output = execFileSync('agent-browser', ['--session', session, '--json', ...args], options); }
  catch (error) {
    // Only public DOM reads may be retried; repeating a click could undo a toggle.
    if (collectingFailureEvidence || args[0] !== 'eval' || error.code !== 'ETIMEDOUT') throw error;
    readOnlyRetries.push({ command: args[0], expression: args[1], reason: error.code });
    output = execFileSync('agent-browser', ['--session', session, '--json', ...args], options);
  }
  const response = JSON.parse(output);
  assert.equal(response.success, true, response.error ?? args.join(' '));
  return response.data;
}

/** Read the public DOM or local simulation state, never React internals. */
function evaluate(expression) {
  return browser('eval', expression).result;
}

/** Wait for an observable condition instead of assuming a fixed rendering delay. */
function waitFor(expression) {
  const result = evaluate(`new Promise((resolve, reject) => {
    const started = performance.now();
    function poll() {
      try {
        if (${expression}) { resolve(true); return; }
        if (performance.now() - started >= 12000) { reject(new Error('DOM condition timed out: ' + ${JSON.stringify(expression)})); return; }
        setTimeout(poll, 30);
      } catch (error) { reject(error); }
    }
    poll();
  })`);
  assert.equal(result, true, `DOM condition: ${expression}`);
}

/** Record named product expectations in the evidence report. */
function check(condition, description) {
  assertions.push({ description, passed: Boolean(condition) });
  assert.ok(condition, description);
}

/** Wait for loaded geometry and mounted projected controls. */
function ready() {
  waitFor('!document.hidden && !document.querySelector(".scene-loading") && document.querySelector("#house-preview canvas") && document.querySelectorAll("[data-device-hotspot]").length > 0');
}

/** Allow scroll and resize observers to settle before measuring or clicking. */
function settle(selector) {
  check(evaluate(`new Promise((resolve) => {
    let previous = ''; let stable = 0; let finished = false;
    const timer = setTimeout(() => { finished = true; resolve(false); }, 4000);
    function measure() {
      if (finished) return;
      const boxes = [...document.querySelectorAll(${JSON.stringify(selector)})].map((element) => {
        const box = element.getBoundingClientRect();
        return [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 10));
      });
      const current = JSON.stringify(boxes);
      stable = current === previous ? stable + 1 : 0;
      previous = current;
      if (boxes.length && stable >= 6) { finished = true; clearTimeout(timer); resolve(true); }
      else requestAnimationFrame(measure);
    }
    requestAnimationFrame(measure);
  })`), `${selector}: layout settles before measurement`);
}

/** Capture geometry and persisted state for both the app and orientation prompt. */
function snapshot() {
  return evaluate(`(() => {
    function rectangle(selector) {
      const element = document.querySelector(selector);
      if (!element) return null;
      const { x, y, width, height, top, right, bottom, left } = element.getBoundingClientRect();
      return { x, y, width, height, top, right, bottom, left };
    }
    return {
      state: JSON.parse(localStorage.getItem('vantahome-simulation-v2'))?.state,
      layout: document.querySelector('.device-viewport')?.dataset.layout,
      width: innerWidth, height: innerHeight,
      overflowPixels: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      wrapper: rectangle('.device-viewport'), house: rectangle('#house-preview'),
      canvas: rectangle('#house-preview canvas'), inspector: rectangle('#room-controls'),
      scene: rectangle('.scene-container'), viewControls: rectangle('.view-controls'),
      prompt: rectangle('#orientation-title'), focusedId: document.activeElement?.id,
      canvasCount: document.querySelectorAll('canvas').length,
      visibleCanvasCount: [...document.querySelectorAll('canvas')].filter((canvas) => canvas.checkVisibility()).length,
      appInert: !!document.querySelector('.app-shell')?.closest('[inert]'),
      appVisible: document.querySelector('.app-shell')?.checkVisibility() ?? false,
      modalCount: document.querySelectorAll('dialog:modal').length,
      sheetCount: document.querySelectorAll('#full-device-controls').length,
      scrollLocked: document.documentElement.classList.contains('device-sheet-open'),
      hotspots: [...document.querySelectorAll('[data-device-hotspot]')].map((element) => ({
        id: element.dataset.deviceHotspot, box: rectangle('[data-device-hotspot="' + element.dataset.deviceHotspot + '"]'),
        visible: element.checkVisibility(),
        parents: [element, element.parentElement, element.parentElement?.parentElement].filter(Boolean).map((node) => ({
          className: node.className, style: node.getAttribute('style'), display: getComputedStyle(node).display, visibility: getComputedStyle(node).visibility,
        })),
      })),
    };
  })()`);
}

/** Confirm the center of each visible touch control can actually receive a tap. */
function reachableControls(selector, label, minimumSize = 44) {
  const controls = evaluate(`(() => {
    return [...document.querySelectorAll(${JSON.stringify(selector)})].map((element) => {
      const box = element.getBoundingClientRect();
      const x = box.x + box.width / 2; const y = box.y + box.height / 2;
      return { label: element.getAttribute('aria-label') || element.textContent.trim(), width: box.width, height: box.height,
        reachable: x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight && element.contains(document.elementFromPoint(x, y)) };
    });
  })()`);
  check(controls.length > 0, `${label}: controls are present`);
  check(controls.every((control) => control.width >= minimumSize && control.height >= 44), `${label}: touch targets are at least ${minimumSize}×44 CSS pixels (${JSON.stringify(controls)})`);
  check(controls.every((control) => control.reachable), `${label}: every control has a reachable tap center (${JSON.stringify(controls)})`);
}

/** Save representative screenshots only when an evidence directory was requested. */
function screenshot(name) {
  if (!artifactDirectory) return;
  mkdirSync(artifactDirectory, { recursive: true });
  browser('screenshot', resolve(artifactDirectory, `${name}.png`));
}

/** Check each supported viewport using the same live scene and persisted settings. */
function checkLayout(width, height, expectedLayout) {
  const label = `${width}×${height} ${expectedLayout}`;
  browser('set', 'viewport', String(width), String(height));
  waitFor(`document.querySelector('.device-viewport')?.dataset.layout === ${JSON.stringify(expectedLayout)}`);
  browser('scrollintoview', '#house-preview');
  ready();
  settle('#house-preview, #room-controls, .view-controls');
  const current = snapshot();
  layouts.push(current);
  check(current.overflowPixels <= 1, `${label}: no horizontal page overflow (${current.overflowPixels}px)`);
  check(current.wrapper.width <= Math.min(width, 1366) + 1 && current.wrapper.left >= -1 && current.wrapper.right <= width + 1, `${label}: tablet preview stays within its 1366px maximum and viewport`);
  if (width > 1366) check(Math.abs(current.wrapper.left - (width - current.wrapper.width) / 2) <= 1, `${label}: desktop tablet preview is centered`);
  check(current.canvas.width >= 200 && current.canvas.height >= 200, `${label}: rendered scene has a useful interactive area`);
  check(current.canvas.left >= current.house.left - 1 && current.canvas.right <= current.house.right + 1 && current.canvas.top >= current.house.top - 1 && current.canvas.bottom <= current.house.bottom + 1, `${label}: rendered scene fits the house panel`);
  check(current.viewControls.left >= current.house.left && current.viewControls.right <= current.house.right && current.viewControls.top >= current.house.top && current.viewControls.bottom <= current.house.bottom, `${label}: view controls fit inside the house panel`);
  if (expectedLayout === 'tablet-landscape') {
    check(current.inspector.left >= current.house.right - 1 && current.inspector.top < current.house.bottom, `${label}: full inspector is to the right of the scene`);
  } else {
    check(current.inspector.top >= current.house.bottom - 1, `${label}: full inspector is below the scene`);
  }
  const timeButton = 'button[aria-label^="Property time and weather:"]';
  browser('scrollintoview', timeButton);
  settle(timeButton);
  reachableControls(timeButton, `${label} time and weather access`);
  browser('click', timeButton);
  browser('wait', '.environment-panel');
  settle('.environment-modes button');
  reachableControls('.environment-modes button', `${label} local/day/night options`);
  browser('click', '[aria-label="Close home browser"]');
  waitFor('!document.querySelector("dialog:modal")');
  browser('scrollintoview', '.view-controls');
  settle('.view-controls button');
  reachableControls('.view-controls button', `${label} view navigation`);
  check(evaluate('getComputedStyle(document.querySelector(".room-list")).scrollBehavior') === 'auto', `${label}: reduced motion disables smooth room-list scrolling`);
  browser('scrollintoview', '.app-header');
  waitFor('scrollY === 0');
  screenshot(`layout-${width}x${height}`);
  console.log(`PASS ${label}`);
}

/** Rotate with full controls open and prove the paused scene restores its controls. */
function phoneRotation() {
  browser('set', 'viewport', '390', '844');
  waitFor('document.querySelector(".device-viewport")?.dataset.layout === "mobile-portrait"');
  browser('scrollintoview', '[data-room-id="living"]');
  browser('click', '[data-room-id="living"]');
  browser('scrollintoview', '#house-preview');
  ready();
  browser('wait', hotspot);
  settle(hotspot);
  browser('click', hotspot);
  browser('wait', popup);
  const beforeToggle = snapshot().state;
  browser('click', `${popup} .quick-device-toggle`);
  check(snapshot().state.deviceStates[deviceId].on !== beforeToggle.deviceStates[deviceId].on, 'phone quick toggle changes the selected device');
  browser('click', `${popup} .quick-device-full`);
  browser('wait', modal);
  browser('focus', `#sheet-level-${deviceId}`);
  browser('press', 'Home');
  for (let step = 0; step < 3; step += 1) browser('press', 'PageUp');
  for (let step = 0; step < 7; step += 1) browser('press', 'ArrowRight');
  const beforeRotation = snapshot();
  check(beforeRotation.state.deviceStates[deviceId].level === 37, 'phone full controls save a distinct brightness setting before rotation');
  check(beforeRotation.modalCount === 1 && beforeRotation.scrollLocked, 'phone full controls use native modality and scroll locking before rotation');

  browser('set', 'viewport', '844', '390');
  waitFor('document.querySelector(".device-viewport")?.dataset.layout === "mobile-landscape" && document.activeElement?.id === "orientation-title"');
  const rotated = snapshot();
  layouts.push(rotated);
  check(rotated.prompt && rotated.appInert && !rotated.appVisible && rotated.visibleCanvasCount === 0, 'phone landscape shows the portrait prompt while the app is hidden and inert and no canvas is visible');
  check(rotated.sheetCount === 0 && rotated.modalCount === 0 && !rotated.scrollLocked, 'phone rotation removes the full-control sheet and releases native modality and scroll locking');
  check(rotated.overflowPixels <= 1, 'phone orientation prompt has no horizontal overflow');
  check(JSON.stringify(rotated.state) === JSON.stringify(beforeRotation.state), 'phone rotation preserves all room, view, selected-device, and device settings');
  screenshot('phone-landscape-prompt');

  browser('set', 'viewport', '390', '844');
  waitFor('document.querySelector(".device-viewport")?.dataset.layout === "mobile-portrait"');
  browser('scrollintoview', '#house-preview');
  ready();
  browser('wait', hotspot);
  settle(hotspot);
  const returned = snapshot();
  check(JSON.stringify(returned.state) === JSON.stringify(beforeRotation.state), 'returning to phone portrait restores the exact simulation state');
  check(returned.sheetCount === 0 && returned.modalCount === 0 && !returned.scrollLocked, 'returning to portrait leaves controls available without an orphaned sheet or scroll lock');
  browser('click', hotspot);
  browser('wait', popup);
  browser('click', `${popup} .quick-device-toggle`);
  const afterToggle = snapshot().state;
  check(afterToggle.deviceStates[deviceId].on !== beforeRotation.state.deviceStates[deviceId].on && afterToggle.deviceStates[deviceId].level === 37, 'quick controls still toggle power and retain brightness after rotating back');
  check(Object.entries(beforeRotation.state.deviceStates).every(([id, value]) => id === deviceId || JSON.stringify(afterToggle.deviceStates[id]) === JSON.stringify(value)), 'rotation and the restored quick toggle preserve all other device settings');
  browser('click', `${popup} .quick-device-full`);
  browser('wait', modal);
  check(evaluate(`document.querySelector('#sheet-level-${deviceId}').value`) === '37', 'reopened full controls show the saved brightness');
  browser('click', `${modal} [aria-label="Close full controls"]`);
  waitFor(`!document.querySelector('dialog:modal') && document.activeElement?.getAttribute('data-device-hotspot') === '${deviceId}'`);
  check(!snapshot().scrollLocked, 'reopened full controls close normally and release scroll locking');
  screenshot('phone-portrait-restored');
  console.log('PASS phone landscape prompt and state-preserving rotation');
}

/** Preserve useful bounded evidence on both a successful and a failed run. */
function recordArtifacts(status, error) {
  if (!artifactDirectory) return;
  mkdirSync(artifactDirectory, { recursive: true });
  let current;
  try { current = snapshot(); } catch { current = null; }
  let errors;
  let consoleMessages;
  try { errors = browser('errors').errors; consoleMessages = browser('console').messages; } catch { errors = null; consoleMessages = null; }
  writeFileSync(resolve(artifactDirectory, 'device-layouts.json'), JSON.stringify({
    status, url, group: rotationOnly ? 'rotation' : smokeOnly ? 'smoke' : 'all', initialScripts, initialStylesheets, checks: assertions.filter((item) => item.passed).length,
    assertions, layouts, readOnlyRetries, error: error?.message, snapshot: current, errors, consoleMessages,
  }, null, 2));
  if (error) try { screenshot('device-layouts-failure'); } catch { console.error('Failure screenshot unavailable.'); }
}

try {
  browser('open', 'about:blank');
  browser('set', 'viewport', '1024', '768');
  browser('set', 'media', 'light', 'reduced-motion');
  browser('open', url);
  const tabId = browser('tab', 'list').tabs.find((tab) => tab.active)?.tabId;
  assert.ok(tabId, 'The isolated QA tab must be available');
  browser('tab', tabId);
  ready();
  initialScripts = evaluate('[...document.scripts].map((script) => script.src).filter(Boolean)');
  initialStylesheets = evaluate('[...document.querySelectorAll("link[rel=stylesheet]")].map((link) => link.href)');
  browser('click', '[aria-label="Reset simulation to Morning"]');
  const allCases = [
    [1024, 768, 'tablet-landscape'], [1366, 1024, 'tablet-landscape'], [960, 600, 'tablet-landscape'],
    [600, 960, 'tablet-portrait'], [768, 1024, 'tablet-portrait'], [834, 1194, 'tablet-portrait'], [1024, 1366, 'tablet-portrait'],
    [390, 844, 'mobile-portrait'], [320, 568, 'mobile-portrait'], [1920, 1080, 'tablet-landscape'],
  ];
  const cases = smokeOnly ? allCases.filter(([width, height]) => (width === 1024 && height === 768) || (width === 834 && height === 1194) || (width === 390 && height === 844)) : allCases;
  if (!rotationOnly) for (const [width, height, layout] of cases) checkLayout(width, height, layout);
  phoneRotation();
  check(browser('errors').errors.length === 0, 'no uncaught page errors');
  check(browser('console').messages.filter((message) => message.type === 'error' || message.level === 'error').length === 0, 'no console errors');
  recordArtifacts('passed');
  console.log(`PASS ${assertions.length} device-layout checks across ${rotationOnly ? 'phone rotation' : `${cases.length} supported viewports and phone rotation`}.`);
} catch (error) {
  collectingFailureEvidence = true;
  recordArtifacts('failed', error);
  throw error;
} finally {
  try { browser('close'); }
  catch (error) { console.error('Browser cleanup failed:', error.message); process.exitCode = 1; }
}
