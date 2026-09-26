import { beforeEach, describe, expect, it } from 'vitest';
import manifest from './house-manifest.json';
import { DEVICES, ROOMS, getDevice, getRoom, isPositionDevice, validateHouseManifest } from './data';
import { DEVICE_KINDS, LEGACY_DEVICE_IDS, getCapabilities, isMonitor, readDeviceSetting, validateSetting } from './deviceCapabilities';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

/** Locate a real manifest instance to exercise each schema against actual catalog data. */
function deviceOfKind(kind: typeof DEVICE_KINDS[number]) { return DEVICES.find((device) => device.kind === kind)!; }

beforeEach(() => useHomeStore.getState().reset());

describe('complete house catalog', () => {
  it('covers all repository kinds, proposed service extensions and the seven original IDs', () => {
    expect(new Set(DEVICES.map((device) => device.kind))).toEqual(new Set(DEVICE_KINDS));
    expect(LEGACY_DEVICE_IDS.every((id) => getDevice(id))).toBe(true);
    expect(ROOMS.filter((room) => room.id.startsWith('bedroom-')).length).toBe(5);
    expect(ROOMS.filter((room) => room.id.startsWith('bath-')).length).toBe(7);
    expect(DEVICES.every((device) => ROOMS.some((room) => room.id === device.roomId))).toBe(true);
  });

  it.each(['room', 'device', 'placement', 'hotspot', 'kind'])('rejects invalid %s catalog data rather than silently inventing it', (field) => {
    const candidate = structuredClone(manifest);
    if (field === 'room') candidate.devices[0].roomId = 'unknown-room';
    if (field === 'device') candidate.devices[1].id = candidate.devices[0].id;
    if (field === 'placement') candidate.devices[0].dimensions[0] = -1;
    if (field === 'hotspot') candidate.devices[0].hotspot[0] = Infinity;
    if (field === 'kind') candidate.devices[0].kind = 'unknown-kind';
    expect(() => validateHouseManifest(candidate)).toThrow();
  });

  it.each(DEVICE_KINDS)('%s has usable, finite, semantically bounded settings', (kind) => {
    const device = deviceOfKind(kind);
    const state = createDefaultState().deviceStates[device.id];
    const capabilities = getCapabilities(kind);
    expect(capabilities.length).toBeGreaterThan(0);
    expect(new Set(capabilities.map((item) => item.id)).size).toBe(capabilities.length);
    for (const capability of capabilities) {
      if (!('field' in capability)) continue;
      const value = readDeviceSetting(device, state, capability.field);
      if (capability.type === 'range') {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThanOrEqual(capability.min);
        expect(value).toBeLessThanOrEqual(capability.max);
        expect(validateSetting(capability, NaN)).toBeUndefined();
        expect(validateSetting(capability, Infinity)).toBeUndefined();
      }
      if (capability.type === 'enum') expect(capability.options.some((option) => option.value === value)).toBe(true);
      if (capability.type === 'toggle') expect(typeof value).toBe('boolean');
    }
  });
});

describe('expanded control semantics', () => {
  it.each(['door', 'window', 'garage', 'gate', 'blinds'] as const)('%s opening actions keep position and status coherent', (kind) => {
    const device = deviceOfKind(kind);
    useHomeStore.getState().setDeviceLevel(device.id, 37);
    expect(useHomeStore.getState().deviceStates[device.id]).toMatchObject({ on: true, level: 37 });
    useHomeStore.getState().toggleDevice(device.id);
    expect(useHomeStore.getState().deviceStates[device.id]).toMatchObject({ on: false, level: 0 });
    expect(isPositionDevice(device)).toBe(true);
  });

  it('validates temperature and mode without allowing unrelated settings', () => {
    const device = deviceOfKind('fridge');
    useHomeStore.getState().setDeviceSetting(device.id, 'tempC', 900);
    expect(readDeviceSetting(device, useHomeStore.getState().deviceStates[device.id], 'tempC')).toBe(8);
    const before = useHomeStore.getState().deviceStates[device.id];
    useHomeStore.getState().setDeviceSetting(device.id, 'injected', true);
    expect(useHomeStore.getState().deviceStates[device.id]).toBe(before);
    useHomeStore.getState().setDeviceSetting('master-ac', 'mode', 'invalid');
    expect(useHomeStore.getState().deviceStates['master-ac'].settings).toBeUndefined();
  });

  it('cycles appliances through their explicit start and pause actions', () => {
    const device = deviceOfKind('dishwasher');
    useHomeStore.getState().runDeviceAction(device.id, 'dishwasher-start');
    expect(useHomeStore.getState().deviceStates[device.id].on).toBe(true);
    useHomeStore.getState().runDeviceAction(device.id, 'dishwasher-pause');
    expect(useHomeStore.getState().deviceStates[device.id].on).toBe(false);
    const before = useHomeStore.getState().deviceStates[device.id];
    useHomeStore.getState().runDeviceAction(device.id, 'vacuum-start');
    expect(useHomeStore.getState().deviceStates[device.id]).toBe(before);
  });

  it('starts a microwave with a usable default duration and preserves it when paused', () => {
    const device = deviceOfKind('microwave');
    useHomeStore.getState().toggleDevice(device.id);
    expect(useHomeStore.getState().deviceStates[device.id]).toMatchObject({ on: true, settings: { timeRemainingSec: 60 } });
    useHomeStore.getState().toggleDevice(device.id);
    expect(useHomeStore.getState().deviceStates[device.id]).toMatchObject({ on: false, settings: { timeRemainingSec: 60 } });
  });

  it.each(DEVICE_KINDS.filter(isMonitor))('%s checks readings without offering synthetic power or editable telemetry', (kind) => {
    const device = deviceOfKind(kind);
    useHomeStore.getState().toggleDevice(device.id);
    const checked = useHomeStore.getState().deviceStates[device.id];
    expect(checked).toMatchObject({ on: true, settings: { sampleChecked: true } });
    const reading = getCapabilities(kind).find((item) => item.type === 'stat');
    if (reading?.type === 'stat') {
      useHomeStore.getState().setDeviceSetting(device.id, reading.field, 999);
      expect(useHomeStore.getState().deviceStates[device.id]).toBe(checked);
    }
  });

  it('preserves mode, settings, sample acknowledgement and vacuum activity across reload', () => {
    useHomeStore.getState().setDeviceSetting('utility-battery', 'storageMode', 'charge');
    useHomeStore.getState().setDeviceSetting('utility-battery', 'reservePercent', 45);
    useHomeStore.getState().toggleDevice('utility-solar');
    useHomeStore.getState().toggleDevice('living-vacuum');
    const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: useHomeStore.getState() }));
    expect(restored.deviceStates['utility-battery'].settings).toMatchObject({ storageMode: 'charge', reservePercent: 45 });
    expect(restored.deviceStates['utility-solar'].settings?.sampleChecked).toBe(true);
    expect(restored.deviceStates['living-vacuum'].settings?.status).toBe('cleaning');
  });

  it('migrates version four by retaining original settings and adding every new default', () => {
    const restored = parseStoredState(JSON.stringify({ version: 4, state: { roomId: 'master', selectedDevice: 'master-blinds', deviceStates: { 'entry-gate': { on: true, level: 50 }, 'master-blinds': { on: true, level: 24 } } } }));
    expect(restored.deviceStates['entry-gate']).toEqual({ on: true, level: 50 });
    expect(restored.deviceStates['master-blinds']).toEqual({ on: true, level: 24 });
    expect(Object.keys(restored.deviceStates).length).toBe(DEVICES.length);
    expect(restored.deviceStates['utility-generator']).toEqual(createDefaultState().deviceStates['utility-generator']);
  });

  it('retains the upper room/device while selecting and immersing in the utility shed', () => {
    useHomeStore.getState().selectDevice('master-blinds');
    useHomeStore.getState().selectDevice('utility-generator');
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'utility', floor: 'upper', view: 'exterior', selectedDevice: 'utility-generator' });
    useHomeStore.getState().setView('immersive');
    useHomeStore.getState().selectHotspotDevice('utility-battery');
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'utility', view: 'immersive', selectedDevice: 'utility-battery' });
    const restored = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: useHomeStore.getState() }));
    expect(restored).toMatchObject({ roomId: 'utility', floor: 'upper', selectedDevice: 'utility-battery' });
    useHomeStore.getState().setView('upper');
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'master', view: 'upper', selectedDevice: 'master-blinds' });
    expect(getRoom('utility').outdoor).toBe(true);
  });
});
