/** Bounded browser regressions for the expanded catalog; no private React/store hooks. */
export function createCatalogChecks(context) {
  const { browser, evaluate, check, snapshot, unchangedView, prepareDevice, toggleIn, modalAccessibility, narrowControls, ready, catalog, profiles, popup, modal } = context;
  const requestedRooms = process.env.VANTA_QA_CATALOG_ROOMS?.split(',').filter(Boolean);
  const requestedKinds = process.env.VANTA_QA_CATALOG_KINDS?.split(',').filter(Boolean);
  const monitors = new Set(['energy', 'water', 'air', 'smoke', 'solar']);
  const representatives = [...new Map(catalog.map((device) => [device.kind, device])).values()]
    .sort((a, b) => Number(a.outdoor) - Number(b.outdoor) || a.floor.localeCompare(b.floor) || a.room.localeCompare(b.room));

  /** Fail explicitly if a required fixture disappears from the shared manifest. */
  function deviceById(id) {
    const device = catalog.find((item) => item.id === id);
    check(Boolean(device), `catalog contains required fixture ${id}`);
    return device;
  }

  /** Close the native sheet and require its opening hotspot to regain focus. */
  function closeSheet(device, before) {
    browser('press', 'Escape');
    browser('wait', '--fn', `document.activeElement?.getAttribute('data-device-hotspot') === ${JSON.stringify(device.id)}`);
    const closed = snapshot();
    check(closed.modalCount === 0 && closed.popupCount === 0 && closed.focusedHotspot === device.id, `${device.id}: sheet closes and restores its own hotspot`);
    unchangedView(before, closed, `${device.id} catalog dismissal`);
  }

  /** Preserve all other settings when one individual fixture is adjusted. */
  function independent(before, after, id) {
    check(Object.entries(before).every(([otherId, state]) => otherId === id || JSON.stringify(after[otherId]) === JSON.stringify(state)), `${id}: the adjustment leaves every other fixture unchanged`);
  }

  /** Compare serialized settings by value rather than their JSON property order. */
  function sameDeviceState(left, right) {
    if (!right || left.on !== right.on || left.level !== right.level) return false;
    const settings = Object.entries(left.settings ?? {});
    return settings.length === Object.keys(right.settings ?? {}).length
      && settings.every(([field, value]) => right.settings[field] === value);
  }

  /** Locate the public input retained for a legacy range or generated for a new setting. */
  function settingSelector(device, capability, prefix = 'sheet-') {
    const legacyFields = {
      'living-light': 'brightness', 'living-fan': 'speed', 'master-ac': 'tempC',
      'master-blinds': 'openPercent', 'entry-gate': 'openPercent',
    };
    return `#${legacyFields[device.id] === capability.field ? `${prefix}level-${device.id}` : `${prefix}${device.id}-${capability.id}`}`;
  }

  /** Exercise one native mode/range/toggle and compare its persisted semantic value. */
  function adjustSetting(device) {
    const capabilities = profiles[device.kind];
    const capability = capabilities.find((item) => item.type === 'enum')
      ?? capabilities.find((item) => item.type === 'range')
      ?? capabilities.find((item) => item.type === 'toggle');
    if (!capability) return;
    const selector = settingSelector(device, capability);
    const inClosedDetails = evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); return !!input?.closest('details:not([open])'); })()`);
    if (inClosedDetails) browser('click', `${modal} .advanced-device-controls > summary`);
    browser('wait', selector);
    const before = snapshot();
    let desired;
    if (capability.type === 'enum') {
      const current = evaluate(`document.querySelector(${JSON.stringify(selector)}).value`);
      desired = capability.options.find((option) => String(option.value) !== current)?.value;
      check(desired !== undefined, `${device.kind}: mode offers a meaningful alternative`);
      browser('select', selector, String(desired));
    } else if (capability.type === 'range') {
      const current = Number(evaluate(`document.querySelector(${JSON.stringify(selector)}).value`));
      desired = current === capability.max ? capability.min : capability.max;
      browser('focus', selector);
      browser('press', desired === capability.max ? 'End' : 'Home');
    } else {
      desired = evaluate(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-checked')`) !== 'true';
      browser('click', selector);
    }
    const after = snapshot();
    const current = after.state.deviceStates[device.id];
    const levelField = capability.field === 'openPercent' || (device.kind === 'light' && capability.field === 'brightness') || (device.kind === 'fan' && capability.field === 'speed');
    const actual = levelField ? current.level : capability.field === 'isOn' || capability.field === 'armed' ? current.on : current.settings?.[capability.field];
    check(actual === desired, `${device.kind}: ${capability.label} changes to ${String(desired)} through the visible control`);
    independent(before.state.deviceStates, after.state.deviceStates, device.id);
    unchangedView(before, after, `${device.id} setting`);
  }

  /** Inspect semantic labels and read-only telemetry in the open public control card. */
  function inspectCard(device) {
    const semantics = evaluate(`(() => {
      const card = document.querySelector(${JSON.stringify(modal)});
      const rect = card.getBoundingClientRect();
      return {
        title: document.getElementById(card.getAttribute('aria-labelledby'))?.textContent?.trim(),
        native: card.matches(':modal'),
        fits: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
        focused: card.contains(document.activeElement),
        powerRows: card.querySelectorAll('.power-row').length,
        readings: [...card.querySelectorAll('.capability-reading')].map((row) => ({ text: row.textContent, editable: !!row.querySelector('input,select,button') })),
        sampleNotice: card.querySelector('.device-readings')?.textContent?.includes('no live hardware') ?? false,
      };
    })()`);
    check(semantics.native && semantics.fits && semantics.focused && semantics.title === device.name, `${device.kind}: named native full controls fit and receive focus`);
    const expectedReadings = profiles[device.kind].filter((item) => item.type === 'stat').length;
    check(semantics.readings.length === expectedReadings && semantics.readings.every((reading) => !reading.editable && reading.text.trim()), `${device.kind}: every telemetry value is rendered read-only`);
    if (monitors.has(device.kind)) check(semantics.powerRows === 0 && semantics.sampleNotice, `${device.kind}: monitoring is explicitly simulated and has no fake power switch`);
    check(!snapshot().overflow, `${device.kind}: controls do not cause horizontal overflow`);
  }

  /** Cover all kinds once at portrait-tablet size, including meaningful schema controls. */
  function allKinds() {
    browser('set', 'viewport', '834', '1194');
    check(representatives.length === 28 && representatives.every((device) => profiles[device.kind]), 'all 24 repository kinds plus blinds/generator/battery/solar have a representative');
    // Optional room chunks keep long catalog audits bounded; the unfiltered group covers all kinds.
    const targets = representatives.filter((device) => (!requestedRooms || requestedRooms.includes(device.room)) && (!requestedKinds || requestedKinds.includes(device.kind)));
    check(!requestedKinds || requestedKinds.every((kind) => targets.some((device) => device.kind === kind)), 'every requested catalog kind has a visible test target');
    check(targets.length > 0 && (!requestedRooms || requestedRooms.every((room) => targets.some((device) => device.room === room))), `catalog interaction coverage: ${targets.map((device) => device.kind).join(', ')}`);
    for (const device of targets) {
      prepareDevice(device);
      const before = snapshot();
      check(before.anchors.length > 0 && before.anchors.every((anchor) => catalog.find((item) => item.id === anchor.id)?.room === device.room), `${device.id}: projected controls belong only to the selected room`);
      browser('click', `[data-device-hotspot="${device.id}"]`);
      browser('wait', popup);
      const opened = snapshot();
      check(opened.state.selectedDevice === device.id && opened.state.roomId === device.room, `${device.kind}: hotspot selects its own catalog instance (expected ${device.id}/${device.room}, actual ${opened.state.selectedDevice}/${opened.state.roomId})`);
      unchangedView(before, opened, `${device.kind} quick open`);
      if (monitors.has(device.kind)) check(evaluate(`document.querySelector('${popup} .quick-device-toggle').getAttribute('role')`) !== 'switch', `${device.kind}: quick check is an action, not a power switch`);
      toggleIn(popup, device, opened.state.deviceStates[device.id]);
      unchangedView(before, snapshot(), `${device.kind} quick action`);
      browser('click', `${popup} .quick-device-full`);
      browser('wait', modal);
      inspectCard(device);
      adjustSetting(device);
      closeSheet(device, before);
      console.log(`PASS catalog kind: ${device.kind} (${device.id})`);
    }
    console.log(`PASS catalog interaction coverage: ${targets.length} kinds (${targets.map((device) => device.kind).join(', ')})`);
    const saved = snapshot().state;
    browser('reload');
    ready();
    const restored = snapshot().state;
    const changed = catalog.filter((device) => !sameDeviceState(saved.deviceStates[device.id], restored.deviceStates[device.id])).map((device) => device.id);
    check(changed.length === 0, `all catalog settings survive reload (${changed.join(', ')})`);
    check(['floor', 'roomId', 'view', 'selectedDevice'].every((field) => saved[field] === restored[field]), 'catalog reload retains the selected room, viewpoint and device');
  }

  /** Check every bedroom's two separate bedside lamps and retained brightness settings. */
  function bedroomPairs() {
    browser('set', 'viewport', '390', '844');
    for (const room of ['master', 'bedroom-1', 'bedroom-2', 'bedroom-3', 'bedroom-4', 'bedroom-5']) {
      const left = deviceById(`${room}-bedside-left`);
      const right = deviceById(`${room}-bedside-right`);
      prepareDevice(left);
      const before = snapshot();
      browser('click', `[data-device-hotspot="${left.id}"]`);
      browser('wait', popup);
      toggleIn(popup, left, before.state.deviceStates[left.id]);
      const leftChanged = snapshot().state.deviceStates[left.id];
      browser('press', 'Escape');
      browser('wait', '--fn', `document.activeElement?.getAttribute('data-device-hotspot') === ${JSON.stringify(left.id)}`);
      browser('click', `[data-device-hotspot="${right.id}"]`);
      browser('wait', popup);
      toggleIn(popup, right, snapshot().state.deviceStates[right.id]);
      browser('click', `${popup} .quick-device-full`);
      browser('wait', modal);
      modalAccessibility(right);
      adjustSetting(right);
      check(JSON.stringify(snapshot().state.deviceStates[left.id]) === JSON.stringify(leftChanged), `${room}: right bedside power/brightness cannot change the left lamp`);
      closeSheet(right, before);
      console.log(`PASS independent bedside pair: ${room}`);
    }
  }

  /** Verify a partial utility shutter opening and the exact return to the primary suite. */
  function utilityControls() {
    browser('set', 'viewport', '834', '1194');
    const indoor = deviceById('master-blinds');
    prepareDevice(indoor);
    browser('click', '[data-device-hotspot="master-blinds"]');
    browser('wait', popup);
    browser('press', 'Escape');
    browser('wait', '--fn', 'document.activeElement?.getAttribute("data-device-hotspot") === "master-blinds"');
    const device = deviceById('utility-shutter');
    prepareDevice(device);
    const before = snapshot();
    check(before.state.view === 'immersive' && before.state.roomId === 'utility' && before.state.floor === 'upper', 'utility viewpoint keeps the previous indoor floor');
    browser('click', '[data-device-hotspot="utility-shutter"]');
    browser('wait', popup);
    browser('click', `${popup} .quick-device-full`);
    browser('wait', modal);
    modalAccessibility(device);
    for (const level of [0, 50, 100]) {
      browser('focus', '#sheet-utility-shutter-garage-open');
      browser('press', 'Home');
      for (let count = 0; count < level / 10; count++) browser('press', 'PageUp');
      const shutter = snapshot().state.deviceStates[device.id];
      check(shutter.level === level && shutter.on === (level > 0), `utility shutter opens to ${level}%`);
    }
    closeSheet(device, before);
    browser('click', '.view-controls button:nth-child(2)');
    ready();
    check(snapshot().state.view === 'upper' && snapshot().state.roomId === 'master' && snapshot().state.selectedDevice === 'master-blinds', 'floor plan restores the exact indoor room and device after utility controls');
    console.log('PASS utility shutter and indoor bookmark');
  }

  /** Exercise new control categories through real phone sheets and native focus behavior. */
  function mobileKinds() {
    narrowControls(390, 844, ['bedroom-1-bedside-left', 'utility-shutter', 'entry-door', 'kitchen-window', 'master-smoke', 'laundry-dryer', 'kitchen-fridge'].map(deviceById));
    console.log('PASS new mobile control categories');
  }

  return { catalog: allKinds, bedrooms: bedroomPairs, 'catalog-mobile': mobileKinds, utility: utilityControls };
}
