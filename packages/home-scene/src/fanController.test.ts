import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEVICES, getDevice } from './data';
import { deviceActionFeedback, deviceStatus, getCapabilities, readDeviceSetting } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState, toggleDeviceState } from './deviceControlActions';
import { fanPreviewVelocity } from './devicePreviewBehavior';
import { FAN_DIRECTION_OPTIONS, FAN_SPEED_BOUNDS, FAN_SPEED_PRESETS, fanControllerActionId, readFanControllerState } from './fanController';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

const fan = getDevice('living-fan')!;

/** Restore independent simulation state and authority around every test. */
function resetStore(): void {
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
}

/** Both native hydration and browser storage must preserve speed and all accepted preferences. */
function expectRetained(state: DeviceState): void {
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[fan.id] = state;
  const native = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
  const browser = createDefaultState();
  browser.deviceStates[fan.id] = state;
  const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(native?.state.deviceStates[fan.id]).toEqual(state);
  expect(restored.deviceStates[fan.id]).toEqual(state);
  expect(readFanControllerState(fan, native!.state.deviceStates[fan.id])).toEqual(readFanControllerState(fan, state));
}

describe('shared fan controller', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('supports both fixed fan models and leaves unrelated device controllers alone', () => {
    expect(readFanControllerState(getDevice('master-ac')!, { on: true, level: 80 })).toBeNull();
    for (const device of DEVICES.filter((item) => item.kind === 'fan')) {
      expect(readFanControllerState(device, { on: true, level: 60 })).toEqual({
        on: true, speed: 60, effectiveSpeed: 60, sleep: false, direction: 'forward', status: 'Running preview', velocity: 60 * 0.13,
      });
    }
    expect(new Set(DEVICES.filter((item) => item.kind === 'fan').map((item) => item.model))).toEqual(new Set(['fan', 'extractor']));
  });

  it('aligns relative steps and direction with existing controls and keeps unsupported extras saved-only', () => {
    expect(getCapabilities('fan').find((item) => 'field' in item && item.field === 'speed'))
      .toMatchObject({ type: 'range', min: FAN_SPEED_BOUNDS.min, max: FAN_SPEED_BOUNDS.max });
    for (const [key, delta] of [['speedUp', FAN_SPEED_BOUNDS.step], ['speedDown', -FAN_SPEED_BOUNDS.step]] as const) {
      expect(getCapabilities('fan').find((item) => item.id === fanControllerActionId(key)))
        .toMatchObject({ type: 'action', operation: { type: 'increment', field: 'speed', delta } });
    }
    const directions = getCapabilities('fan').find((item) => 'field' in item && item.field === 'fanDirection');
    expect(directions?.type === 'enum' ? directions.options : null).toEqual(FAN_DIRECTION_OPTIONS);
    for (const field of ['fanOscillation', 'fanLightOn', 'fanAutoMode', 'fanTimerMin']) {
      expect(getCapabilities('fan').find((item) => 'field' in item && item.field === field)?.configurationOnly).toBe(true);
    }
    for (const field of ['fanDirection', 'fanSleepMode']) {
      expect(getCapabilities('fan').find((item) => 'field' in item && item.field === field)?.configurationOnly).toBeUndefined();
    }
  });

  it.each([
    [false, 80, false, 'forward', 0, 'Off'],
    [true, 0, false, 'forward', 0, 'Stopped at 0%'],
    [true, 0, true, 'reverse', 0, 'Stopped at 0%'],
    [true, 80, false, 'forward', 80, 'Running preview'],
    [true, 80, true, 'forward', 35, 'Sleep preview'],
    [true, 20, true, 'reverse', 20, 'Sleep preview'],
  ] as const)('shares power %s, speed %s, Sleep %s and %s direction across console, property and summaries', (on, speed, sleep, direction, effectiveSpeed, status) => {
    const state = { on, level: speed, settings: { fanSleepMode: sleep, fanDirection: direction, lastAction: fanControllerActionId('speedUp') } };
    const projected = readFanControllerState(fan, state)!;
    expect(projected).toMatchObject({ on, speed, effectiveSpeed, sleep, direction, status });
    expect(projected.velocity).toBe(effectiveSpeed === 0 ? 0 : effectiveSpeed * 0.13 * (direction === 'reverse' ? -1 : 1));
    expect(fanPreviewVelocity(fan, state)).toBe(projected.velocity);
    expect(deviceStatus(fan, state)).toBe(status);
    expect(deviceActionFeedback(fan, state)).toBe(status);
  });

  it.each([false, true])('bounds repeated relative speeds while retaining power %s, Sleep and direction', (on) => {
    let state: DeviceState = { on, level: 35, settings: {
      fanSleepMode: true, fanDirection: 'reverse', fanTimerMin: 30, fanOscillation: false, fanLightOn: false,
    } };
    for (let index = 0; index < 15; index += 1) state = runDeviceActionState(fan.id, state, fanControllerActionId('speedUp'));
    expect(readFanControllerState(fan, state)).toMatchObject({
      on, speed: 100, effectiveSpeed: on ? 35 : 0, sleep: true, direction: 'reverse',
    });
    expect(state.settings).toMatchObject({ fanTimerMin: 30, fanOscillation: false, fanLightOn: false });
    expectRetained(state);
    for (let index = 0; index < 15; index += 1) state = runDeviceActionState(fan.id, state, fanControllerActionId('speedDown'));
    expect(readFanControllerState(fan, state)).toMatchObject({ on, speed: 0, effectiveSpeed: 0, sleep: true, direction: 'reverse', velocity: 0 });
    expect(deviceStatus(fan, state)).toBe(on ? 'Stopped at 0%' : 'Off');
    expectRetained(state);
  });

  it('applies rapid actions to the latest speed without touching another device', () => {
    const before = useHomeStore.getState().deviceStates;
    const { setDeviceSetting, runDeviceAction } = useHomeStore.getState();
    setDeviceSetting(fan.id, 'speed', 35);
    for (const key of ['speedUp', 'speedUp', 'speedDown', 'speedUp'] as const) runDeviceAction(fan.id, fanControllerActionId(key));
    const after = useHomeStore.getState().deviceStates;
    expect(readFanControllerState(fan, after[fan.id])?.speed).toBe(55);
    for (const [id, state] of Object.entries(before)) if (id !== fan.id) expect(after[id]).toBe(state);
    expectRetained(after[fan.id]);
  });

  it.each([false, true])('keeps power %s and Sleep unchanged for every new speed preset', (on) => {
    for (const preset of FAN_SPEED_PRESETS) {
      const state = applyDeviceSetting(fan.id, { on, level: 20, settings: { fanSleepMode: true, fanDirection: 'reverse' } }, 'speed', preset.value);
      expect(readFanControllerState(fan, state)).toMatchObject({
        on, speed: preset.value, effectiveSpeed: on ? Math.min(35, preset.value) : 0, sleep: true, direction: 'reverse',
      });
      expectRetained(state);
    }
  });

  it('restores the requested speed after disabling Sleep and remembers it through power cycling', () => {
    let state: DeviceState = { on: true, level: 80, settings: { fanDirection: 'reverse', fanSleepMode: true } };
    expect(readFanControllerState(fan, state)?.effectiveSpeed).toBe(35);
    state = toggleDeviceState(fan.id, state);
    expect(readFanControllerState(fan, state)).toMatchObject({ on: false, speed: 80, effectiveSpeed: 0, sleep: true });
    expectRetained(state);
    state = toggleDeviceState(fan.id, state);
    expect(readFanControllerState(fan, state)).toMatchObject({ on: true, speed: 80, effectiveSpeed: 35, sleep: true });
    state = applyDeviceSetting(fan.id, state, 'fanSleepMode', false);
    expect(readFanControllerState(fan, state)).toMatchObject({ speed: 80, effectiveSpeed: 80, direction: 'reverse', velocity: -80 * 0.13 });
    state = applyDeviceSetting(fan.id, state, 'fanDirection', 'forward');
    expect(readFanControllerState(fan, state)?.velocity).toBe(80 * 0.13);
    expectRetained(state);
  });

  it('retains existing property velocity for bounded, fractional and malformed values without inventing airflow', () => {
    for (const level of [-20, 0, 0.5, 35, 63.75, 100, 300, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const sleep of [false, true]) {
        for (const direction of ['forward', 'reverse'] as const) {
          const state = { on: true, level, settings: { fanSleepMode: sleep, fanDirection: direction } };
          const bounded = Number.isFinite(level) ? Math.max(0, Math.min(100, level)) : 0;
          const effective = sleep ? Math.min(bounded, 35) : bounded;
          const velocity = effective === 0 ? 0 : effective * 0.13 * (direction === 'reverse' ? -1 : 1);
          expect(readFanControllerState(fan, state)).toMatchObject({ speed: bounded, effectiveSpeed: effective, velocity });
          expect(fanPreviewVelocity(fan, state)).toBe(velocity);
          expect(readDeviceSetting(fan, state, 'speed')).toBe(bounded);
        }
      }
    }
    const malformed = { on: true, level: 60, settings: { fanSleepMode: 'true', fanDirection: 'sideways' } };
    expect(readFanControllerState(fan, malformed)).toMatchObject({ sleep: false, direction: 'forward', effectiveSpeed: 60 });
    const recovered = runDeviceActionState(fan.id, { on: false, level: Number.NaN }, fanControllerActionId('speedUp'));
    expect(readFanControllerState(fan, recovered)).toMatchObject({ on: false, speed: 10, effectiveSpeed: 0 });
  });

  it('preserves legacy Breeze, Standard and Turbo behavior alongside the new power-preserving controls', () => {
    for (const [action, speed] of [['fan-breeze', 35], ['fan-standard', 60], ['fan-turbo', 90]] as const) {
      const state = runDeviceActionState(fan.id, { on: false, level: 10, settings: { fanSleepMode: true } }, action);
      expect(readFanControllerState(fan, state)).toMatchObject({ on: true, speed, sleep: true, effectiveSpeed: 35 });
      expectRetained(state);
    }
  });

  it('rejects unsupported actions and invalid preferences without changing accepted state', () => {
    const state = { on: false, level: 50 };
    expect(applyDeviceSetting(fan.id, state, 'speed', Number.NaN)).toBe(state);
    expect(applyDeviceSetting(fan.id, state, 'fanDirection', 'oscillate')).toBe(state);
    expect(applyDeviceSetting(fan.id, state, 'fanSleepMode', 'true')).toBe(state);
    expect(runDeviceActionState(fan.id, state, 'fan-read-airflow')).toBe(state);
    expect(runDeviceActionState('living-light', state, fanControllerActionId('speedUp'))).toBe(state);
  });

  it('respects view-only and revoked access through captured callbacks', () => {
    const before = useHomeStore.getState().deviceStates;
    const { toggleDevice, setDeviceSetting, runDeviceAction } = useHomeStore.getState();
    const access = { ...EMPTY_SCENE_ACCESS, roomIds: [fan.roomId], deviceIds: [fan.id] };
    useHomeStore.setState({ access });
    toggleDevice(fan.id);
    setDeviceSetting(fan.id, 'speed', 100);
    runDeviceAction(fan.id, fanControllerActionId('speedUp'));
    expect(useHomeStore.getState().deviceStates).toBe(before);
    useHomeStore.setState({ access: { ...access, controllableDeviceIds: [fan.id] } });
    setDeviceSetting(fan.id, 'speed', 60);
    const accepted = useHomeStore.getState().deviceStates;
    expect(accepted[fan.id].level).toBe(60);
    useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
    runDeviceAction(fan.id, fanControllerActionId('speedDown'));
    setDeviceSetting(fan.id, 'fanDirection', 'reverse');
    setDeviceSetting(fan.id, 'fanSleepMode', true);
    toggleDevice(fan.id);
    expect(useHomeStore.getState().deviceStates).toBe(accepted);
  });
});
