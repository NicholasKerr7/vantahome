import { afterEach, beforeEach, expect, it } from 'vitest';
import { getDevice } from './data';
import { deviceActionFeedback } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState } from './deviceControlActions';
import { REFRIGERATOR_MODES, refrigeratorControllerActionId, readRefrigeratorControllerState } from './refrigeratorController';
import { createRefrigeratorEquipmentArtwork } from './refrigeratorArtwork';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';
const fridge = getDevice('kitchen-fridge')!;
/** Isolate grants and canonical state between cases. */
function reset() { useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS }); }
/** Check native and embedded persisted formats, including every independent refrigerator preference. */
function retained(state: DeviceState) {
  const snapshot = createDefaultSimulationSnapshot(); snapshot.deviceStates[fridge.id] = state;
  const native = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
  const browser = createDefaultState(); browser.deviceStates[fridge.id] = state;
  expect(native?.state.deviceStates[fridge.id]).toEqual(state);
  expect(parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser })).deviceStates[fridge.id]).toEqual(state);
}
beforeEach(reset); afterEach(reset);
it('uses established missing defaults, distinct targets and refrigerator-only scope', () => {
  expect(readRefrigeratorControllerState(fridge, { on: false, level: 0 })).toMatchObject({ on: false, tempC: 4, freezerTempC: -18, mode: 'normal', quickCool: false, quickFreeze: false, iceMaker: true });
  expect(readRefrigeratorControllerState(getDevice('living-light')!, { on: true, level: 0 })).toBeNull();
});
it.each([false, true])('bounds atomic target steps and preserves power %s, other targets and settings', (on) => {
  let state: DeviceState = { on, level: 0, settings: { tempC: 4, freezerTempC: -18, fridgeIceMaker: false, fridgeDoorAlarm: false, fridgeHumidity: 60, fridgeQuickCool: true, fridgeQuickFreeze: true } };
  for (const mode of REFRIGERATOR_MODES) { state = applyDeviceSetting(fridge.id, state, 'fridgeMode', mode.value); expect(state.on).toBe(on); retained(state); }
  for (let i = 0; i < 30; i++) state = runDeviceActionState(fridge.id, state, refrigeratorControllerActionId('fridgeUp'));
  expect(state.settings).toMatchObject({ tempC: 8, freezerTempC: -18, fridgeIceMaker: false, fridgeDoorAlarm: false, fridgeHumidity: 60, fridgeQuickCool: true, fridgeQuickFreeze: true });
  for (let i = 0; i < 30; i++) state = runDeviceActionState(fridge.id, state, refrigeratorControllerActionId('freezerDown'));
  expect(state.settings).toMatchObject({ tempC: 8, freezerTempC: -24 });
  expect(deviceActionFeedback(fridge, state)).toBe('Freezer target -24°C · saved preference');
  for (let i = 0; i < 30; i++) { state = runDeviceActionState(fridge.id, state, refrigeratorControllerActionId('fridgeDown')); state = runDeviceActionState(fridge.id, state, refrigeratorControllerActionId('freezerUp')); }
  expect(state.settings).toMatchObject({ tempC: 1, freezerTempC: -12 }); expect(state.on).toBe(on); retained(state);
});
it.each([NaN, Infinity, 0, 9, 2.5, '4', false])('does not coerce malformed fridge target %s with a relative command', (value) => {
  const state = { on: false, level: 0, settings: { tempC: value } };
  expect(readRefrigeratorControllerState(fridge, state)?.tempC).toBeNull();
  expect(runDeviceActionState(fridge.id, state, refrigeratorControllerActionId('fridgeUp'))).toBe(state);
  expect(readRefrigeratorControllerState(fridge, applyDeviceSetting(fridge.id, state, 'tempC', 4))?.tempC).toBe(4);
});
it.each([NaN, Infinity, -25, -11, -18.5, '-18', false])('does not coerce malformed freezer target %s', (value) => {
  const state = { on: false, level: 0, settings: { freezerTempC: value } };
  expect(readRefrigeratorControllerState(fridge, state)?.freezerTempC).toBeNull();
  expect(runDeviceActionState(fridge.id, state, refrigeratorControllerActionId('freezerDown'))).toBe(state);
});
it('resolves rapid steps against current state and does not touch another device', () => {
  const store = useHomeStore.getState(), before = store.deviceStates;
  store.setDeviceSetting(fridge.id, 'tempC', 4);
  for (const key of ['fridgeUp','fridgeUp','fridgeDown','freezerDown','freezerDown'] as const) store.runDeviceAction(fridge.id, refrigeratorControllerActionId(key));
  const after = useHomeStore.getState().deviceStates;
  expect(after[fridge.id].settings).toMatchObject({ tempC: 5, freezerTempC: -20 });
  for (const [id, state] of Object.entries(before)) if (id !== fridge.id) expect(after[id]).toBe(state);
  retained(after[fridge.id]);
});
it('keeps unknown choices unavailable and rejects captured commands after grant revocation', () => {
  expect(readRefrigeratorControllerState(fridge, { on: false, level: 0, settings: { fridgeMode: 'bad', fridgeQuickCool: 'yes', fridgeQuickFreeze: 1, fridgeIceMaker: 1 } })).toMatchObject({ mode: null, quickCool: null, quickFreeze: null, iceMaker: null });
  const store = useHomeStore.getState(), before = store.deviceStates;
  useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
  store.toggleDevice(fridge.id); store.setDeviceSetting(fridge.id, 'fridgeMode', 'boost'); store.runDeviceAction(fridge.id, refrigeratorControllerActionId('freezerUp'));
  expect(useHomeStore.getState().deviceStates).toBe(before);
});
it('uses bounded instance-local vector geometry and changes only the power indicator', () => {
  const on = createRefrigeratorEquipmentArtwork('on', true), off = createRefrigeratorEquipmentArtwork('on', false);
  expect(on.shapes.length).toBeLessThan(60);
  const changes = on.shapes.filter((shape,i) => JSON.stringify(shape) !== JSON.stringify(off.shapes[i]));
  expect(changes).toHaveLength(1); expect(changes[0]).toMatchObject({ testId: 'refrigerator-status-light' });
  const ids = new Set(on.gradients.map((g) => g.id));
  for (const shape of on.shapes) for (const color of [shape.fill, shape.stroke]) if (color?.startsWith('url')) expect(ids.has(color.slice(5,-1))).toBe(true);
});
