/** Verify adaptive controls against a running preview using an isolated browser. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCatalogChecks } from './verify-catalog-checks.mjs';

const url = process.argv[2] ?? 'http://127.0.0.1:5177';
const session = process.env.VANTA_QA_SESSION ?? 'vanta-hotspots-qa';
const requestedGroup = process.env.VANTA_QA_GROUP;
const popup = '#quick-device-controls';
const modal = '#full-device-controls[open]';
const manifest = JSON.parse(readFileSync(new URL('../src/house-manifest.json', import.meta.url), 'utf8'));
const profiles = JSON.parse(readFileSync(new URL('../src/device-capabilities.json', import.meta.url), 'utf8')).profiles;
const catalog = manifest.devices.map((device) => {
  const room = manifest.rooms.find((item) => item.id === device.roomId);
  assert.ok(room, `Catalog room exists for ${device.id}`);
  return { ...device, floor: room.floor, room: room.id, outdoor: room.outdoor };
});
const devices = ['living-light', 'living-fan', 'laundry-washer', 'master-ac', 'master-blinds', 'family-tv', 'entry-gate'].map((id) => {
  const device = catalog.find((item) => item.id === id);
  assert.ok(device, `Legacy device ${id} remains available`);
  return device;
});
const openingKinds = new Set(['blinds', 'gate', 'garage', 'door', 'window']);
const monitorKinds = new Set(['energy', 'water', 'air', 'smoke', 'solar']);
const actionKinds = new Set(['camera', 'coffee', 'vacuum', 'washer', 'dryer', 'dishwasher', 'microwave', 'generator']);
let checks = 0;
let qaTabId;
let initialScripts = [];
const readOnlyRetries = [];
let collectingFailureEvidence = false;
const artifactDirectory = process.env.VANTA_QA_OUTPUT_DIR;
const assertions = [];

/** Save bounded evidence without changing the browser interactions under test. */
function recordArtifacts(status, error) {
  if (!artifactDirectory) return;
  mkdirSync(artifactDirectory, { recursive: true });
  const basename = resolve(artifactDirectory, requestedGroup ?? 'all');
  let current;
  try { current = snapshot(); } catch { current = null; }
  writeFileSync(`${basename}.json`, JSON.stringify({ status, group: requestedGroup ?? 'all', initialScripts, readOnlyRetries, catalogKinds: process.env.VANTA_QA_CATALOG_KINDS?.split(',') ?? null, catalogRooms: process.env.VANTA_QA_CATALOG_ROOMS?.split(',') ?? null, checks, assertions, error: error?.message, snapshot: current }, null, 2));
  try { browser('screenshot', `${basename}.png`); } catch (screenshotError) { console.error('Screenshot unavailable:', screenshotError.message); }
}

/** Invoke the installed CLI directly, without shell expansion or dependencies. */
function browser(...args) {
  // The CLI wait --fn occasionally times out after its predicate is already true.
  // Poll the identical public DOM expression with a bounded in-page timer instead.
  if (args[0] === 'wait' && args[1] === '--fn') {
    const expression = args[2];
    const response = browser('eval', `new Promise((resolve, reject) => {
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
    assert.equal(response.result, true, `DOM condition: ${expression}`);
    return response;
  }
  const options = {
    encoding: 'utf8', timeout: collectingFailureEvidence ? 5000 : 30_000, maxBuffer: 4 * 1024 * 1024,
    // Keep daemon action timeouts below the CLI process timeout so evidence remains available.
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: process.env.AGENT_BROWSER_DEFAULT_TIMEOUT ?? '12000' },
  };
  let output;
  try { output = execFileSync('agent-browser', ['--session', session, '--json', ...args], options); }
  catch (error) {
    // Retry only pure DOM reads once; clicks, edits and navigation must never run twice.
    if (collectingFailureEvidence || args[0] !== 'eval' || error.code !== 'ETIMEDOUT') throw error;
    readOnlyRetries.push({ command: args[0], expression: args[1], reason: error.code });
    console.log('NOTE: retrying one timed-out read-only browser eval.');
    output = execFileSync('agent-browser', ['--session', session, '--json', ...args], options);
  }
  const response = JSON.parse(output);
  assert.equal(response.success, true, response.error ?? args.join(' '));
  return response.data;
}

/** Read public DOM and persisted state without depending on React internals. */
function evaluate(expression) {
  return browser('eval', expression).result;
}

/** Count explicit product invariants and identify any failed expectation. */
function check(condition, description) {
  assertions.push({ description, passed: Boolean(condition) });
  assert.ok(condition, description);
  checks += 1;
}

/** Capture projected anchors as an observable measure of camera preservation. */
function snapshot() {
  return evaluate(`(() => {
    const state = JSON.parse(localStorage.getItem('vantahome-simulation-v2')).state;
    const sheet = document.querySelector(${JSON.stringify(modal)});
    return {
      state, scripts: [...document.scripts].map((script) => script.src).filter(Boolean), x: scrollX, y: scrollY,
      anchors: [...document.querySelectorAll('[data-device-hotspot]')].map((element) => {
        const box = element.getBoundingClientRect();
        return { id: element.dataset.deviceHotspot, x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }),
      popupCount: document.querySelectorAll(${JSON.stringify(popup)}).length,
      modalCount: document.querySelectorAll(${JSON.stringify(modal)}).length,
      expanded: [...document.querySelectorAll('[data-device-hotspot][aria-expanded="true"]')].map((element) => element.dataset.deviceHotspot),
      focusedId: document.activeElement?.id,
      focusInModal: !!sheet?.contains(document.activeElement),
      focusedHotspot: document.activeElement?.getAttribute('data-device-hotspot'),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  })()`);
}

/** Allow inspector selection changes while ensuring the house stays in place. */
function unchangedView(before, after, label) {
  for (const key of ['floor', 'view', 'roomId']) check(after.state[key] === before.state[key], `${label}: ${key} remains unchanged`);
  check(Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1, `${label}: page does not scroll`);
  check(before.anchors.every((anchor) => {
    const current = after.anchors.find((item) => item.id === anchor.id);
    return current && Math.abs(current.x - anchor.x) < 1 && Math.abs(current.y - anchor.y) < 1;
  }), `${label}: projected camera anchors remain stationary (${JSON.stringify({ before: before.anchors, after: after.anchors })})`);
}

/** Wait for real model readiness rather than an arbitrary delay. */
function ready() {
  browser('wait', '--fn', '!document.querySelector(".scene-loading") && document.querySelectorAll("[data-device-hotspot]").length >= 1');
}

/** Verify projected buttons stay individually tappable, including under nearby labels. */
function reachableTargets() {
  const result = evaluate(`(() => {
    const targets = [...document.querySelectorAll('[data-device-hotspot]')].map((element) => {
      const box = element.getBoundingClientRect();
      const x = box.x + box.width / 2; const y = box.y + box.height / 2;
      return { id: element.dataset.deviceHotspot, x, y, radius: box.width / 2, hit: document.elementFromPoint(x, y)?.closest('[data-device-hotspot]')?.getAttribute('data-device-hotspot') };
    });
    const covered = targets.filter((target) => target.hit !== target.id);
    const crowded = targets.flatMap((target, index) => targets.slice(index + 1).filter((other) => Math.hypot(target.x - other.x, target.y - other.y) < target.radius + other.radius + 2).map((other) => [target.id, other.id]));
    return { covered, crowded };
  })()`);
  check(result.covered.length === 0, `every projected control has its own reachable center (${JSON.stringify(result.covered)})`);
  check(result.crowded.length === 0, `projected touch targets have separation (${JSON.stringify(result.crowded)})`);
}

/** Choose the real room before testing its projected controls. */
function prepareDevice(device) {
  // Foreground this isolated tab: background tabs intentionally suspend animation frames.
  browser('tab', qaTabId);
  browser('wait', '--fn', '!document.hidden');
  const navigation = evaluate(`(() => {
    const { floor, roomId, view } = JSON.parse(localStorage.getItem('vantahome-simulation-v2')).state;
    return { floor, roomId, view, search: document.getElementById('room-search').value };
  })()`);
  if (navigation.search !== '') {
    browser('scrollintoview', '#room-search');
    browser('fill', '#room-search', '');
  }
  // Reuse a correctly framed room so sequential controls exercise real same-room switching.
  const changeFloor = !device.outdoor && (navigation.floor !== device.floor || navigation.view !== device.floor);
  if (changeFloor) {
    browser('scrollintoview', '.floor-switch');
    browser('click', `.floor-switch button:nth-child(${device.floor === 'ground' ? 1 : 2})`);
  }
  const changeRoom = changeFloor || navigation.roomId !== device.room;
  if (changeRoom) {
    // Room tabs scroll horizontally on phones; reveal the requested public button first.
    browser('scrollintoview', `[data-room-id="${device.room}"]`);
    browser('click', `[data-room-id="${device.room}"]`);
    browser('wait', '--fn', `JSON.parse(localStorage.getItem('vantahome-simulation-v2'))?.state?.roomId === ${JSON.stringify(device.room)}`);
  }
  if (device.room === 'utility' && (changeRoom || navigation.view !== 'immersive')) {
    browser('scrollintoview', '.view-controls');
    browser('click', '.view-controls button:nth-child(3)');
  }
  // A sidebar selection can scroll the canvas offscreen; reveal it before model readiness.
  browser('scrollintoview', '#house-preview');
  ready();
  // Drei mounts projected DOM in a separate root, after the GLTF reports ready.
  browser('wait', `[data-device-hotspot="${device.id}"]`);
  browser('scrollintoview', `[data-device-hotspot="${device.id}"]`);
  // ResizeObserver and projected HTML settle on later frames after a viewport change.
  check(evaluate(`new Promise((resolve) => {
    let previous = ''; let stable = 0; let finished = false;
    const started = performance.now();
    const timer = setTimeout(() => { finished = true; resolve(false); }, 4000);
    function measure() {
      if (finished) return;
      const current = [...document.querySelectorAll('[data-device-hotspot]')].map((element) => {
        const box = element.getBoundingClientRect();
        return [element.dataset.deviceHotspot, Math.round(box.x * 10), Math.round(box.y * 10)];
      });
      const serialized = JSON.stringify(current);
      stable = serialized === previous ? stable + 1 : 0;
      previous = serialized;
      if (current.length && stable >= 6 && performance.now() - started >= 200) {
        finished = true; clearTimeout(timer); resolve(true);
      } else requestAnimationFrame(measure);
    }
    requestAnimationFrame(measure);
  })`), `${device.id}: projected controls settle before interaction`);
  reachableTargets();
}

/** Exercise a device's public primary action and verify only its own state changes. */
function toggleIn(container, device, previous) {
  const before = snapshot().state.deviceStates;
  const isCover = openingKinds.has(device.kind);
  const coverName = device.kind === 'garage' ? 'shutter' : device.kind;
  const selector = container === popup ? '.quick-device-toggle' : isCover
    ? `button[aria-label="${previous.level > 0 ? 'Close' : 'Open'} smart ${coverName}"]`
    : monitorKinds.has(device.kind) || actionKinds.has(device.kind) ? '.primary-device-action' : '.power-row > [role="switch"]';
  browser('click', `${container} ${selector}`);
  const after = snapshot().state.deviceStates;
  const current = after[device.id];
  if (monitorKinds.has(device.kind)) check(current.on && current.settings?.sampleChecked === true, `${device.id}: check acknowledges a local sample without powering down monitoring`);
  else check(current.on !== previous.on, `${device.id}: visible primary action changes persisted device state`);
  check(current.level === (isCover ? (previous.level > 0 ? 0 : 100) : previous.level), `${device.id}: opening actions change position; other actions retain intensity`);
  check(Object.entries(before).every(([id, value]) => id === device.id || JSON.stringify(after[id]) === JSON.stringify(value)), `${device.id}: other device states remain independent`);
}

/** Test the visible right inspector at desktop and landscape-tablet widths. */
function wideControls(width, height, targets) {
  browser('set', 'viewport', String(width), String(height));
  for (const device of targets) {
    prepareDevice(device);
    const before = snapshot();
    browser('click', `[data-device-hotspot="${device.id}"]`);
    const selected = snapshot();
    check(selected.popupCount === 0 && selected.modalCount === 0, `${width}: ${device.id} uses the right inspector directly`);
    check(selected.state.selectedDevice === device.id && selected.state.roomId === device.room, `${width}: inspector and room match ${device.id}`);
    check(selected.expanded.length === 0, `${width}: no unopened dialog is advertised`);
    unchangedView(before, selected, `${width} ${device.id} selection`);
    check(evaluate('(() => { const panel = document.getElementById("room-controls").getBoundingClientRect(); const house = document.getElementById("house-preview").getBoundingClientRect(); return panel.left >= house.right - 2 && panel.top < innerHeight && panel.bottom > 0; })()'), `${width}: inspector is beside the house and visible`);
    toggleIn('#room-controls', device, selected.state.deviceStates[device.id]);
    unchangedView(before, snapshot(), `${width} ${device.id} toggle`);
    check(!snapshot().overflow, `${width}: no horizontal overflow`);
  }
  console.log(`PASS wide ${width}×${height}: ${targets.length} devices`);
}

/** Check native modality, an accessible name, initial focus, and tab confinement. */
function modalAccessibility(device) {
  const result = snapshot();
  check(result.modalCount === 1 && result.popupCount === 0, `${device.id}: one sheet replaces the quick card`);
  check(result.state.selectedDevice === device.id && result.focusedId === 'sheet-device-control-title', `${device.id}: sheet selects the device and focuses its title`);
  check(evaluate(`(() => { const panel = document.querySelector(${JSON.stringify(modal)}); const box = panel.getBoundingClientRect(); return panel.matches(':modal') && !!document.getElementById(panel.getAttribute('aria-labelledby'))?.textContent.trim() && box.left >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1; })()`), `${device.id}: native modal is named and fits the viewport`);
  browser('focus', `${modal} [aria-label="Close full controls"]`);
  browser('press', 'Shift+Tab');
  check(evaluate(`(() => { const controls = [...document.querySelector(${JSON.stringify(modal)}).querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary')].filter((control) => control.getClientRects().length > 0); return document.activeElement === controls.at(-1); })()`), `${device.id}: backward Tab wraps to the last visible control`);
  browser('press', 'Tab');
  check(evaluate('document.activeElement?.getAttribute("aria-label")') === 'Close full controls', `${device.id}: forward Tab wraps from the last control to the first`);
}

/** Cover synchronized quick cards and modal controls on portrait tablets and phones. */
function narrowControls(width, height, targets) {
  browser('set', 'viewport', String(width), String(height));
  for (const [index, device] of targets.entries()) {
    prepareDevice(device);
    const before = snapshot();
    browser('click', `[data-device-hotspot="${device.id}"]`);
    browser('wait', popup);
    const opened = snapshot();
    unchangedView(before, opened, `${width} ${device.id} quick open`);
    check(opened.state.selectedDevice === device.id && opened.state.roomId === device.room, `${device.id}: quick card synchronizes the detailed inspector`);
    check(opened.popupCount === 1 && opened.expanded.join() === device.id, `${width}: one correctly associated quick card`);
    toggleIn(popup, device, before.state.deviceStates[device.id]);
    unchangedView(before, snapshot(), `${width} ${device.id} quick toggle`);
    browser('click', `${popup} .quick-device-full`);
    browser('wait', modal);
    unchangedView(before, snapshot(), `${width} ${device.id} Full controls`);
    if (index === 0) modalAccessibility(device);
    else check(snapshot().focusInModal, `${device.id}: modal receives focus`);
    check(!snapshot().overflow, `${width}: sheet does not create horizontal overflow`);
    browser('press', 'Escape');
    browser('wait', '--fn', `document.activeElement?.getAttribute('data-device-hotspot') === ${JSON.stringify(device.id)}`);
    const dismissed = snapshot();
    check(dismissed.modalCount === 0 && dismissed.popupCount === 0, `${device.id}: Escape dismisses the sheet`);
    check(dismissed.focusedHotspot === device.id, `${device.id}: modal dismissal restores hotspot focus`);
    unchangedView(before, dismissed, `${width} ${device.id} dismissal`);
    console.log(`PASS narrow ${width}: ${device.id}`);
  }
  console.log(`PASS narrow ${width}×${height}: ${targets.length} devices`);
}

/** Test quick-card replacement, outside/room dismissal, and modal backdrop dismissal. */
function dismissalControls() {
  browser('set', 'viewport', '390', '844');
  prepareDevice(devices[0]);
  browser('click', '[data-device-hotspot="living-light"]');
  browser('click', '[data-device-hotspot="living-fan"]');
  const replaced = snapshot();
  check(replaced.popupCount === 1 && replaced.expanded.join() === 'living-fan', 'another hotspot replaces the current quick card');
  browser('press', 'Escape');
  check(snapshot().focusedHotspot === 'living-fan' && snapshot().popupCount === 0, 'quick Escape restores hotspot focus');
  browser('click', '[data-device-hotspot="living-light"]');
  browser('click', '.viewport-top h1');
  check(snapshot().popupCount === 0, 'outside click dismisses the quick card');
  browser('click', '[data-device-hotspot="living-light"]');
  browser('click', '.room-list button:nth-child(2)');
  check(snapshot().popupCount === 0 && snapshot().expanded.length === 0, 'room navigation dismisses the quick card');
  prepareDevice(devices[0]);
  browser('click', '[data-device-hotspot="living-light"]');
  browser('click', `${popup} .quick-device-full`);
  browser('wait', modal);
  browser('mouse', 'move', '8', '8');
  browser('mouse', 'down');
  browser('mouse', 'up');
  browser('wait', '--fn', 'document.activeElement?.getAttribute("data-device-hotspot") === "living-light"');
  check(snapshot().modalCount === 0, 'native modal backdrop click dismisses the sheet');
  check(snapshot().focusedHotspot === 'living-light', 'backdrop dismissal restores hotspot focus');
}

/** Set a range through keyboard input and check its persisted semantic state. */
function setBlindsPosition(level, prefix = '') {
  const selector = `#${prefix}level-master-blinds`;
  browser('focus', selector);
  browser('press', level === 100 ? 'End' : 'Home');
  if (level === 50) for (let index = 0; index < 5; index += 1) browser('press', 'PageUp');
  const blinds = snapshot().state.deviceStates['master-blinds'];
  check(blinds.level === level && blinds.on === (level > 0), `blinds ${level}%: position and open state agree`);
  check(evaluate(`document.querySelector(${JSON.stringify(selector)}).value`) === String(level), `blinds ${level}%: slider matches persisted state`);
}

/** Verify inline and sheet blind positions, explicit Open/Close, and reload persistence. */
function blindsControls() {
  browser('set', 'viewport', '1194', '834');
  prepareDevice(devices[4]);
  browser('click', '[data-device-hotspot="master-blinds"]');
  for (const level of [0, 50, 100]) setBlindsPosition(level);
  browser('click', '#room-controls button[aria-label="Close smart blinds"]');
  check(snapshot().state.deviceStates['master-blinds'].level === 0, 'Close blinds sets a fully closed position');
  browser('click', '#room-controls button[aria-label="Open smart blinds"]');
  check(snapshot().state.deviceStates['master-blinds'].level === 100, 'Open blinds sets a fully open position');
  browser('set', 'viewport', '390', '844');
  prepareDevice(devices[4]);
  browser('click', '[data-device-hotspot="master-blinds"]');
  browser('click', `${popup} .quick-device-full`);
  browser('wait', modal);
  for (const level of [0, 50, 100]) setBlindsPosition(level, 'sheet-');
  setBlindsPosition(50, 'sheet-');
  browser('click', '[aria-label="Close full controls"]');
  check(snapshot().modalCount === 0, 'explicit modal close works');
  browser('reload');
  ready();
  check(snapshot().state.deviceStates['master-blinds'].level === 50, 'partly open blinds survive a reload');
  check(evaluate('document.querySelector("#level-master-blinds").value') === '50', 'restored inspector matches the saved blind position');
  console.log('PASS blinds 0/50/100, Open/Close, persistence');
}

/** Exercise gate positions, entry immersion and returns to either floor. */
function gateControls() {
  browser('set', 'viewport', '1440', '1000');
  browser('click', '.floor-switch button:nth-child(1)');
  prepareDevice(devices[6]);
  check(snapshot().state.view === 'exterior', 'grounds opens the full landscape');
  check(evaluate('document.querySelector("h1").textContent.includes("Seaview grounds")'), 'landscape has a distinct title');
  browser('click', '.view-controls button:nth-child(3)');
  ready();
  check(snapshot().state.view === 'immersive' && snapshot().state.roomId === 'grounds', 'gate viewpoint preserves grounds');
  browser('click', '[data-device-hotspot="entry-gate"]');
  check(snapshot().state.view === 'immersive', 'gate hotspot preserves the entrance viewpoint');
  for (const level of [0, 50, 100]) {
    browser('focus', '#level-entry-gate');
    browser('press', 'Home');
    for (let step = 0; step < level / 10; step++) browser('press', 'PageUp');
    const current = snapshot().state.deviceStates['entry-gate'];
    check(current.level === level && current.on === (level > 0), `gate slider sets ${level}%`);
  }
  browser('click', '[aria-label="Close smart gate"]');
  check(snapshot().state.deviceStates['entry-gate'].level === 0, 'close gate clears its open state');
  browser('click', '[aria-label="Open smart gate"]');
  browser('reload');
  ready();
  check(snapshot().state.deviceStates['entry-gate'].level === 100, 'open gate survives reload');
  check(snapshot().state.roomId === 'grounds' && snapshot().state.view === 'immersive', 'entrance view survives reload');
  browser('click', '.view-controls button:nth-child(2)');
  ready();
  check(snapshot().state.roomId === 'living' && snapshot().state.view === 'ground', 'floor plan returns to the ground interior');
  browser('click', '.floor-switch button:nth-child(2)');
  ready();
  browser('click', '[data-room-id="master"]');
  browser('click', '[data-room-id="grounds"]');
  ready();
  check(snapshot().state.view === 'exterior' && snapshot().state.floor === 'upper', 'grounds remains accessible without losing the upper floor');
  browser('click', '.view-controls button:nth-child(2)');
  ready();
  check(snapshot().state.view === 'upper' && snapshot().state.roomId === 'master', 'landscape returns to the exact indoor room');
  browser('click', '[data-room-id="grounds"]');
  ready();
  browser('set', 'viewport', '390', '844');
  browser('scrollintoview', '#house-preview');
  browser('click', '[data-device-hotspot="entry-gate"]');
  browser('click', `${popup} .quick-device-full`);
  browser('wait', modal);
  browser('focus', '#sheet-level-entry-gate');
  browser('press', 'Home');
  for (let step = 0; step < 5; step++) browser('press', 'PageUp');
  check(snapshot().state.deviceStates['entry-gate'].level === 50, 'mobile full controls allow a partial opening');
  browser('press', 'Escape');
  browser('wait', '--fn', 'document.activeElement?.getAttribute("data-device-hotspot") === "entry-gate"');
  check(snapshot().modalCount === 0 && !snapshot().overflow, 'gate sheet dismisses with focus and without overflow');
  browser('reload');
  ready();
  check(snapshot().state.deviceStates['entry-gate'].level === 50, 'partial opening survives reload');
  console.log('PASS gate positions, persistence, navigation and mobile controls');
}

/** Rotate an open quick card or sheet into the visible inspector and back. */
function layoutChanges() {
  browser('set', 'viewport', '834', '1194');
  prepareDevice(devices[0]);
  browser('click', '[data-device-hotspot="living-light"]');
  browser('set', 'viewport', '1194', '834');
  browser('wait', '--fn', 'document.activeElement?.id === "device-control-title"');
  check(snapshot().popupCount === 0 && snapshot().modalCount === 0, 'landscape transfers the quick card to the focused inspector');
  browser('set', 'viewport', '834', '1194');
  browser('click', '[data-device-hotspot="living-light"]');
  browser('click', `${popup} .quick-device-full`);
  browser('wait', modal);
  browser('set', 'viewport', '1194', '834');
  browser('wait', '--fn', 'document.activeElement?.id === "device-control-title"');
  check(snapshot().modalCount === 0 && snapshot().popupCount === 0, 'landscape transfers the sheet to the focused inspector');
  check(evaluate('!document.querySelector("dialog:modal") && !document.documentElement.classList.contains("device-sheet-open")'), 'layout changes release native modality and scroll locks');
  browser('set', 'viewport', '834', '1194');
  browser('click', '[data-device-hotspot="living-fan"]');
  check(snapshot().popupCount === 1, 'quick controls work after rotating back to portrait');
  browser('press', 'Escape');
  console.log('PASS adaptive layout changes');
}

try {
  browser('open', 'about:blank');
  browser('set', 'viewport', '1440', '1000');
  browser('set', 'media', 'light', 'reduced-motion');
  browser('open', url);
  qaTabId = browser('tab', 'list').tabs.find((tab) => tab.active)?.tabId;
  assert.ok(qaTabId, 'The isolated QA tab must be available');
  browser('tab', qaTabId);
  browser('wait', '--fn', '!document.hidden');
  ready();
  initialScripts = evaluate('[...document.scripts].map((script) => script.src).filter(Boolean)');
  browser('click', '[aria-label="Reset simulation to Morning"]');
  const catalogChecks = createCatalogChecks({ browser, evaluate, check, snapshot, unchangedView, prepareDevice, toggleIn, modalAccessibility, narrowControls, ready, catalog, profiles, popup, modal });
  const groups = {
    wide: () => {
      wideControls(1440, 1000, devices);
      wideControls(1194, 834, [devices[1], devices[3], devices[6]]);
      wideControls(1024, 768, [devices[0], devices[4], devices[6]]);
    },
    narrow: () => {
      narrowControls(834, 1194, devices);
      narrowControls(390, 844, [devices[2], devices[4], devices[6]]);
    },
    dismissal: dismissalControls,
    layout: layoutChanges,
    blinds: blindsControls,
    gate: gateControls,
    ...catalogChecks,
    "gate-adaptive": () => {
      narrowControls(834, 1194, [devices[6]]);
      narrowControls(390, 844, [devices[6]]);
    },
  };
  if (requestedGroup) assert.ok(Object.hasOwn(groups, requestedGroup), `Unknown QA group: ${requestedGroup}`);
  for (const [name, run] of Object.entries(groups)) if (!requestedGroup || requestedGroup === name) run();
  check(browser('errors').errors.length === 0, 'no uncaught page errors');
  check(browser('console').messages.filter((message) => message.type === 'error' || message.level === 'error').length === 0, 'no console errors');
  recordArtifacts('passed');
  console.log(`PASS ${checks} adaptive-control checks ${requestedGroup ? `in ${requestedGroup}` : 'across legacy and catalog flows'}.`);
} catch (error) {
  collectingFailureEvidence = true;
  recordArtifacts('failed', error);
  try {
    console.error('Browser failure context:', JSON.stringify(evaluate('({selectedDevice:JSON.parse(localStorage.getItem("vantahome-simulation-v2"))?.state?.selectedDevice,roomId:JSON.parse(localStorage.getItem("vantahome-simulation-v2"))?.state?.roomId,activeTag:document.activeElement?.tagName,activeId:document.activeElement?.id,activeHotspot:document.activeElement?.getAttribute("data-device-hotspot"),modal:!!document.querySelector("dialog:modal"),quick:!!document.querySelector("#quick-device-controls"),hidden:document.hidden,width:innerWidth,height:innerHeight})')));
  } catch {
    console.error('Browser diagnostics unavailable; preserving the original failure.');
  }
  throw error;
} finally {
  try { browser('close'); }
  catch (error) { console.error('Browser cleanup failed:', error.message); process.exitCode = 1; }
}
