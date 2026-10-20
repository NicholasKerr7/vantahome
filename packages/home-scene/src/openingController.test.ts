import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDevice } from './data';
import { deviceActionFeedback, deviceStatus, getCapabilities, getControlPages, readDeviceSetting } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState } from './deviceControlActions';
import { getFireIncident } from './fireSafetySimulation';
import {
  isOpeningDeviceKind, OPENING_POSITION_BOUNDS, openingControllerActionId, readOpeningControllerState,
  type OpeningDeviceKind,
} from './openingController';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

const fixtures = [
  ['door', 'entry-door', 'hinged-door'],
  ['garage', 'utility-shutter', 'roller-shutter'],
  ['window', 'kitchen-window', 'awning-window'],
] as const;
const commandKeys = ['open', 'close', 'increase', 'decrease'] as const;

/** Restore authority and accepted state between independent fixture checks. */
function resetStore(): void {
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
}

/** Exercise both persisted formats with the same accepted selected-device state. */
function expectRetained(id: string, state: DeviceState): void {
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[id] = state;
  const native = parseStoredSimulationSnapshotMessage({
    channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot,
  });
  const browser = createDefaultState();
  browser.deviceStates[id] = state;
  const cached = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(native?.state.deviceStates[id]).toEqual(state);
  expect(cached.deviceStates[id]).toEqual(state);
}

describe('shared opening controllers', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('excludes gate and blinds and keeps window vent scoped to its actual capability', () => {
    for (const kind of ['gate', 'blinds', 'lock', 'light']) expect(isOpeningDeviceKind(kind)).toBe(false);
    for (const id of ['entry-gate', 'master-blinds', 'living-light']) {
      expect(readOpeningControllerState(getDevice(id)!, { on: false, level: 0 })).toBeNull();
    }
    expect(OPENING_POSITION_BOUNDS).toEqual({ min: 0, max: 100, step: 5 });
    expect(openingControllerActionId('window', 'vent')).toBe('window-vent');
    expect(openingControllerActionId('door', 'vent')).toBeNull();
    expect(openingControllerActionId('garage', 'vent')).toBeNull();
    expect(getCapabilities('gate').some(({ id }) => /position-(up|down)$/.test(id))).toBe(false);
  });

  describe.each(fixtures)('%s fixture', (kind, id, variant) => {
    const device = getDevice(id)!;

    it.each([
      [0, 'Closed', true, false],
      [25, '25% open', true, true],
      [100, 'Fully open', false, true],
      [-10, 'Closed', true, false],
      [150, 'Fully open', false, true],
      [23.6, '24% open', true, true],
    ] as const)('normalizes accepted position %s without trusting stale power or duplicate settings', (level, status, canOpen, canClose) => {
      const state = { on: level === 0, level, settings: { openPercent: 99, lastAction: `${kind}-command-close` } };
      const position = Math.round(Math.max(0, Math.min(100, level)));
      expect(readOpeningControllerState(device, state)).toEqual({ kind, variant, openPercent: position, status, canOpen, canClose });
      expect(deviceStatus(device, state)).toBe(status);
      expect(readDeviceSetting(device, state, 'openPercent')).toBe(position);
      expect(deviceActionFeedback(device, state)).toBe(position === 0 ? 'Closed in preview' : `${position}% open in preview`);
    });

    it.each([Number.NaN, Infinity, -Infinity, '50', null, undefined])('shows malformed position %s as unknown and rejects relative commands without feedback', (level) => {
      const state: DeviceState = { on: false, level: level as number, settings: { lastAction: `${kind}-command-close` } };
      expect(readOpeningControllerState(device, state)).toMatchObject({
        openPercent: null, status: 'Position unavailable', canOpen: true, canClose: true,
      });
      expect(deviceStatus(device, state)).toBe('Position unavailable');
      expect(deviceActionFeedback(device, state)).toBe('Position unavailable');
      expect(readDeviceSetting(device, state, 'openPercent')).toBeNaN();
      for (const key of ['increase', 'decrease'] as const) {
        expect(runDeviceActionState(id, state, openingControllerActionId(kind, key))).toBe(state);
      }
      const opened = runDeviceActionState(id, state, openingControllerActionId(kind, 'open'));
      expect(opened).toMatchObject({ on: true, level: 100 });
      expect(runDeviceActionState(id, state, openingControllerActionId(kind, 'close'))).toMatchObject({ on: false, level: 0 });
      expectRetained(id, opened);
    });

    it('keeps all existing More controls and exposes no lock, stop or invented sensor', () => {
      const capabilities = getCapabilities(kind);
      const actionIds = capabilities.filter((item) => item.type === 'action').map((item) => item.id);
      for (const key of commandKeys) expect(actionIds).toContain(openingControllerActionId(kind, key));
      expect(capabilities.find((item) => 'field' in item && item.field === 'openPercent')).toMatchObject({ type: 'range', min: 0, max: 100 });
      expect(capabilities.filter((item) => item.group === 'schedule').every((item) => item.configurationOnly)).toBe(true);
      expect(capabilities.some((item) => /lock|obstacle|contact|stop/i.test(item.id))).toBe(false);
      const pageIds = getControlPages(kind).flatMap((page) => page.capabilities.map((item) => item.id));
      expect(pageIds.slice().sort()).toEqual(capabilities.map((item) => item.id).sort());
      expect(new Set(pageIds).size).toBe(pageIds.length);
    });

    it('clamps relative changes at boundaries and retains position, preferences and selected identity', () => {
      const settings = { scheduleEnabled: true, scheduleHour: 7, scheduleMinute: 15, scheduleDays: 'weekdays' };
      const original = { on: false, level: 98, settings };
      const opened = runDeviceActionState(id, original, openingControllerActionId(kind, 'increase'));
      const closed = runDeviceActionState(id, { on: true, level: 2, settings }, openingControllerActionId(kind, 'decrease'));
      expect(opened).toMatchObject({ on: true, level: 100, settings });
      expect(closed).toMatchObject({ on: false, level: 0, settings });
      expect(runDeviceActionState(id, opened, openingControllerActionId(kind, 'increase'))).toEqual(opened);
      expect(runDeviceActionState(id, closed, openingControllerActionId(kind, 'decrease'))).toEqual(closed);
      const restored = runDeviceActionState(id, { ...original, level: 150 }, openingControllerActionId(kind, 'decrease'));
      expect(restored.level).toBe(95);
      const scheduled = applyDeviceSetting(id, opened, 'scheduleHour', 20);
      expect(scheduled).toMatchObject({ on: true, level: 100, settings: { ...settings, scheduleHour: 20 } });
      expect(original).toEqual({ on: false, level: 98, settings });
      for (const state of [opened, closed, restored, scheduled]) expectRetained(id, state);
      const wrongKind: OpeningDeviceKind = kind === 'door' ? 'garage' : 'door';
      expect(runDeviceActionState(id, opened, openingControllerActionId(wrongKind, 'close'))).toBe(opened);
    });

    it('uses current accepted state for rapid presses and changes only the selected fixture', () => {
      useHomeStore.getState().setDeviceSetting(id, 'openPercent', 25);
      const before = useHomeStore.getState().deviceStates;
      const send = useHomeStore.getState().runDeviceAction;
      for (let index = 0; index < 8; index += 1) send(id, openingControllerActionId(kind, 'increase'));
      for (let index = 0; index < 3; index += 1) send(id, openingControllerActionId(kind, 'decrease'));
      const after = useHomeStore.getState().deviceStates;
      expect(after[id]).toMatchObject({ on: true, level: 50 });
      for (const otherId of Object.keys(before)) if (otherId !== id) expect(after[otherId]).toEqual(before[otherId]);
      expectRetained(id, after[id]);
    });

    it('rechecks view-only and revoked grants for cached command callbacks and absolute position settings', () => {
      const send = useHomeStore.getState().runDeviceAction;
      const setPosition = useHomeStore.getState().setDeviceSetting;
      const before = useHomeStore.getState().deviceStates[id];
      useHomeStore.setState({ access: { ...EMPTY_SCENE_ACCESS, roomIds: [device.roomId], deviceIds: [id] } });
      for (const key of commandKeys) send(id, openingControllerActionId(kind, key));
      setPosition(id, 'openPercent', 75);
      if (kind === 'window') send(id, 'window-vent');
      expect(useHomeStore.getState().deviceStates[id]).toBe(before);
      useHomeStore.setState({ access: FULL_SCENE_ACCESS });
      send(id, openingControllerActionId(kind, 'open'));
      const opened = useHomeStore.getState().deviceStates[id];
      useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
      send(id, openingControllerActionId(kind, 'close'));
      setPosition(id, 'openPercent', 25);
      expect(useHomeStore.getState().deviceStates[id]).toBe(opened);
    });
  });

  it('recovers unknown window position using the existing vent preset', () => {
    const state = runDeviceActionState('kitchen-window', { on: false, level: Number.NaN }, openingControllerActionId('window', 'vent'));
    expect(state).toMatchObject({ on: true, level: 25 });
    expectRetained('kitchen-window', state);
  });

  it('does not clear a fire incident or the gate emergency hold when a fixture is commanded', () => {
    const send = useHomeStore.getState().runDeviceAction;
    send('master-smoke', 'smoke-test-alarm');
    const before = useHomeStore.getState().deviceStates;
    expect(getFireIncident(before).active).toBe(true);
    for (const [kind, id] of fixtures) send(id, openingControllerActionId(kind, 'close'));
    const after = useHomeStore.getState().deviceStates;
    expect(getFireIncident(after)).toEqual(getFireIncident(before));
    expect(after['entry-gate']).toEqual(before['entry-gate']);
  });
});
