import { afterEach, beforeEach, expect, it } from 'vitest';
import { createCooktopArtwork } from './cooktopArtwork';
import { readCooktopControllerState } from './cooktopController';
import { getDevice } from './data';
import { deviceActionFeedback } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState, toggleDeviceState } from './deviceControlActions';
import { advanceSafetySimulation } from './safetySimulation';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

const cooktop = getDevice('kitchen-stove')!;

/** Isolate canonical controls and access between stateful controller checks. */
function reset(): void { useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS }); }
beforeEach(reset);
afterEach(reset);

it('uses catalog defaults independently of the unrelated generic level', () => {
  expect(readCooktopControllerState(cooktop, { on: false, level: 35 })).toMatchObject({
    on: false, heat: 0, timerMinutes: 0, mode: 'simmer', lockPreference: false,
  });
  expect(readCooktopControllerState(getDevice('kitchen-microwave')!, { on: false, level: 35 })).toBeNull();
});

it.each([false, true])('preserves power %s and all preferences across bounded steps and both stored formats', (on) => {
  let state: DeviceState = { on, level: 35, settings: { burnerLevel: 3, stoveTimerMin: 15, stoveMode: 'simmer', stoveLock: false } };
  state = applyDeviceSetting(cooktop.id, state, 'stoveMode', 'sear');
  state = applyDeviceSetting(cooktop.id, state, 'stoveLock', true);
  for (let index = 0; index < 20; index++) {
    state = runDeviceActionState(cooktop.id, state, 'stove-heat-up');
    state = runDeviceActionState(cooktop.id, state, 'stove-timer-up');
  }
  expect(state).toMatchObject({ on, level: 35, settings: { burnerLevel: 10, stoveTimerMin: 60, stoveMode: 'sear', stoveLock: true } });
  expect(deviceActionFeedback(cooktop, state)).toContain('saved preference');
  for (let index = 0; index < 20; index++) {
    state = runDeviceActionState(cooktop.id, state, 'stove-heat-down');
    state = runDeviceActionState(cooktop.id, state, 'stove-timer-down');
  }
  expect(state).toMatchObject({ on, level: 35, settings: { burnerLevel: 0, stoveTimerMin: 0, stoveMode: 'sear', stoveLock: true } });
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[cooktop.id] = state;
  expect(parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot })?.state.deviceStates[cooktop.id]).toEqual(state);
  const browser = createDefaultState();
  browser.deviceStates[cooktop.id] = state;
  expect(parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser })).deviceStates[cooktop.id]).toEqual(state);
});

it.each([NaN, Infinity, -1, 11, 2.5, '3', false])('does not coerce malformed heat %s through either relative action', (value) => {
  const state: DeviceState = { on: false, level: 35, settings: { burnerLevel: value } };
  expect(readCooktopControllerState(cooktop, state)?.heat).toBeNull();
  expect(runDeviceActionState(cooktop.id, state, 'stove-heat-up')).toBe(state);
  expect(runDeviceActionState(cooktop.id, state, 'stove-heat-down')).toBe(state);
  expect(applyDeviceSetting(cooktop.id, state, 'burnerLevel', 4)).toMatchObject({ on: false, settings: { burnerLevel: 4 } });
});

it.each([NaN, Infinity, -5, 65, 2, '15', false])('does not coerce malformed timer %s through either relative action', (value) => {
  const state: DeviceState = { on: true, level: 35, settings: { stoveTimerMin: value } };
  expect(readCooktopControllerState(cooktop, state)?.timerMinutes).toBeNull();
  expect(runDeviceActionState(cooktop.id, state, 'stove-timer-up')).toBe(state);
  expect(runDeviceActionState(cooktop.id, state, 'stove-timer-down')).toBe(state);
  expect(applyDeviceSetting(cooktop.id, state, 'stoveTimerMin', 20)).toMatchObject({ on: true, settings: { stoveTimerMin: 20 } });
});

it('keeps malformed raw mode, lock and explicit null fields unknown instead of using defaults', () => {
  // Raw restored data may contain values outside the typed in-memory contract.
  const state = { on: true, level: 35, settings: { burnerLevel: null, stoveTimerMin: null, stoveMode: 'grill', stoveLock: 'false' } } as unknown as DeviceState;
  expect(readCooktopControllerState(cooktop, state)).toMatchObject({ heat: null, timerMinutes: null, mode: null, lockPreference: null, status: 'Preview on · heat unavailable' });
  expect(runDeviceActionState(cooktop.id, state, 'stove-heat-up')).toBe(state);
  expect(runDeviceActionState(cooktop.id, state, 'stove-timer-down')).toBe(state);
});

it('reads accepted state for rapid taps without changing power or another appliance', () => {
  const store = useHomeStore.getState();
  const before = store.deviceStates;
  store.setDeviceSetting(cooktop.id, 'burnerLevel', 2);
  store.setDeviceSetting(cooktop.id, 'stoveTimerMin', 10);
  for (let index = 0; index < 3; index++) {
    store.runDeviceAction(cooktop.id, 'stove-heat-up');
    store.runDeviceAction(cooktop.id, 'stove-timer-up');
  }
  expect(useHomeStore.getState().deviceStates[cooktop.id]).toMatchObject({ on: false, settings: { burnerLevel: 5, stoveTimerMin: 25 } });
  for (const [id, state] of Object.entries(before)) if (id !== cooktop.id) expect(useHomeStore.getState().deviceStates[id]).toBe(state);
});

it('retains saved preferences through power changes and does not invent timer or lock operation', () => {
  const preferences = { burnerLevel: 4, stoveTimerMin: 5, stoveMode: 'boil', stoveLock: true };
  let state: DeviceState = { on: false, level: 35, settings: preferences };
  state = toggleDeviceState(cooktop.id, state);
  expect(state).toMatchObject({ on: true, settings: preferences });
  state = runDeviceActionState(cooktop.id, state, 'stove-heat-up');
  expect(state).toMatchObject({ on: true, settings: { ...preferences, burnerLevel: 5 } });
  let states = { ...createDefaultSimulationSnapshot().deviceStates, [cooktop.id]: state };
  for (let second = 0; second < 360; second++) states = advanceSafetySimulation(states, 1);
  expect(states[cooktop.id]).toBe(state);
  expect(toggleDeviceState(cooktop.id, state)).toMatchObject({ on: false, settings: { ...preferences, burnerLevel: 5 } });
});

it('rejects captured commands and preference edits after room access is revoked', () => {
  const store = useHomeStore.getState();
  const before = store.deviceStates;
  useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
  store.runDeviceAction(cooktop.id, 'stove-heat-up');
  store.runDeviceAction(cooktop.id, 'stove-timer-up');
  store.setDeviceSetting(cooktop.id, 'stoveMode', 'sear');
  store.setDeviceSetting(cooktop.id, 'stoveLock', true);
  store.toggleDevice(cooktop.id);
  expect(useHomeStore.getState().deviceStates).toBe(before);
});

it('only illuminates accepted positive heat while on, with local SVG paint references', () => {
  const lit = createCooktopArtwork('hob', true, 5);
  const inactive = [createCooktopArtwork('hob', false, 5), createCooktopArtwork('hob', true, 0), createCooktopArtwork('hob', true, null)];
  const signal = lit.shapes.find((shape) => shape.kind === 'rect' && shape.testId === 'cooktop-preview-indicator');
  expect(signal?.fill).toBe('#F5AE86');
  for (const drawing of inactive) expect(drawing.shapes.find((shape) => shape.kind === 'rect' && shape.testId === 'cooktop-preview-indicator')?.fill).toBe('#776785');
  const ids = new Set(lit.gradients.map((gradient) => gradient.id));
  for (const shape of lit.shapes) for (const paint of [shape.fill, shape.stroke]) if (paint?.startsWith('url')) expect(ids.has(paint.slice(5, -1))).toBe(true);
  expect(createCooktopArtwork('second-hob', true, 5).gradients.every((gradient) => !ids.has(gradient.id))).toBe(true);
  expect(readCooktopControllerState(cooktop, { on: true, level: 35, settings: { burnerLevel: 0 } })?.status).toBe('Preview on · zero heat setting');
});
