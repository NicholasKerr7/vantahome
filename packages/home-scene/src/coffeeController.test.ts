import { afterEach, beforeEach, expect, it } from 'vitest';
import type { DeviceState } from './simulationTypes';
import { getDevice } from './data';
import { deviceActionFeedback, readDeviceSetting } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState } from './deviceControlActions';
import { readCoffeeControllerState } from './coffeeController';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';
const coffee = getDevice('kitchen-coffee')!;
/** Isolate canonical state and grants between cases. */
function reset() { useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS }); }
beforeEach(reset); afterEach(reset);
it('uses missing defaults without exposing controls for another appliance', () => {
  expect(readCoffeeControllerState(coffee, { on: false, level: 0 })).toMatchObject({ strength: 'normal', sizeOz: 8, cups: 2, targetC: 92, on: false });
  expect(readCoffeeControllerState(getDevice('kitchen-fridge')!, { on: true, level: 0 })).toBeNull();
});
it.each([false, true])('recipe changes preserve activity %s, extras and fixed samples through both stored formats', (on) => {
  let state: DeviceState = { on, level: 0, settings: { coffeeMilkFrother: true, coffeeTempC: 96, coffeeKeepWarmMin: 30, coffeeGrinder: false, coffeeAutoBrewTime: '08:00' } };
  for (const [field,value] of Object.entries({ coffeeStrength: 'strong', coffeeSizeOz: 12, coffeeCupCount: 3 })) state = applyDeviceSetting(coffee.id, state, field, value);
  for (let i = 0; i < 10; i++) state = runDeviceActionState(coffee.id, state, 'coffee-cups-up');
  expect(state).toMatchObject({ on, settings: { coffeeCupCount: 6, coffeeStrength: 'strong', coffeeSizeOz: 12, coffeeMilkFrother: true } });
  expect(deviceActionFeedback(coffee, state)).toBe('Cups 6 · saved preference');
  expect(readDeviceSetting(coffee, state, 'coffeeWaterLevel')).toBe(70); expect(readDeviceSetting(coffee, state, 'coffeeBeanLevel')).toBe(55);
  for (let i = 0; i < 10; i++) state = runDeviceActionState(coffee.id, state, 'coffee-cups-down');
  expect(state).toMatchObject({ on, settings: { coffeeCupCount: 1, coffeeTempC: 96 } });
  const snapshot = createDefaultSimulationSnapshot(); snapshot.deviceStates[coffee.id] = state;
  expect(parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot })?.state.deviceStates[coffee.id]).toEqual(state);
  const browser = createDefaultState(); browser.deviceStates[coffee.id] = state;
  expect(parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser })).deviceStates[coffee.id]).toEqual(state);
});
it.each([NaN, Infinity, 0, 7, 2.5, '2', false])('does not coerce an invalid saved cup count %s', (value) => {
  const state = { on: false, level: 0, settings: { coffeeCupCount: value } };
  expect(readCoffeeControllerState(coffee, state)?.cups).toBeNull();
  expect(runDeviceActionState(coffee.id, state, 'coffee-cups-up')).toBe(state);
  expect(readCoffeeControllerState(coffee, applyDeviceSetting(coffee.id, state, 'coffeeCupCount', 2))?.cups).toBe(2);
});
it('reports explicit invalid strength and size as unavailable', () => {
  expect(readCoffeeControllerState(coffee, { on: false, level: 0, settings: { coffeeStrength: 'turbo', coffeeSizeOz: '8', coffeeTempC: 99 } })).toMatchObject({ strength: null, sizeOz: null, targetC: null });
});
it('uses latest accepted state for rapid steps; only Brew and Stop change activity', () => {
  const store = useHomeStore.getState(), before = store.deviceStates;
  store.runDeviceAction(coffee.id, 'coffee-stop');
  for (const action of ['coffee-cups-up','coffee-cups-up','coffee-cups-down']) store.runDeviceAction(coffee.id, action);
  expect(useHomeStore.getState().deviceStates[coffee.id]).toMatchObject({ on: false, settings: { coffeeCupCount: 3 } });
  store.runDeviceAction(coffee.id, 'coffee-brew');
  const brewing = useHomeStore.getState().deviceStates[coffee.id]; expect(brewing.on).toBe(true);
  expect(deviceActionFeedback(coffee, brewing)).toBe('Brewing preview');
  store.runDeviceAction(coffee.id, 'coffee-stop');
  expect(deviceActionFeedback(coffee, useHomeStore.getState().deviceStates[coffee.id])).toBe('Idle · recipe remembered');
  for (const [id,state] of Object.entries(before)) if (id !== coffee.id) expect(useHomeStore.getState().deviceStates[id]).toBe(state);
});
it('rejects captured recipe and brew commands after grant revocation', () => {
  const store = useHomeStore.getState(), before = store.deviceStates;
  useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
  store.runDeviceAction(coffee.id, 'coffee-brew'); store.runDeviceAction(coffee.id, 'coffee-cups-up'); store.setDeviceSetting(coffee.id, 'coffeeStrength', 'strong');
  expect(useHomeStore.getState().deviceStates).toBe(before);
});
