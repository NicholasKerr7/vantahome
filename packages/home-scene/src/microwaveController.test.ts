import { afterEach, beforeEach, expect, it } from 'vitest';
import { getDevice } from './data';
import { deviceActionFeedback } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState } from './deviceControlActions';
import { readMicrowaveControllerState } from './microwaveController';
import { createMicrowaveEquipmentArtwork } from './microwaveArtwork';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';
import type { DeviceState } from './simulationTypes';
const microwave = getDevice('kitchen-microwave')!;
/** Isolate permissions and canonical state across tests. */
function reset() { useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS }); }
beforeEach(reset); afterEach(reset);
it('uses missing defaults and does not expose a microwave for another appliance', () => {
  expect(readMicrowaveControllerState(microwave, { on: false, level: 0 })).toMatchObject({ power: 7, seconds: 0, duration: '0:00', mode: 'Reheat', on: false });
  expect(readMicrowaveControllerState(getDevice('kitchen-fridge')!, { on: true, level: 0 })).toBeNull();
});
it.each([false, true])('preferences preserve activity %s and both persisted formats', (on) => {
  let state: DeviceState = { on, level: 0, settings: { timeRemainingSec: 150, microwavePower: 7, microwaveMode: 'Reheat' } };
  state = applyDeviceSetting(microwave.id, state, 'microwaveMode', 'Defrost');
  for (let i = 0; i < 20; i++) state = runDeviceActionState(microwave.id, state, 'microwave-power-up');
  expect(state).toMatchObject({ on, settings: { microwavePower: 10, microwaveMode: 'Defrost', timeRemainingSec: 150 } });
  expect(deviceActionFeedback(microwave, state)).toBe('Power level 10 of 10 · saved preference');
  for (let i = 0; i < 20; i++) state = runDeviceActionState(microwave.id, state, 'microwave-power-down');
  expect(state.settings?.microwavePower).toBe(1);
  expect(readMicrowaveControllerState(microwave, state)?.duration).toBe('2:30');
  const snapshot = createDefaultSimulationSnapshot(); snapshot.deviceStates[microwave.id] = state;
  expect(parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot })?.state.deviceStates[microwave.id]).toEqual(state);
  const browser = createDefaultState(); browser.deviceStates[microwave.id] = state;
  expect(parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser })).deviceStates[microwave.id]).toEqual(state);
});
it.each([NaN, Infinity, 0, 11, 2.5, '7', false])('does not coerce malformed power %s', (value) => {
  const state = { on: false, level: 0, settings: { microwavePower: value } };
  expect(readMicrowaveControllerState(microwave, state)?.power).toBeNull();
  expect(runDeviceActionState(microwave.id, state, 'microwave-power-up')).toBe(state);
});
it.each([NaN, Infinity, -1, 901, 15, '60', false])('does not start or extend malformed duration %s', (value) => {
  const state = { on: false, level: 0, settings: { timeRemainingSec: value } };
  expect(readMicrowaveControllerState(microwave, state)?.seconds).toBeNull();
  expect(runDeviceActionState(microwave.id, state, 'microwave-add-30')).toBe(state);
  expect(runDeviceActionState(microwave.id, state, 'microwave-start')).toMatchObject({ on: true, settings: { timeRemainingSec: 60 } });
});
it('uses latest accepted time/power for rapid taps, then explicitly stops and clears duration only', () => {
  const store = useHomeStore.getState(), before = store.deviceStates;
  store.runDeviceAction(microwave.id, 'microwave-stop');
  for (const action of ['microwave-add-30','microwave-add-60','microwave-add-120','microwave-power-up','microwave-power-up']) store.runDeviceAction(microwave.id, action);
  expect(useHomeStore.getState().deviceStates[microwave.id]).toMatchObject({ on: true, settings: { timeRemainingSec: 210, microwavePower: 9 } });
  for (let i = 0; i < 12; i++) store.runDeviceAction(microwave.id, 'microwave-add-120');
  expect(readMicrowaveControllerState(microwave, useHomeStore.getState().deviceStates[microwave.id])?.duration).toBe('15:00');
  store.runDeviceAction(microwave.id, 'microwave-stop');
  expect(useHomeStore.getState().deviceStates[microwave.id]).toMatchObject({ on: false, settings: { timeRemainingSec: 0, microwavePower: 9 } });
  for (const [id,state] of Object.entries(before)) if (id !== microwave.id) expect(useHomeStore.getState().deviceStates[id]).toBe(state);
});
it('rejects stale captured commands after grant revocation', () => {
  const store = useHomeStore.getState(), before = store.deviceStates;
  useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
  store.runDeviceAction(microwave.id, 'microwave-start'); store.runDeviceAction(microwave.id, 'microwave-power-up'); store.setDeviceSetting(microwave.id, 'microwaveMode', 'Grill');
  expect(useHomeStore.getState().deviceStates).toBe(before);
});
it('keeps fixed lightweight geometry while accepted power changes cavity paint and status light', () => {
  const drawing = createMicrowaveEquipmentArtwork('first', true), off = createMicrowaveEquipmentArtwork('first', false);
  expect(drawing.shapes.length).toBeLessThan(45);
  expect(drawing.shapes.map((shape) => 'd' in shape ? shape.d : shape.kind)).toEqual(off.shapes.map((shape) => 'd' in shape ? shape.d : shape.kind));
  const ids = new Set(drawing.gradients.map((g) => g.id));
  for (const shape of drawing.shapes) for (const color of [shape.fill,shape.stroke]) if (color?.startsWith('url')) expect(ids.has(color.slice(5,-1))).toBe(true);
  expect(drawing.shapes.find((s) => 'testId' in s && s.testId === 'microwave-preview-light')).not.toEqual(off.shapes.find((s) => 'testId' in s && s.testId === 'microwave-preview-light'));
});
