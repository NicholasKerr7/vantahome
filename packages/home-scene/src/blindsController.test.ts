import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDevice } from './data';
import { deviceActionFeedback, getCapabilities, validateSetting } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState } from './deviceControlActions';
import {
  BLINDS_POSITION_PRESETS, blindsActionId, getBlindsControllerSlats, readBlindsControllerState,
  type BlindsControllerKey,
} from './blindsController';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

const blinds = getDevice('master-blinds')!;
const controllerKeys: readonly BlindsControllerKey[] = ['open', 'close', 'raise', 'lower'];

/** Isolate permission changes so this controller's checks cannot affect another suite. */
function resetStore(): void {
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
}

/** Round-trip the exact native hydration and browser cache formats used by the app. */
function expectRetained(state: DeviceState): void {
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[blinds.id] = state;
  const restoredNative = parseStoredSimulationSnapshotMessage(JSON.stringify({
    channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot,
  }));
  const browser = createDefaultState();
  browser.deviceStates[blinds.id] = state;
  const restoredBrowser = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(restoredNative?.state.deviceStates[blinds.id]).toEqual(state);
  expect(restoredBrowser.deviceStates[blinds.id]).toEqual(state);
}

describe('shared blinds controller', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('maps all commands and presets to the existing bounded position capability', () => {
    const capabilities = getCapabilities('blinds');
    const actionIds = capabilities.filter((capability) => capability.type === 'action').map((capability) => capability.id);
    expect(new Set(controllerKeys.map(blindsActionId)).size).toBe(controllerKeys.length);
    for (const key of controllerKeys) expect(actionIds).toContain(blindsActionId(key));
    const position = capabilities.find((capability) => 'field' in capability && capability.field === 'openPercent');
    expect(position).toMatchObject({ type: 'range', min: 0, max: 100 });
    if (!position) throw new Error('Expected the blinds position capability');
    expect(BLINDS_POSITION_PRESETS).toEqual([
      { value: 25, label: 'Privacy' }, { value: 50, label: 'Half' }, { value: 75, label: 'Daylight' },
    ]);
    for (const preset of BLINDS_POSITION_PRESETS) expect(validateSetting(position, preset.value)).toBe(preset.value);
    expect(actionIds).not.toContain('blinds-stop');
  });

  it.each([
    [0, 'Closed', true, false], [25, '25% open', true, true], [100, 'Fully open', false, true],
  ] as const)('reads authoritative position %s and meaningful boundary affordances', (position, status, canRaise, canLower) => {
    const state = { on: position > 0, level: position, settings: { openPercent: 99 } };
    expect(readBlindsControllerState(blinds, state)).toEqual({ position, status, canRaise, canLower });
  });

  it('clamps relative actions at both ends and derives coherent opening power without losing preferences', () => {
    const original = { on: true, level: 98, settings: { scheduleEnabled: true, scheduleHour: 7, scheduleMinute: 30, scheduleDays: 'weekdays' } };
    const opened = runDeviceActionState(blinds.id, original, blindsActionId('raise'));
    expect(opened).toEqual({ on: true, level: 100, settings: { ...original.settings, lastAction: 'blinds-position-up' } });
    expect(deviceActionFeedback(blinds, opened)).toBe('100% open in preview');
    expect(runDeviceActionState(blinds.id, opened, blindsActionId('raise'))).toEqual(opened);
    const nearlyClosed = { ...original, level: 2 };
    const closed = runDeviceActionState(blinds.id, nearlyClosed, blindsActionId('lower'));
    expect(closed).toEqual({ on: false, level: 0, settings: { ...original.settings, lastAction: 'blinds-position-down' } });
    expect(deviceActionFeedback(blinds, closed)).toBe('Closed in preview');
    expect(runDeviceActionState(blinds.id, closed, blindsActionId('lower'))).toEqual(closed);
    const raised = runDeviceActionState(blinds.id, closed, blindsActionId('raise'));
    expect(raised).toMatchObject({ on: true, level: 5 });
    expect(deviceActionFeedback(blinds, raised)).toBe('5% open in preview');
    expect(original.level).toBe(98);
    for (const state of [opened, closed, raised]) expectRetained(state);
  });

  it('retains all presets and full open/close states across native and browser reloads', () => {
    let state: DeviceState = { on: false, level: 0, settings: { scheduleEnabled: true, scheduleHour: 20, scheduleMinute: 15 } };
    for (const preset of BLINDS_POSITION_PRESETS) {
      state = applyDeviceSetting(blinds.id, state, 'openPercent', preset.value);
      expect(state).toMatchObject({ on: true, level: preset.value, settings: { scheduleEnabled: true, scheduleHour: 20, scheduleMinute: 15 } });
      expect(state.settings?.openPercent).toBeUndefined();
      expectRetained(state);
    }
    for (const key of ['open', 'close'] as const) {
      state = runDeviceActionState(blinds.id, state, blindsActionId(key));
      expect(state).toMatchObject({ on: key === 'open', level: key === 'open' ? 100 : 0 });
      expectRetained(state);
    }
  });

  it('accumulates rapid relative presses from current shared state without a stale rendered position', () => {
    useHomeStore.getState().setDeviceSetting(blinds.id, 'openPercent', 25);
    const send = useHomeStore.getState().runDeviceAction;
    for (let index = 0; index < 8; index += 1) send(blinds.id, blindsActionId('raise'));
    for (let index = 0; index < 3; index += 1) send(blinds.id, blindsActionId('lower'));
    const state = useHomeStore.getState().deviceStates[blinds.id];
    expect(readBlindsControllerState(blinds, state)).toMatchObject({ position: 50, status: '50% open' });
    expectRetained(state);
  });

  it('retains read-only and revoked-access guards for every new action and position preset', () => {
    const before = useHomeStore.getState().deviceStates[blinds.id];
    const send = useHomeStore.getState().runDeviceAction;
    const setPosition = useHomeStore.getState().setDeviceSetting;
    useHomeStore.setState({ access: {
      ...EMPTY_SCENE_ACCESS, roomIds: [blinds.roomId], deviceIds: [blinds.id],
    } });
    for (const key of controllerKeys) send(blinds.id, blindsActionId(key));
    for (const preset of BLINDS_POSITION_PRESETS) setPosition(blinds.id, 'openPercent', preset.value);
    expect(useHomeStore.getState().deviceStates[blinds.id]).toBe(before);
    useHomeStore.setState({ access: FULL_SCENE_ACCESS });
    send(blinds.id, blindsActionId('close'));
    const closed = useHomeStore.getState().deviceStates[blinds.id];
    expect(closed).toMatchObject({ on: false, level: 0 });
    useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
    send(blinds.id, blindsActionId('raise'));
    setPosition(blinds.id, 'openPercent', 75);
    expect(useHomeStore.getState().deviceStates[blinds.id]).toBe(closed);
  });

  it('draws bounded, ordered static slats whose visible height follows saved position', () => {
    let previousHeight = 1;
    for (const position of [0, 25, 50, 75, 100]) {
      const slats = getBlindsControllerSlats(position);
      expect(slats).toEqual(getBlindsControllerSlats(position));
      expect(slats).toHaveLength(10);
      expect(slats[0].y).toBe(0);
      for (const [index, slat] of slats.entries()) {
        expect(slat.y).toBeGreaterThanOrEqual(0);
        expect(slat.height).toBeGreaterThan(0);
        expect(slat.y + slat.height).toBeLessThanOrEqual(1);
        if (index > 0) expect(slat.y).toBeCloseTo(slats[index - 1].y + slats[index - 1].height);
      }
      const bottom = slats.at(-1)!.y + slats.at(-1)!.height;
      expect(bottom).toBeLessThanOrEqual(previousHeight);
      previousHeight = bottom;
    }
    const closed = getBlindsControllerSlats(0);
    const open = getBlindsControllerSlats(100);
    expect(closed.at(-1)!.y + closed.at(-1)!.height).toBeCloseTo(1);
    expect(open.at(-1)!.y + open.at(-1)!.height).toBeCloseTo(0.12);
    expect(getBlindsControllerSlats(-50)).toEqual(closed);
    expect(getBlindsControllerSlats(Number.NaN)).toEqual(closed);
    expect(getBlindsControllerSlats(150)).toEqual(open);
  });
});
