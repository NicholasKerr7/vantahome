/** Verify a screen-filling dashboard through its public browser UI. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:5177';
const session = process.env.VANTA_QA_SESSION ?? 'vanta-dashboard-qa';
const outputDirectory = process.env.VANTA_QA_OUTPUT_DIR;
const group = process.env.VANTA_QA_GROUP ?? 'all';
const manifest = JSON.parse(readFileSync(new URL('../src/house-manifest.json', import.meta.url), 'utf8'));
const assertions = [];
const profiles = [];
const retries = [];
const popup = '#quick-device-controls';
const sheet = '#full-device-controls[open]';
const light = '[data-device-hotspot="living-light"]';
let assets = { scripts: [], stylesheets: [] };
let collectingEvidence = false;

/** Use one isolated browser session and never retry mutating interactions. */
function browser(...args) {
  const options = {
    encoding: 'utf8', timeout: collectingEvidence ? 5000 : 30_000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '12000' },
  };
  let raw;
  try { raw = execFileSync('agent-browser', ['--session', session, '--json', ...args], options); }
  catch (error) {
    if (collectingEvidence || args[0] !== 'eval' || error.code !== 'ETIMEDOUT') throw error;
    retries.push({ expression: args[1], reason: error.code });
    raw = execFileSync('agent-browser', ['--session', session, '--json', ...args], options);
  }
  const response = JSON.parse(raw);
  assert.equal(response.success, true, response.error ?? args.join(' '));
  return response.data;
}

/** Read public DOM geometry, accessibility state, or persisted simulation settings. */
function evaluate(expression) {
  return browser('eval', expression).result;
}

/** Wait for a public condition with a deadline instead of an arbitrary sleep. */
function waitFor(expression) {
  assert.equal(evaluate(`new Promise((resolve, reject) => {
    const started = performance.now();
    function poll() {
      try {
        if (${expression}) { resolve(true); return; }
        if (performance.now() - started >= 12000) { reject(new Error('Timed out: ' + ${JSON.stringify(expression)})); return; }
        setTimeout(poll, 30);
      } catch (error) { reject(error); }
    }
    poll();
  })`), true, `Ready: ${expression}`);
}

/** Keep the report useful by naming each product invariant. */
function check(condition, description) {
  assertions.push({ description, passed: Boolean(condition) });
  assert.ok(condition, description);
}

/** Wait until the model is visible, loaded, and has projected device controls. */
function ready() {
  waitFor('!document.hidden && !document.querySelector(".scene-loading") && document.querySelector("#house-preview canvas")?.checkVisibility() && document.querySelectorAll("[data-device-hotspot]").length > 0');
}

/** Wait for resize observers and camera projections to settle before checking bounds. */
function settle(selector) {
  check(evaluate(`new Promise((resolve) => {
    let previous = ''; let stable = 0; let done = false;
    const timer = setTimeout(() => { done = true; resolve(false); }, 4000);
    function measure() {
      if (done) return;
      const boxes = [...document.querySelectorAll(${JSON.stringify(selector)})].map((element) => {
        const box = element.getBoundingClientRect();
        return [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 10));
      });
      const current = JSON.stringify(boxes);
      stable = previous === current ? stable + 1 : 0;
      previous = current;
      if (boxes.length && stable >= 6) { done = true; clearTimeout(timer); resolve(true); }
      else requestAnimationFrame(measure);
    }
    requestAnimationFrame(measure);
  })`), `${selector}: layout settles`);
}

/** Capture only browser-visible geometry and the application's persisted state. */
function snapshot() {
  return evaluate(`(() => {
    function rectangle(selector) {
      const element = document.querySelector(selector);
      if (!element) return null;
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      return { left, top, right, bottom, width, height, visible: element.checkVisibility() };
    }
    return {
      width: innerWidth, height: innerHeight, scrollX, scrollY,
      pageOverflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      pageOverflowY: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight,
      layout: document.querySelector('.device-viewport')?.dataset.layout,
      app: rectangle('.app-shell'), header: rectangle('.app-header'), house: rectangle('#house-preview'),
      canvas: rectangle('#house-preview canvas'), inspector: rectangle('#room-controls'),
      viewControls: rectangle('.view-controls'), presets: rectangle('.preset-grid'),
      dock: rectangle('.dashboard-dock'),
      state: JSON.parse(localStorage.getItem('vantahome-simulation-v2'))?.state,
      prompt: rectangle('#orientation-title'), focusedId: document.activeElement?.id,
      appInert: !!document.querySelector('.app-shell')?.closest('[inert]'),
      modals: [...document.querySelectorAll('dialog:modal')].map((element) => element.id),
      scrollLocked: document.documentElement.classList.contains('device-sheet-open'),
      hotspots: [...document.querySelectorAll('[data-device-hotspot]')].map((element) => ({
        id: element.dataset.deviceHotspot, rect: rectangle('[data-device-hotspot="' + element.dataset.deviceHotspot + '"]'),
      })),
    };
  })()`);
}

/** Check whether a visible element is completely within the browser viewport. */
function inViewport(rect, current) {
  return rect?.visible && rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.top >= -1 && rect.right <= current.width + 1 && rect.bottom <= current.height + 1;
}

/** Verify the page itself cannot spill or move, even when a modal is open. */
function pageFits(label) {
  const current = snapshot();
  check(current.pageOverflowX <= 1 && current.pageOverflowY <= 1, `${label}: no horizontal or vertical page overflow (${current.pageOverflowX}px, ${current.pageOverflowY}px)`);
  check(Math.abs(current.scrollX) <= 1 && Math.abs(current.scrollY) <= 1, `${label}: page stays at its fixed origin`);
  return current;
}

/** Check complete bounds and actual tap reachability without scrolling anything into view. */
function controlsFit(selector, label, minimumHeight = 44) {
  const controls = evaluate(`(() => [...document.querySelectorAll(${JSON.stringify(selector)})].filter((element) => element.checkVisibility()).map((element) => {
    const box = element.getBoundingClientRect();
    const x = box.x + box.width / 2; const y = box.y + box.height / 2;
    return { text: element.getAttribute('aria-label') || element.textContent.trim(), width: box.width, height: box.height,
      fits: box.left >= -1 && box.top >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1,
      reached: element.disabled || element.contains(document.elementFromPoint(x, y)) };
  }))()`);
  check(controls.length > 0, `${label}: controls are visible`);
  check(controls.every((control) => control.fits && control.height >= minimumHeight), `${label}: controls fit the screen with touch-sized targets (${JSON.stringify(controls)})`);
  check(controls.every((control) => control.reached), `${label}: every visible control has an unobstructed tap center (${JSON.stringify(controls)})`);
}

/** Save the current screen without scrolling or changing the layout under test. */
function screenshot(name) {
  if (!outputDirectory) return;
  mkdirSync(outputDirectory, { recursive: true });
  browser('screenshot', resolve(outputDirectory, `${name}.png`));
}

/** Preserve bounded evidence after both success and failure. */
function recordArtifacts(status, error) {
  if (!outputDirectory) return;
  mkdirSync(outputDirectory, { recursive: true });
  let current;
  let errors;
  let consoleMessages;
  try { current = snapshot(); } catch { current = null; }
  try { errors = browser('errors').errors; consoleMessages = browser('console').messages; } catch { errors = null; consoleMessages = null; }
  writeFileSync(resolve(outputDirectory, `dashboard-${group}.json`), JSON.stringify({
    status, group, url, assets, checks: assertions.filter((item) => item.passed).length,
    assertions, profiles, retries, error: error?.message, snapshot: current, errors, consoleMessages,
  }, null, 2));
  if (error) try { screenshot(`dashboard-${group}-failure`); } catch { console.error('Failure screenshot unavailable.'); }
}

/** Confirm each layout is useful at its actual screen size without page scrolling. */
function dashboardLayout(width, height, expectedLayout) {
  const label = `${width}×${height} ${expectedLayout}`;
  browser('set', 'viewport', String(width), String(height));
  waitFor(`document.querySelector('.device-viewport')?.dataset.layout === ${JSON.stringify(expectedLayout)}`);
  ready();
  settle('#house-preview, .view-controls, .preset-grid');
  const current = pageFits(label);
  profiles.push(current);
  check(inViewport(current.app, current) && current.app.height >= height - 24, `${label}: dashboard fills the screen height`);
  for (const name of ['header', 'house', 'canvas', 'viewControls', 'presets']) check(inViewport(current[name], current), `${label}: ${name} is fully within the viewport`);
  check(current.canvas.width >= (width < 360 ? 200 : 240) && current.canvas.height >= (height <= 600 ? 160 : 240), `${label}: model retains a useful interactive canvas`);
  controlsFit('.light-mode-switch button', `${label} day/night`);
  controlsFit('.floor-switch button', `${label} floor navigation`);
  controlsFit('.view-controls button', `${label} view modes`);
  controlsFit('.preset-grid button', `${label} scene presets`);
  check(evaluate('[...document.querySelectorAll(".view-controls button")].filter((button) => button.checkVisibility()).length === 3 && [...document.querySelectorAll(".preset-grid button")].filter((button) => button.checkVisibility()).length === 4'), `${label}: all three view modes and four presets remain available`);
  if (expectedLayout === 'tablet-landscape') {
    check(inViewport(current.inspector, current) && current.inspector.left >= current.house.right - 1, `${label}: full inspector fits to the right of the model`);
    controlsFit('.dashboard-room-list button', `${label} room rail`);
    controlsFit('.dashboard-pager button', `${label} room pager`);
  } else {
    check(!current.inspector?.visible, `${label}: portrait inspector is hidden`);
    check(inViewport(current.dock, current) && current.dock.top >= height * 0.65, `${label}: fixed lower navigation is within thumb reach`);
    controlsFit('.dashboard-dock button', `${label} lower navigation`);
    controlsFit('.dashboard-room-select', `${label} room selector`);
  }
  check(evaluate('document.querySelector(".app-shell").classList.contains("reduce-motion") && getComputedStyle(document.querySelector(".device-hotspot")).transitionDuration === "0s"'), `${label}: reduced motion disables hotspot transitions`);
  screenshot(`dashboard-${width}x${height}`);
  console.log(`PASS dashboard ${label}`);
}

/** Open a room hotspot only after its projected DOM has finished settling. */
function openLightQuickControls() {
  ready();
  browser('wait', light);
  settle(light);
  browser('click', light);
  browser('wait', popup);
  const current = pageFits('opening quick controls');
  check(current.state.selectedDevice === 'living-light' && current.state.roomId === 'living', 'quick controls match the selected room and device');
  controlsFit(`${popup} button`, 'quick controls');
}

/** Exercise power and full controls through real portrait hotspot actions. */
function portraitControls(width, height, layout) {
  browser('set', 'viewport', String(width), String(height));
  waitFor(`document.querySelector('.device-viewport')?.dataset.layout === ${JSON.stringify(layout)}`);
  openLightQuickControls();
  const before = snapshot().state.deviceStates;
  browser('click', `${popup} .quick-device-toggle`);
  const after = snapshot().state.deviceStates;
  check(after['living-light'].on !== before['living-light'].on, `${layout}: quick control toggles power`);
  check(Object.entries(before).every(([id, value]) => id === 'living-light' || JSON.stringify(value) === JSON.stringify(after[id])), `${layout}: quick toggle preserves every other device`);
  browser('click', `${popup} .quick-device-full`);
  browser('wait', sheet);
  check(evaluate('document.querySelector("#full-device-controls").matches(":modal") && document.activeElement?.id === "sheet-device-control-title"'), `${layout}: full controls are native modal and receive accessible focus`);
  const modalBounds = evaluate('(() => { const r = document.querySelector("#full-device-controls").getBoundingClientRect(); return { left:r.left, top:r.top, right:r.right, bottom:r.bottom }; })()');
  check(modalBounds.left >= -1 && modalBounds.top >= -1 && modalBounds.right <= width + 1 && modalBounds.bottom <= height + 1, `${layout}: full controls fit inside the viewport`);
  check(evaluate('getComputedStyle(document.querySelector("#full-device-controls")).scrollBehavior === "auto" && getComputedStyle(document.querySelector("#full-device-controls")).animationName === "none"'), `${layout}: full controls respect reduced motion`);
  pageFits(`${layout} full controls`);
  screenshot(`${layout}-full-controls`);
  browser('press', 'Escape');
  waitFor('!document.querySelector("dialog:modal") && !document.documentElement.classList.contains("device-sheet-open")');
  check(evaluate('document.activeElement?.getAttribute("data-device-hotspot")') === 'living-light', `${layout}: dismissal restores hotspot focus`);
  pageFits(`${layout} full controls dismissed`);
  console.log(`PASS ${layout} quick/full controls`);
}

/** Verify that a phone rotation dismisses modality while preserving all settings. */
function phoneRotation() {
  browser('set', 'viewport', '390', '844');
  waitFor('document.querySelector(".device-viewport")?.dataset.layout === "mobile-portrait"');
  openLightQuickControls();
  browser('click', `${popup} .quick-device-full`);
  browser('wait', sheet);
  browser('focus', '#sheet-level-living-light');
  browser('press', 'Home');
  for (let index = 0; index < 3; index += 1) browser('press', 'PageUp');
  for (let index = 0; index < 7; index += 1) browser('press', 'ArrowRight');
  const before = snapshot();
  check(before.state.deviceStates['living-light'].level === 37, 'rotation begins with a distinct saved brightness setting');
  browser('set', 'viewport', '844', '390');
  waitFor('document.querySelector(".device-viewport")?.dataset.layout === "mobile-landscape" && document.activeElement?.id === "orientation-title"');
  const paused = pageFits('phone landscape prompt');
  check(inViewport(paused.prompt, paused) && paused.appInert && !paused.app?.visible && !paused.canvas?.visible, 'phone landscape displays the prompt and hides/inerts the dashboard');
  check(paused.modals.length === 0 && !paused.scrollLocked && !evaluate('!!document.querySelector("#full-device-controls")'), 'rotation clears full controls, native modality, and scroll lock');
  check(JSON.stringify(paused.state) === JSON.stringify(before.state), 'phone rotation preserves every room, view, device, and environment setting');
  screenshot('dashboard-phone-landscape');
  browser('set', 'viewport', '390', '844');
  waitFor('document.querySelector(".device-viewport")?.dataset.layout === "mobile-portrait"');
  ready();
  settle(light);
  const returned = pageFits('phone portrait restored');
  check(JSON.stringify(returned.state) === JSON.stringify(before.state), 'returning upright restores the exact saved simulation');
  openLightQuickControls();
  browser('click', `${popup} .quick-device-toggle`);
  const toggled = snapshot().state.deviceStates['living-light'];
  check(toggled.on !== before.state.deviceStates['living-light'].on && toggled.level === 37, 'restored quick controls toggle power and preserve brightness');
  browser('click', `${popup} .quick-device-full`);
  browser('wait', sheet);
  check(evaluate('document.querySelector("#sheet-level-living-light").value') === '37', 'restored full controls display the saved brightness');
  browser('press', 'Escape');
  waitFor('!document.querySelector("dialog:modal") && !document.documentElement.classList.contains("device-sheet-open")');
  pageFits('phone rotation completed');
  screenshot('dashboard-phone-restored');
  console.log('PASS dashboard phone rotation');
}

/** Open the shared home browser through the action visible in the current layout. */
function openLibrary(view) {
  const portrait = snapshot().layout !== 'tablet-landscape';
  const selector = view === 'settings' ? '[aria-label="Home settings and help"]'
    : view === 'rooms' ? portrait ? '.dashboard-room-select' : '.dashboard-browse'
      : portrait ? '.dashboard-dock button:last-child' : '.dashboard-browse-devices';
  browser('click', selector);
  waitFor('document.querySelector("#dashboard-library")?.matches(":modal")');
  check(evaluate('document.activeElement?.id') === 'dashboard-library-title', `${view}: browser heading receives focus`);
  controlsFit('#dashboard-library [aria-label="Close home browser"]', `${view} browser dismissal`);
  pageFits(`${view} browser open`);
}

/** Choose a manifest room through the same searchable browser visitors use. */
function chooseRoom(roomId) {
  const room = manifest.rooms.find((item) => item.id === roomId);
  assert.ok(room, `Room exists: ${roomId}`);
  openLibrary('rooms');
  browser('fill', '#room-search', room.name);
  browser('wait', `[data-library-room="${roomId}"]`);
  browser('click', `[data-library-room="${roomId}"]`);
  waitFor(`!document.querySelector('dialog:modal') && JSON.parse(localStorage.getItem('vantahome-simulation-v2'))?.state?.roomId === ${JSON.stringify(roomId)}`);
  ready();
  pageFits(`${roomId} room selected`);
}

/** Restore the common room used by the focused control and rotation checks. */
function chooseLiving() {
  chooseRoom('living');
}

/** Prove the landscape rail exposes every floor room and all devices in this room. */
function railPagination() {
  browser('set', 'viewport', '960', '600');
  waitFor('document.querySelector(".device-viewport")?.dataset.layout === "tablet-landscape"');
  chooseLiving();
  const seenRooms = [];
  const expectedRooms = manifest.rooms.filter((room) => room.floor === 'ground' || room.outdoor).map((room) => room.id).sort();
  for (let page = 0; page < 10; page += 1) {
    controlsFit('.dashboard-room-list button', `room rail page ${page + 1}`);
    controlsFit('.dashboard-pager button', `room rail pagination ${page + 1}`);
    const current = evaluate(`({ ids:[...document.querySelectorAll('.dashboard-room-list [data-room-id]')].map((element) => element.dataset.roomId), page:document.querySelector('[data-room-page]').textContent, last:document.querySelector('[aria-label="Next room page"]').disabled })`);
    seenRooms.push(...current.ids);
    pageFits(`room rail page ${page + 1}`);
    if (current.last) break;
    browser('click', '[aria-label="Next room page"]');
    waitFor(`document.querySelector('[data-room-page]').textContent !== ${JSON.stringify(current.page)}`);
  }
  check(JSON.stringify(seenRooms.sort()) === JSON.stringify(expectedRooms), 'landscape room pages expose every ground-floor and outdoor room exactly once');
  const seenDevices = [];
  const expectedDevices = manifest.devices.filter((device) => device.roomId === 'living').map((device) => device.name).sort();
  for (let page = 0; page < 10; page += 1) {
    controlsFit('.dashboard-device-row', `room devices page ${page + 1}`);
    controlsFit('.dashboard-device-footer button', `room device navigation ${page + 1}`);
    const current = evaluate(`({ names:[...document.querySelectorAll('.dashboard-device-row [title]')].map((element) => element.title), last:document.querySelector('[aria-label="Next devices"]').disabled })`);
    seenDevices.push(...current.names);
    pageFits(`room devices page ${page + 1}`);
    if (current.last) break;
    browser('click', '[aria-label="Next devices"]');
    waitFor(`JSON.stringify([...document.querySelectorAll('.dashboard-device-row [title]')].map((element) => element.title)) !== ${JSON.stringify(JSON.stringify(current.names))}`);
  }
  check(JSON.stringify(seenDevices.sort()) === JSON.stringify(expectedDevices), 'landscape device pages expose every living-room device exactly once');
  console.log('PASS landscape room/device pagination');
}

/** Visit every inventory page, checking that rows are reachable without scroll clipping. */
function libraryPagination(view) {
  openLibrary(view);
  const attribute = view === 'rooms' ? 'data-library-room' : 'data-library-device';
  const expected = (view === 'rooms' ? manifest.rooms : manifest.devices).map((item) => item.id).sort();
  const seen = [];
  for (let page = 0; page < 30; page += 1) {
    controlsFit(`#dashboard-library [${attribute}]`, `${view} results page ${page + 1}`);
    controlsFit('#dashboard-library .library-pagination button', `${view} page navigation ${page + 1}`);
    check(evaluate('(() => { const list=document.querySelector(".library-results"); const modal=document.querySelector("#dashboard-library"); return list.scrollHeight <= list.clientHeight + 1 && list.scrollWidth <= list.clientWidth + 1 && modal.scrollHeight <= modal.clientHeight + 1; })()'), `${view} page ${page + 1}: navigation is paginated without a clipped or scrolling result list`);
    const current = evaluate(`({ ids:[...document.querySelectorAll('#dashboard-library [${attribute}]')].map((element) => element.getAttribute('${attribute}')), page:document.querySelector('[data-library-page]').textContent, last:document.querySelector('[aria-label="Next results page"]').disabled })`);
    seen.push(...current.ids);
    pageFits(`${view} page ${page + 1}`);
    if (page === 0) screenshot(`dashboard-${view}-first-page`);
    if (current.last) break;
    browser('click', '[aria-label="Next results page"]');
    waitFor(`document.querySelector('[data-library-page]').textContent !== ${JSON.stringify(current.page)}`);
  }
  check(JSON.stringify(seen.sort()) === JSON.stringify(expected), `${view}: all ${expected.length} entries are reachable exactly once through pagination`);
  const search = view === 'rooms' ? '#room-search' : '#device-search';
  browser('fill', search, 'zz-no-matching-home-item');
  waitFor('!!document.querySelector(".library-empty")');
  check(evaluate(`document.querySelector('[aria-label="Previous results page"]').disabled && document.querySelector('[aria-label="Next results page"]').disabled`), `${view}: empty search resets and disables both pagination actions`);
  pageFits(`${view} empty search`);
  browser('click', '[aria-label="Close home browser"]');
  waitFor('!document.querySelector("dialog:modal")');
  console.log(`PASS ${view} complete inventory pagination`);
}

/** A device selected from the inventory should open its own full controls directly. */
function libraryDeviceSelection() {
  openLibrary('devices');
  browser('fill', '#device-search', 'Solar battery bank');
  browser('wait', '[data-library-device="utility-battery"]');
  browser('click', '[data-library-device="utility-battery"]');
  browser('wait', sheet);
  const current = pageFits('device selected from library');
  check(current.modals.length === 1 && current.modals[0] === 'full-device-controls', 'inventory selection replaces the browser with a single full-control sheet');
  check(current.state.roomId === 'utility' && current.state.selectedDevice === 'utility-battery', 'inventory selection navigates to the correct room and device');
  check(evaluate('document.querySelector("#sheet-device-control-title").textContent') === 'Solar battery bank', 'full controls identify the selected inventory device');
  browser('press', 'Escape');
  waitFor('!document.querySelector("dialog:modal")');
  chooseLiving();
}

/** Keep landscape primary controls immediate and detailed controls one action away. */
function landscapeControls() {
  browser('set', 'viewport', '1024', '768');
  waitFor('document.querySelector(".device-viewport")?.dataset.layout === "tablet-landscape"');
  chooseLiving();
  settle(light);
  browser('click', light);
  waitFor('document.activeElement?.id === "device-control-title"');
  check(!evaluate('!!document.querySelector("#quick-device-controls")'), 'landscape hotspot uses the visible inspector without a duplicate quick popup');
  controlsFit('.dashboard-primary-actions button', 'landscape primary/full controls');
  const before = snapshot().state.deviceStates['living-light'].on;
  browser('click', '.dashboard-primary-action');
  check(snapshot().state.deviceStates['living-light'].on !== before, 'landscape primary action toggles the selected device');
  controlsFit('#dashboard-level-living-light', 'landscape brightness slider');
  browser('focus', '#dashboard-level-living-light');
  browser('press', 'Home');
  for (let index = 0; index < 5; index += 1) browser('press', 'PageUp');
  check(snapshot().state.deviceStates['living-light'].level === 50, 'landscape brightness slider saves a precise level');
  browser('click', '.dashboard-full-controls');
  browser('wait', sheet);
  pageFits('landscape full controls');
  check(evaluate('document.querySelector("#sheet-device-control-title").textContent') === 'Pendant light', 'landscape full controls open the selected light');
  check(evaluate('document.querySelector("#sheet-level-living-light").value') === '50', 'full controls retain the inline brightness setting');
  browser('press', 'Escape');
  waitFor('!document.querySelector("dialog:modal")');
  pageFits('landscape controls dismissed');
  console.log('PASS landscape selected-device controls');
}

/** Keep motion preferences, help, and reset reachable on the shortest phone layout. */
function settingsControls() {
  browser('set', 'viewport', '320', '568');
  waitFor('document.querySelector(".device-viewport")?.dataset.layout === "mobile-portrait"');
  openLibrary('settings');
  controlsFit('#dashboard-library .dashboard-preference', 'phone settings');
  check(evaluate('document.querySelector(".dashboard-preference[aria-pressed]").disabled && document.querySelector(".dashboard-preference[aria-pressed]").getAttribute("aria-pressed") === "true"'), 'settings preserve the system reduced-motion preference');
  pageFits('phone settings');
  screenshot('dashboard-phone-settings');
  browser('click', '[aria-label="Close home browser"]');
  waitFor('!document.querySelector("dialog:modal")');
  browser('click', '[aria-label="Night lighting preview"]');
  check(snapshot().state.night && evaluate(`document.querySelector('[aria-label="Night lighting preview"]').getAttribute('aria-pressed')`) === 'true', 'night control changes the persisted environment and visible pressed state');
  browser('click', '[aria-label="Daylight preview"]');
  check(!snapshot().state.night, 'daylight control restores the daytime environment');
  pageFits('phone lighting actions');
}

/** Dense rooms must keep individual hotspot centers reachable on the shortest phone. */
function densePhoneHotspots() {
  browser('set', 'viewport', '320', '568');
  waitFor('document.querySelector(".device-viewport")?.dataset.layout === "mobile-portrait"');
  for (const roomId of ['living', 'kitchen', 'utility']) {
    chooseRoom(roomId);
    if (roomId === 'utility') {
      browser('click', '.view-controls button:nth-child(3)');
      ready();
    }
    settle('[data-device-hotspot]');
    const targets = evaluate(`[...document.querySelectorAll('[data-device-hotspot]')].map((element) => {
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2; const y = box.top + box.height / 2;
      return { id:element.dataset.deviceHotspot, x, y, width:box.width, height:box.height,
        reachable:element.checkVisibility() && document.elementFromPoint(x,y)?.closest('[data-device-hotspot]')?.dataset.deviceHotspot === element.dataset.deviceHotspot };
    })`);
    const expected = manifest.devices.filter((device) => device.roomId === roomId && device.id !== 'entry-gate').map((device) => device.id).sort();
    check(JSON.stringify(targets.map((target) => target.id).sort()) === JSON.stringify(expected), `320×568 ${roomId}: every room device has a hotspot`);
    check(targets.every((target) => target.reachable), `320×568 ${roomId}: every hotspot has its own reachable center (${JSON.stringify(targets.filter((target) => !target.reachable))})`);
    const crowded = targets.flatMap((target, index) => targets.slice(index + 1).filter((other) => Math.hypot(target.x - other.x, target.y - other.y) < (target.width + other.width) / 2 + 2).map((other) => [target.id, other.id]));
    check(crowded.length === 0, `320×568 ${roomId}: touch targets do not overlap (${JSON.stringify(crowded)})`);
    pageFits(`320×568 ${roomId} hotspots`);
    screenshot(`dashboard-dense-${roomId}`);
  }
  chooseLiving();
  console.log('PASS dense phone hotspots');
}

/** Simulate a keyboard height change without mistaking it for phone rotation. */
function keyboardHeight() {
  browser('set', 'viewport', '390', '844');
  waitFor('document.querySelector(".device-viewport")?.dataset.layout === "mobile-portrait"');
  const before = snapshot().state;
  openLibrary('rooms');
  browser('focus', '#room-search');
  browser('set', 'viewport', '390', '300');
  waitFor('document.querySelector("#dashboard-library")?.matches(":modal") && document.querySelector(".device-viewport")?.dataset.layout === "mobile-portrait"');
  browser('fill', '#room-search', 'Energy pavilion');
  browser('wait', '[data-library-room="utility"]');
  pageFits('simulated phone keyboard search');
  check(!evaluate('!!document.querySelector("#orientation-title")'), 'simulated keyboard height preserves portrait without an orientation prompt');
  screenshot('dashboard-keyboard-search');
  browser('click', '[aria-label="Close home browser"]');
  waitFor('!document.querySelector("dialog:modal")');
  settle('.app-header');
  check(snapshot().layout === 'mobile-portrait', 'dismissing search before keyboard height restores does not show a rotation prompt');
  browser('set', 'viewport', '390', '844');
  ready();
  pageFits('phone keyboard height restored');
  check(JSON.stringify(snapshot().state) === JSON.stringify(before), 'search and keyboard dismissal preserve all simulation settings');
  console.log('PASS simulated phone keyboard resize (physical keyboards unverified)');
}

try {
  assert.ok(['all', 'layout', 'navigation', 'controls', 'rotation', 'smoke', 'hotspots', 'keyboard'].includes(group), `Unknown QA group: ${group}`);
  browser('open', 'about:blank');
  browser('set', 'viewport', '1024', '768');
  browser('set', 'media', 'light', 'reduced-motion');
  browser('open', url);
  const tabId = browser('tab', 'list').tabs.find((tab) => tab.active)?.tabId;
  assert.ok(tabId, 'The isolated QA tab is available');
  browser('tab', tabId);
  ready();
  assets = evaluate('({ scripts:[...document.scripts].map((script) => script.src).filter(Boolean), stylesheets:[...document.querySelectorAll("link[rel=stylesheet]")].map((link) => link.href) })');
  openLibrary('settings');
  browser('click', '[aria-label="Reset simulation to Morning"]');
  waitFor('!document.querySelector("dialog:modal")');

  const cases = [
    [1024, 768, 'tablet-landscape'], [1366, 1024, 'tablet-landscape'], [960, 600, 'tablet-landscape'],
    [600, 960, 'tablet-portrait'], [768, 1024, 'tablet-portrait'], [834, 1194, 'tablet-portrait'], [1024, 1366, 'tablet-portrait'],
    [390, 844, 'mobile-portrait'], [320, 568, 'mobile-portrait'], [1920, 1080, 'tablet-landscape'],
  ];
  if (['all', 'layout', 'smoke'].includes(group)) {
    const selectedCases = group === 'smoke' ? cases.filter(([width, height]) => (width === 1024 && height === 768) || (width === 834 && height === 1194) || (width === 390 && height === 844) || width === 320) : cases;
    for (const [width, height, layout] of selectedCases) dashboardLayout(width, height, layout);
  }
  if (['all', 'navigation'].includes(group)) {
    railPagination();
    browser('set', 'viewport', '320', '568');
    waitFor('document.querySelector(".device-viewport")?.dataset.layout === "mobile-portrait"');
    libraryPagination('rooms');
    libraryPagination('devices');
    libraryDeviceSelection();
    settingsControls();
  }
  if (['all', 'hotspots'].includes(group)) densePhoneHotspots();
  if (['all', 'keyboard'].includes(group)) keyboardHeight();
  if (['all', 'controls'].includes(group)) {
    landscapeControls();
    portraitControls(834, 1194, 'tablet-portrait');
    portraitControls(390, 844, 'mobile-portrait');
  }
  if (['all', 'rotation'].includes(group)) phoneRotation();
  check(browser('errors').errors.length === 0, 'no uncaught page errors');
  check(browser('console').messages.filter((message) => message.type === 'error' || message.level === 'error').length === 0, 'no console errors');
  recordArtifacts('passed');
  console.log(`PASS ${assertions.length} fixed-dashboard checks in ${group}.`);
} catch (error) {
  collectingEvidence = true;
  recordArtifacts('failed', error);
  throw error;
} finally {
  try { browser('close'); }
  catch (error) { console.error('Browser cleanup failed:', error.message); process.exitCode = 1; }
}
