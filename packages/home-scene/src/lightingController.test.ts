import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEVICES, getDevice, type DeviceDefinition } from './data';
import { deviceActionFeedback, getCapabilities, validateSetting } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState } from './deviceControlActions';
import { createDefaultDevicePlacement, getRuntimePlacements, replaceRuntimeDevices } from './devicePlacement';
import { readLabLightState } from './lightAppearance';
import { synchronizeSolarLights } from './lightingAutomation';
import {
  LIGHT_COLOR_PRESETS, LIGHT_WHITE_PRESETS, lightingActionId, readLightingControllerState,
  type LightingControllerKey,
} from './lightingController';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

const light = getDevice('living-light')!;
const controllerKeys: readonly LightingControllerKey[] = ['brighter', 'dimmer', 'white', 'color'];
const preferences = { adaptiveLighting: true, motionBoost: true, nightShift: true, autoOffMin: 45, scheduleEnabled: true, scheduleHour: 19 };

/** Restore authored fixtures and full test access after exercising revocation or runtime devices. */
function resetStore(): void {
  replaceRuntimeDevices([]);
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
}

/** Round-trip saved controls through the native hydration and browser cache validators. */
function expectRetained(state: DeviceState, device: DeviceDefinition = light): void {
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[device.id] = state;
  const restoredNative = parseStoredSimulationSnapshotMessage(JSON.stringify({
    channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot, placements: getRuntimePlacements(),
  }));
  const browser = createDefaultState();
  browser.deviceStates[device.id] = state;
  const restoredBrowser = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(restoredNative?.state.deviceStates[device.id]).toEqual(state);
  expect(restoredBrowser.deviceStates[device.id]).toEqual(state);
}

describe('shared lighting controller', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('shares the canonical palette, white temperatures and four allowlisted manual actions', () => {
    const capabilities = getCapabilities('light');
    const color = capabilities.find((capability) => 'field' in capability && capability.field === 'color');
    const temperature = capabilities.find((capability) => 'field' in capability && capability.field === 'colorTempK');
    expect(color?.type).toBe('enum');
    if (color?.type !== 'enum' || !temperature) throw new Error('Expected light color and temperature controls');
    expect(color.options).toEqual(LIGHT_COLOR_PRESETS);
    expect(LIGHT_COLOR_PRESETS.map((preset) => preset.value)).toEqual(['#FFD166', '#A0E9FF', '#FF9AA2', '#B69CFF', '#A5FF9B', '#FFFFFF']);
    expect(LIGHT_WHITE_PRESETS).toEqual([
      { label: 'Warm', value: 2400 }, { label: 'Soft', value: 3000 },
      { label: 'Neutral', value: 4000 }, { label: 'Daylight', value: 5200 },
    ]);
    for (const preset of LIGHT_WHITE_PRESETS) expect(validateSetting(temperature, preset.value)).toBe(preset.value);
    const actionIds = capabilities.filter((capability) => capability.type === 'action').map((capability) => capability.id);
    expect(new Set(controllerKeys.map(lightingActionId)).size).toBe(controllerKeys.length);
    for (const key of controllerKeys) expect(actionIds).toContain(lightingActionId(key));
  });

  it('retains saved brightness while an off or zero-brightness light has no visual emission', () => {
    expect(readLightingControllerState(light, { on: false, level: 35 })).toEqual({
      on: false, brightness: 35, colorMode: 'color', color: '#FFD166', temperatureK: 3200,
      effect: 'none', effectLabel: null, previewColor: '#FFD166', previewBrightness: 0, status: 'Off',
    });
    expect(readLightingControllerState(light, { on: true, level: 0 })).toMatchObject({
      on: true, brightness: 0, previewBrightness: 0, status: 'On',
    });
  });

  it.each([
    ['focus', 'Focus', 1], ['relax', 'Relax', 0.6], ['sunset', 'Sunset', 0.5], ['party', 'Party', 0.8],
  ] as const)('matches the property preview for %s without replacing the saved manual settings', (effect, effectLabel, gain) => {
    const state = { on: true, level: 50, settings: { color: '#B69CFF', colorTempK: 4000, lightColorMode: 'temperature', lightEffect: effect } };
    const appearance = readLabLightState(light, state);
    expect(readLightingControllerState(light, state)).toMatchObject({
      brightness: 50, color: '#B69CFF', colorMode: 'temperature', temperatureK: 4000,
      effect, effectLabel, previewColor: appearance.colorHex, previewBrightness: 50 * gain,
    });
    const off = { ...state, on: false };
    expect(readLightingControllerState(light, off)).toMatchObject({ brightness: 50, effect, effectLabel, previewBrightness: 0 });
    expectRetained(off);
  });

  it.each([false, true])('bounds relative brightness and clears effects while preserving power %s and preferences', (on) => {
    const original = { on, level: 98, settings: { ...preferences, color: '#FF9AA2', colorTempK: 3000, lightColorMode: 'color', lightEffect: 'party' } };
    const brighter = runDeviceActionState(light.id, original, lightingActionId('brighter'));
    expect(brighter).toEqual({ on, level: 100, settings: { ...original.settings, lightEffect: 'none', lastAction: 'light-brightness-up' } });
    expect(deviceActionFeedback(light, brighter)).toBe(`${on ? '' : 'Off · '}Brighter · 100%`);
    expect(runDeviceActionState(light.id, brighter, lightingActionId('brighter'))).toEqual(brighter);
    const dimmer = runDeviceActionState(light.id, { ...original, level: 2 }, lightingActionId('dimmer'));
    expect(dimmer).toMatchObject({ on, level: 0, settings: { ...preferences, lightEffect: 'none' } });
    expect(runDeviceActionState(light.id, dimmer, lightingActionId('dimmer'))).toEqual(dimmer);
    const raisedFromZero = runDeviceActionState(light.id, dimmer, lightingActionId('brighter'));
    expect(raisedFromZero).toMatchObject({ on, level: 5 });
    expect(original.settings.lightEffect).toBe('party');
    expect(original.level).toBe(98);
    for (const state of [brighter, dimmer, raisedFromZero]) {
      expect(state.settings?.brightness).toBeUndefined();
      expectRetained(state);
    }
  });

  it('accumulates rapid presses against current shared state while remaining off', () => {
    const initial = createDefaultState();
    initial.deviceStates[light.id] = { on: false, level: 25, settings: { ...preferences, lightEffect: 'sunset' } };
    useHomeStore.setState(initial);
    const send = useHomeStore.getState().runDeviceAction;
    for (let index = 0; index < 8; index += 1) send(light.id, lightingActionId('brighter'));
    for (let index = 0; index < 3; index += 1) send(light.id, lightingActionId('dimmer'));
    const state = useHomeStore.getState().deviceStates[light.id];
    expect(readLightingControllerState(light, state)).toMatchObject({ on: false, brightness: 50, previewBrightness: 0, effect: 'none' });
    expect(state.settings).toMatchObject(preferences);
    expectRetained(state);
  });

  it.each([false, true])('uses manual swatches, white presets and mode actions without changing power %s', (on) => {
    const original = { on, level: 40, settings: { ...preferences, color: '#B69CFF', colorTempK: 4000, lightColorMode: 'color', lightEffect: 'party' } };
    for (const preset of LIGHT_COLOR_PRESETS) {
      const state = applyDeviceSetting(light.id, original, 'color', preset.value);
      expect(readLightingControllerState(light, state)).toMatchObject({ on, brightness: 40, color: preset.value, colorMode: 'color', effect: 'none', effectLabel: null, previewColor: preset.value });
      expect(state.settings).toMatchObject(preferences);
      expectRetained(state);
    }
    for (const preset of LIGHT_WHITE_PRESETS) {
      const state = applyDeviceSetting(light.id, original, 'colorTempK', preset.value);
      expect(readLightingControllerState(light, state)).toMatchObject({ on, brightness: 40, temperatureK: preset.value, colorMode: 'temperature', effect: 'none', effectLabel: null });
      expectRetained(state);
    }
    for (const key of ['white', 'color'] as const) {
      const state = runDeviceActionState(light.id, original, lightingActionId(key));
      expect(state).toEqual({ on, level: 40, settings: {
        ...original.settings, lightColorMode: key === 'white' ? 'temperature' : 'color', lightEffect: 'none', lastAction: lightingActionId(key),
      } });
      expect(deviceActionFeedback(light, state)).toBe(`${on ? '' : 'Off · '}${key === 'white' ? 'White light' : 'Color light'} · 40%`);
      expectRetained(state);
    }
    expect(original.settings.lightEffect).toBe('party');
  });

  it('preserves the existing advanced white scene action labels and explicit turn-on behavior', () => {
    const actions = getCapabilities('light').filter((capability) => capability.type === 'action');
    for (const preset of LIGHT_WHITE_PRESETS) {
      const action = actions.find((capability) => capability.id === `light-white-${preset.value}`)!;
      expect(action.label).toBe(preset.label === 'Daylight' ? 'Daylight' : `${preset.label} white`);
      expect(runDeviceActionState(light.id, { on: false, level: 35 }, action.id)).toMatchObject({ on: true, level: 35, settings: { colorTempK: preset.value } });
    }
  });

  it('keeps read-only and revoked callbacks from changing lighting settings', () => {
    const before = useHomeStore.getState().deviceStates[light.id];
    const send = useHomeStore.getState().runDeviceAction;
    const setSetting = useHomeStore.getState().setDeviceSetting;
    useHomeStore.setState({ access: { ...EMPTY_SCENE_ACCESS, roomIds: [light.roomId], deviceIds: [light.id] } });
    for (const key of controllerKeys) send(light.id, lightingActionId(key));
    setSetting(light.id, 'color', '#FFFFFF');
    setSetting(light.id, 'colorTempK', 5200);
    expect(useHomeStore.getState().deviceStates[light.id]).toBe(before);
    useHomeStore.setState({ access: FULL_SCENE_ACCESS });
    send(light.id, lightingActionId('white'));
    const accepted = useHomeStore.getState().deviceStates[light.id];
    useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
    for (const key of controllerKeys) send(light.id, lightingActionId(key));
    setSetting(light.id, 'color', '#FFFFFF');
    expect(useHomeStore.getState().deviceStates[light.id]).toBe(accepted);
  });

  it('works across authored fixtures and a placed light without modifying its template', () => {
    const solar = DEVICES.find((device) => device.model === 'solar-streetlight')!;
    for (const device of [light, getDevice('master-light')!, getDevice('master-bedside-left')!, getDevice('grounds-light')!, solar]) {
      const state = runDeviceActionState(device.id, { on: false, level: 35 }, lightingActionId('brighter'));
      expect(readLightingControllerState(device, state)).toMatchObject({ on: false, brightness: 40 });
      expectRetained(state, device);
    }
    const id = 'placed-00000000-0000-4000-8000-000000000081';
    replaceRuntimeDevices([{ id, name: 'Placed light', placement: createDefaultDevicePlacement('master-light', 'living')! }]);
    const device = getDevice(id)!;
    const initial = createDefaultState();
    const templateBefore = initial.deviceStates[device.templateDeviceId!];
    initial.deviceStates[id] = { on: false, level: 15, settings: { lightEffect: 'party' } };
    useHomeStore.setState({ ...initial, access: { ...FULL_SCENE_ACCESS,
      deviceIds: [...FULL_SCENE_ACCESS.deviceIds, id], controllableDeviceIds: [...FULL_SCENE_ACCESS.controllableDeviceIds, id],
    } });
    useHomeStore.getState().runDeviceAction(id, lightingActionId('brighter'));
    const state = useHomeStore.getState().deviceStates[id];
    expect(state).toMatchObject({ on: false, level: 20, settings: { lightEffect: 'none' } });
    expect(useHomeStore.getState().deviceStates[device.templateDeviceId!]).toBe(templateBefore);
    expectRetained(state, device);
  });

  it('preserves manual settings during solar power synchronization and existing safety overrides', () => {
    const solar = DEVICES.find((device) => device.model === 'solar-streetlight')!;
    const snapshot = createDefaultSimulationSnapshot();
    snapshot.deviceStates[solar.id] = runDeviceActionState(solar.id, { on: false, level: 25, settings: { color: '#A5FF9B' } }, lightingActionId('brighter'));
    const night = synchronizeSolarLights(snapshot.deviceStates, true);
    expect(night[solar.id]).toEqual({ ...snapshot.deviceStates[solar.id], on: true });
    expect(synchronizeSolarLights(night, false)[solar.id]).toEqual(snapshot.deviceStates[solar.id]);
    const smoke = DEVICES.find((device) => device.kind === 'smoke')!;
    const send = useHomeStore.getState().runDeviceAction;
    send(smoke.id, 'smoke-test-alarm');
    for (const key of controllerKeys) {
      send(light.id, lightingActionId(key));
      expect(useHomeStore.getState().deviceStates[light.id]).toMatchObject({ on: true, level: 100,
        settings: { lightColorMode: 'temperature', colorTempK: 4000, lightEffect: 'none' } });
    }
  });
});
