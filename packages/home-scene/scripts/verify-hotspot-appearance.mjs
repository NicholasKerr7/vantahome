/** Guard hotspot power appearance through public controls in an isolated browser. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:5177/';
const session = process.env.VANTA_QA_SESSION ?? 'vanta-hotspot-appearance-qa';
const requestedGroup = process.env.VANTA_QA_GROUP;
const artifactDirectory = process.env.VANTA_QA_OUTPUT_DIR;
const { devices } = JSON.parse(readFileSync(new URL('../src/house-manifest.json', import.meta.url), 'utf8'));
const observations = [];
let checks = 0;
let collectingFailureEvidence = false;

/** Keep browser actions separate from the owner's preview and avoid shell interpolation. */
function browser(...args) {
  const options = {
    encoding: 'utf8', timeout: collectingFailureEvidence ? 5000 : 30_000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: '12000' },
  };
  let output;
  try { output = execFileSync('agent-browser', ['--session', session, '--json', ...args], options); }
  catch (error) {
    // The CLI can lose a read response; retry only observations, never user actions.
    if (collectingFailureEvidence || args[0] !== 'eval' || error.code !== 'ETIMEDOUT') throw error;
    console.log('NOTE: retrying one timed-out read-only browser eval.');
    output = execFileSync('agent-browser', ['--session', session, '--json', ...args], options);
  }
  const result = JSON.parse(output);
  assert.equal(result.success, true, result.error ?? args.join(' '));
  return result.data;
}

/** Read rendered DOM and computed styles without changing app state or importing its store. */
function evaluate(expression) { return browser('eval', expression).result; }

/** Count product expectations while preserving a specific failure message. */
function check(condition, description) {
  assert.ok(condition, description);
  checks += 1;
}

/** Poll public UI readiness rather than relying on an arbitrary loading delay. */
function waitFor(expression) {
  check(evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 20000;
    function poll() {
      if (${expression}) return resolve(true);
      if (performance.now() >= deadline) return reject(new Error('UI did not settle: ' + ${JSON.stringify(expression)}));
      setTimeout(poll, 40);
    }
    poll();
  })`), `Ready: ${expression}`);
}

/** Foreground this isolated tab so the scene can resume animation-frame updates. */
function activateTab() {
  const tab = browser('tab', 'list').tabs.find((candidate) => candidate.active);
  assert.ok(tab?.tabId, 'The isolated browser tab exists');
  browser('tab', tab.tabId);
  waitFor('!document.hidden && document.querySelector(".reset-view-control")?.disabled === false');
}

/** Locate a catalog device through the visible device browser and dismiss its full sheet. */
function selectDevice(id, landscape) {
  const device = devices.find((candidate) => candidate.id === id);
  assert.ok(device, `${id}: catalog fixture exists`);
  browser('click', landscape ? '.dashboard-browse-devices' : '.dashboard-dock button:last-child');
  browser('wait', '#device-search');
  browser('fill', '#device-search', device.name);
  for (let page = 0; page < 30; page += 1) {
    if (evaluate(`!!document.querySelector('[data-library-device="${id}"]')`)) break;
    check(evaluate('document.querySelector("[aria-label=\"Next results page\"]").disabled === false'), `${id}: library has another results page`);
    browser('click', '[aria-label="Next results page"]');
  }
  browser('click', `[data-library-device="${id}"]`);
  browser('wait', '#full-device-controls[open]');
  browser('press', 'Escape');
  waitFor(`!document.querySelector('#full-device-controls[open]') && !!document.querySelector('[data-device-hotspot="${id}"]') && document.querySelector('.reset-view-control')?.disabled === false`);
  settleAnchors();
}

/** Allow projected controls to reach stable positions after room and viewport changes. */
function settleAnchors() {
  check(evaluate(`new Promise((resolve) => {
    let previous = ''; let stable = 0; let finished = false;
    const timer = setTimeout(() => { finished = true; resolve(false); }, 5000);
    function measure() {
      if (finished) return;
      const positions = [...document.querySelectorAll('[data-device-hotspot]')].map((element) => {
        const box = element.getBoundingClientRect();
        return [element.dataset.deviceHotspot, Math.round(box.x * 10), Math.round(box.y * 10)];
      });
      const current = JSON.stringify(positions);
      stable = current === previous ? stable + 1 : 0;
      previous = current;
      if (positions.length && stable >= 6) { finished = true; clearTimeout(timer); resolve(true); }
      else requestAnimationFrame(measure);
    }
    requestAnimationFrame(measure);
  })`), 'Projected controls settle before checking their position');
}

/** Capture desktop surfaces and mobile pseudo-element discs with their accessible state. */
function appearance(id, label) {
  const result = evaluate(`(() => {
    const element = document.querySelector('[data-device-hotspot="${id}"]');
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const labelElement = element.querySelector('.device-hotspot-label');
    const labelBox = labelElement.getBoundingClientRect();
    const sceneBox = document.querySelector('#house-preview').getBoundingClientRect();
    const layer = element.closest('.device-hotspot-layer');
    const read = (pseudo) => {
      const value = getComputedStyle(element, pseudo);
      return { background: value.backgroundColor, shadow: value.boxShadow, content: value.content, display: value.display };
    };
    return {
      id: element.dataset.deviceHotspot, active: element.classList.contains('is-on'),
      selected: element.classList.contains('is-selected'), expanded: element.getAttribute('aria-expanded'),
      monitoring: element.dataset.deviceMonitoring, tone: element.dataset.deviceTone,
      name: element.getAttribute('aria-label'), stateLabel: element.querySelector('.device-hotspot-state')?.textContent,
      accent: style.getPropertyValue('--accent-rgb').trim(), alarmColor: style.getPropertyValue('--device-alarm').trim(),
      surface: read(null), before: read('::before'), after: read('::after'),
      labelOpacity: Number(getComputedStyle(labelElement).opacity), hovered: element.matches(':hover'),
      labelFits: labelBox.left >= sceneBox.left - 1 && labelBox.right <= sceneBox.right + 1 && labelBox.top >= sceneBox.top - 1 && labelBox.bottom <= sceneBox.bottom + 1,
      layerZIndex: layer ? Number(getComputedStyle(layer).zIndex) : null,
      otherLayerMax: Math.max(0, ...[...document.querySelectorAll('.device-hotspot-layer')].filter((candidate) => candidate !== layer).map((candidate) => Number(getComputedStyle(candidate).zIndex))),
      focusVisible: element.matches(':focus-visible'), outlineColor: style.outlineColor, outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth), transition: style.transitionDuration,
      x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width, height: box.height,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      reachable: element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
      popup: !!document.querySelector('#quick-device-controls'),
    };
  })()`);
  observations.push({ label, ...result });
  // Projected transforms can produce subpixel rounding such as 43.999984px.
  check(result.width >= 43.99 && result.height >= 43.99, `${label}: keeps a 44px touch target`);
  check(!result.overflow, `${label}: does not create horizontal overflow`);
  return result;
}

/** Decode browser-normalized colors so accent fills and colored shadows can be checked. */
function colors(value) {
  if (/^#[\da-f]{6}$/i.test(value)) return [[1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16))];
  return [...value.matchAll(/rgba?\(([^)]+)\)/g)].map((match) => match[1].split(/[,\s/]+/).filter(Boolean).map(Number));
}

/** Inspect only painted surfaces: mobile buttons delegate their fill to ::before. */
function visibleSurfaces(state) {
  return [state.surface, ...(state.before.content !== 'none' && state.before.display !== 'none' ? [state.before] : [])];
}

/** Reject a powered fill or tinted glow while allowing the app's dark themed surface. */
function inactiveAppearance(state, label, expectedLabel = 'Off') {
  const accent = state.accent.split(/\s+/).map(Number);
  const surfaces = visibleSurfaces(state);
  check(!state.active, `${label}: does not advertise active power`);
  check(surfaces.every((surface) => colors(surface.background).every((color) =>
    color[3] === 0 || color.slice(0, 3).some((channel, index) => Math.abs(channel - accent[index]) > 1))), `${label}: has no bright accent fill`);
  check(surfaces.every((surface) => colors(surface.shadow).every((color) =>
    Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) <= 1)), `${label}: has no tinted glow`);
  check(state.name.includes(`: ${expectedLabel}.`), `${label}: accessible name reports ${expectedLabel}`);
  check(state.stateLabel === expectedLabel, `${label}: visible hotspot label reports ${expectedLabel}`);
}

/** Verify selection and control interactions do not move a projected hotspot. */
function samePosition(before, after, label) {
  check(Math.abs(before.x - after.x) <= 1 && Math.abs(before.y - after.y) <= 1, `${label}: target stays at the same scene position`);
}

/** Open the actual quick panel or use the visible desktop inspector. */
function openControls(id, landscape) {
  browser('click', `[data-device-hotspot="${id}"]`);
  if (!landscape) browser('wait', '#quick-device-controls');
  check(evaluate('!!document.querySelector("#quick-device-controls")') === !landscape, `${id}: uses the expected responsive controls`);
}

/** Dismiss quick controls without clearing the selected device. */
function dismissControls(landscape) {
  if (!landscape) {
    browser('press', 'Escape');
    waitFor('!document.querySelector("#quick-device-controls")');
  }
}

/** Change power only through the rendered device switch. */
function setPower(on, landscape) {
  const selector = landscape ? '.dashboard-primary-action[role="switch"]' : '.quick-device-toggle[role="switch"]';
  if (evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-checked')`) !== String(on)) browser('click', selector);
  waitFor(`document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-checked') === '${on}'`);
}

/** Select another real hotspot to check the target's resting, unselected appearance. */
function deselectDevice(id, landscape) {
  const sibling = evaluate(`[...document.querySelectorAll('[data-device-hotspot]')].find((element) => element.dataset.deviceHotspot !== '${id}')?.dataset.deviceHotspot`);
  assert.ok(sibling, `${id}: another room hotspot is available`);
  openControls(sibling, landscape);
  dismissControls(landscape);
}

/** Exercise Off/On, selection, expansion, keyboard focus, reopening and reload persistence. */
function verifyPowerDevice(id, width, height) {
  const landscape = width > height;
  const label = `${width}×${height} ${id}`;
  selectDevice(id, landscape);
  openControls(id, landscape);
  setPower(false, landscape);
  const offExpanded = appearance(id, `${label} Off controls`);
  inactiveAppearance(offExpanded, `${label} Off controls`);
  check(offExpanded.selected && (landscape || offExpanded.expanded === 'true'), `${label}: controls keep selection and expansion separate from power`);

  setPower(true, landscape);
  const onExpanded = appearance(id, `${label} On controls`);
  check(onExpanded.active && onExpanded.stateLabel === 'On' && onExpanded.name.includes(': On.'), `${label}: On power updates visual and textual state`);
  check(JSON.stringify(visibleSurfaces(onExpanded)) !== JSON.stringify(visibleSurfaces(offExpanded)), `${label}: On and Off surfaces differ`);
  samePosition(offExpanded, onExpanded, `${label} power toggle`);
  dismissControls(landscape);
  const onSelected = appearance(id, `${label} On selected`);
  check(onSelected.active && onSelected.selected, `${label}: selected On stays active after dismissal`);
  samePosition(offExpanded, onSelected, `${label} dismissal`);
  deselectDevice(id, landscape);
  const onResting = appearance(id, `${label} On unselected`);
  check(onResting.active && !onResting.selected, `${label}: unselected On keeps its active appearance`);

  openControls(id, landscape);
  setPower(false, landscape);
  dismissControls(landscape);
  const offSelected = appearance(id, `${label} Off selected`);
  inactiveAppearance(offSelected, `${label} Off selected`);
  check(offSelected.selected, `${label}: Off remains selected without looking powered`);
  samePosition(offExpanded, offSelected, `${label} Off selected`);
  browser('focus', `[data-device-hotspot="${id}"]`);
  browser('press', 'Tab');
  browser('press', 'Shift+Tab');
  const focused = appearance(id, `${label} Off keyboard focus`);
  inactiveAppearance(focused, `${label} Off keyboard focus`);
  check(focused.focusVisible && focused.outlineWidth >= 2 && focused.outlineStyle !== 'none', `${label}: keyboard focus has a visible outline`);
  check(colors(focused.outlineColor).every((color) => Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) <= 1), `${label}: focus outline remains neutral`);
  check(focused.transition.split(',').every((duration) => parseFloat(duration) === 0), `${label}: reduced motion removes hotspot transitions`);
  deselectDevice(id, landscape);
  const offResting = appearance(id, `${label} Off unselected`);
  inactiveAppearance(offResting, `${label} Off unselected`);
  check(!offResting.selected, `${label}: tests the unselected Off state`);
  openControls(id, landscape);
  inactiveAppearance(appearance(id, `${label} Off reopened`), `${label} Off reopened`);
  dismissControls(landscape);
  browser('reload');
  activateTab();
  waitFor(`!!document.querySelector('[data-device-hotspot="${id}"]')`);
  settleAnchors();
  inactiveAppearance(appearance(id, `${label} Off reloaded`), `${label} Off reloaded`);
  openControls(id, landscape);
  inactiveAppearance(appearance(id, `${label} Off reopened after reload`), `${label} Off reopened after reload`);
  dismissControls(landscape);
  console.log(`PASS ${label}: Off/On, selection, expansion, focus, dismissal, reopening and reload`);
}

/** Require a healthy monitor to remain identifiable without looking like a powered light. */
function verifyMonitor(width, height) {
  const landscape = width > height;
  selectDevice('living-air', landscape);
  openControls('living-air', landscape);
  const monitor = appearance('living-air', `${width}×${height} monitoring`);
  inactiveAppearance(monitor, `${width}×${height} monitoring`, 'Monitoring sample');
  check(monitor.monitoring === 'true', `${width}: healthy monitor exposes its distinct monitoring state`);
  check(monitor.after.content !== 'none' && monitor.after.display !== 'none', `${width}: monitoring has a steady indicator`);
  dismissControls(landscape);
  console.log(`PASS ${width}×${height}: monitor stays neutral and identifiable`);
}

/** Save visible evidence without changing the state currently under inspection. */
function screenshot(name) {
  if (!artifactDirectory) return;
  mkdirSync(artifactDirectory, { recursive: true });
  browser('screenshot', resolve(artifactDirectory, `${name}.png`));
}

/** Model an outside pointer dismissal, which must not leave a passive mobile label visible. */
function verifyPassiveSelection(width, height) {
  browser('set', 'viewport', String(width), String(height));
  activateTab();
  selectDevice('family-tv', false);
  openControls('family-tv', false);
  setPower(false, false);
  const expanded = appearance('family-tv', `${width}×${height} TV Off expanded label`);
  inactiveAppearance(expanded, `${width}×${height} TV Off expanded label`);
  check(expanded.labelOpacity === 1 && expanded.labelFits, `${width}: expanded Off label is visible inside the scene`);
  check(expanded.layerZIndex > expanded.otherLayerMax, `${width}: expanded label stacks above adjacent markers`);
  screenshot(`family-tv-off-expanded-${width}x${height}`);
  browser('click', '.viewport-top h1');
  browser('mouse', 'move', '1', '1');
  waitFor('!document.querySelector("#quick-device-controls")');
  const passive = appearance('family-tv', `${width}×${height} TV Off passive selection`);
  inactiveAppearance(passive, `${width}×${height} TV Off passive selection`);
  check(passive.selected && !passive.focusVisible && !passive.hovered, `${width}: outside tap preserves passive selection without hover or focus`);
  if (passive.before.content !== 'none') check(passive.labelOpacity === 0, `${width}: passive mobile selection hides its label`);
  samePosition(expanded, passive, `${width} outside dismissal`);
  screenshot(`family-tv-off-selected-${width}x${height}`);
  console.log(`PASS ${width}×${height}: Off label, outside dismissal and passive selection`);
}

/** Find an alarm action through the sheet's actual paginated control category. */
function runAlarmAction(command) {
  browser('wait', '#full-device-controls[open]');
  const selector = `#full-device-controls [data-capability-id="smoke-${command}"]`;
  // Related alarm actions often share a page; preserve it instead of resetting the tab.
  const actionVisible = () => evaluate(`document.querySelector(${JSON.stringify(selector)})?.checkVisibility() === true`);
  if (actionVisible()) {
    browser('click', selector);
    return;
  }
  if (!evaluate('document.querySelector("#full-device-controls [data-control-group=\"controls\"]")?.getAttribute("aria-selected") === "true"')) {
    browser('click', '#full-device-controls [data-control-group="controls"]');
  }
  // Rewind through the public pager only when the requested action is on another page.
  for (let page = 0; page < 20 && !actionVisible(); page += 1) {
    if (!evaluate('document.querySelector("#full-device-controls [aria-label=\"Previous controls page\"]")?.disabled === false')) break;
    browser('click', '#full-device-controls [aria-label="Previous controls page"]');
  }
  for (let page = 0; page < 20; page += 1) {
    if (actionVisible()) {
      browser('click', selector);
      return;
    }
    check(evaluate('document.querySelector("#full-device-controls [aria-label=\"Next controls page\"]").disabled === false'), `${command}: another control page exists`);
    browser('click', '#full-device-controls [aria-label="Next controls page"]');
  }
  throw new Error(`Alarm action ${command} was not found`);
}

/** Require the alarm tone to paint the surface independently from an active-power class. */
function alarmAppearance(state, label) {
  const alarm = colors(state.alarmColor)[0];
  check(state.tone === 'alarm' && !state.active && state.monitoring === 'true', `${label}: alarm remains distinct from powered-device state`);
  check(alarm?.length === 3 && visibleSurfaces(state).some((surface) => colors(surface.background).some((color) =>
    color.slice(0, 3).every((channel, index) => Math.abs(channel - alarm[index]) <= 1))), `${label}: actual hotspot surface uses the alarm color`);
  check(state.stateLabel === 'Alarm simulation active' && state.labelOpacity === 1 && state.labelFits, `${label}: long alarm label stays visible inside the scene`);
}

/** Simulate, silence, clear and reset a real smoke control without fabricating device state. */
function verifyAlarm() {
  browser('set', 'viewport', '390', '844');
  activateTab();
  selectDevice('family-smoke', false);
  openControls('family-smoke', false);
  browser('click', '.quick-device-full');
  browser('wait', '#full-device-controls[open]');
  runAlarmAction('test-alarm');
  browser('wait', '.safety-preview-dialog[open]');
  browser('click', '.safety-preview-primary');
  browser('press', 'Escape');
  openControls('family-smoke', false);
  const alarm = appearance('family-smoke', '390×844 smoke alarm');
  alarmAppearance(alarm, '390×844 smoke alarm');
  screenshot('family-smoke-alarm-390x844');
  browser('click', '.quick-device-full');
  runAlarmAction('silence');
  browser('press', 'Escape');
  openControls('family-smoke', false);
  alarmAppearance(appearance('family-smoke', '390×844 silenced smoke alarm'), '390×844 silenced smoke alarm');
  browser('click', '.quick-device-full');
  runAlarmAction('clear-alarm');
  waitFor('document.querySelector(\'[data-device-hotspot="family-smoke"]\')?.dataset.deviceTone === "warning" && document.querySelector(\'[data-device-hotspot="family-smoke"] .device-hotspot-state\')?.textContent === "Simulation clear · reset pending"');
  runAlarmAction('reset');
  waitFor('document.querySelector(\'[data-device-hotspot="family-smoke"]\')?.dataset.deviceTone === "normal" && document.querySelector(\'[data-device-hotspot="family-smoke"] .device-hotspot-state\')?.textContent === "Monitoring sample"');
  browser('press', 'Escape');
  openControls('family-smoke', false);
  const cleared = appearance('family-smoke', '390×844 smoke alarm reset');
  inactiveAppearance(cleared, '390×844 smoke alarm reset', 'Monitoring sample');
  check(cleared.tone === 'normal' && cleared.monitoring === 'true', 'Cleared and reset alarm returns to neutral monitoring');
  dismissControls(false);
  console.log('PASS 390×844: smoke alarm paint, silence persistence, clear/reset and long label bounds');
}

/** Persist useful computed-style evidence when an artifact directory is requested. */
function recordArtifacts(status, error) {
  if (!artifactDirectory) return;
  mkdirSync(artifactDirectory, { recursive: true });
  writeFileSync(resolve(artifactDirectory, 'hotspot-appearance.json'), JSON.stringify({ status, checks, error: error?.message, observations }, null, 2));
  browser('screenshot', resolve(artifactDirectory, `hotspot-appearance-${status}.png`));
}

try {
  browser('open', 'about:blank');
  browser('set', 'viewport', '390', '844');
  browser('set', 'media', 'light', 'reduced-motion');
  browser('open', url);
  activateTab();
  assert.ok(!requestedGroup || ['details', 'alarm'].includes(requestedGroup), 'The optional QA group must be details or alarm');
  if (!requestedGroup) {
    for (const [width, height] of [[390, 844], [834, 1194], [1024, 768]]) {
      browser('set', 'viewport', String(width), String(height));
      activateTab();
      for (const id of ['family-tv', 'living-light']) verifyPowerDevice(id, width, height);
      verifyMonitor(width, height);
    }
  } else if (requestedGroup === 'details') {
    browser('set', 'viewport', '1024', '768');
    activateTab();
    verifyMonitor(1024, 768);
  }
  if (requestedGroup !== 'alarm') for (const [width, height] of [[390, 844], [834, 1194]]) verifyPassiveSelection(width, height);
  verifyAlarm();
  check(browser('errors').errors.length === 0, 'No uncaught page errors');
  check(browser('console').messages.every((message) => message.type !== 'error' && message.level !== 'error'), 'No browser console errors');
  recordArtifacts('passed');
  console.log(`PASS ${checks} hotspot appearance checks${requestedGroup ? ` in ${requestedGroup}` : ' across phone, portrait tablet and landscape tablet'}.`);
} catch (error) {
  collectingFailureEvidence = true;
  try { recordArtifacts('failed', error); } catch (evidenceError) { console.error('Failure evidence unavailable:', evidenceError.message); }
  throw error;
} finally {
  try { browser('close'); }
  catch (error) { console.error('Browser cleanup failed:', error.message); process.exitCode = 1; }
}
