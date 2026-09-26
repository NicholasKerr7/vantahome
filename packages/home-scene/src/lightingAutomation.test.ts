import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICES } from './data';
import { synchronizeSolarLights } from './lightingAutomation';
import { applyPreset, createDefaultState, parseStoredState, useHomeStore } from './state';

const poles = DEVICES.filter((device) => device.model === 'solar-streetlight');

describe('dusk-to-dawn solar lighting', () => {
  beforeEach(() => useHomeStore.setState(createDefaultState()));

  it('adds exactly four poles and never changes unrelated device state', () => {
    expect(poles).toHaveLength(4);
    const initial = createDefaultState().deviceStates;
    const after = synchronizeSolarLights(initial, true);
    for (const device of DEVICES) {
      if (device.model === 'solar-streetlight') {
        expect(after[device.id]).toEqual({ ...initial[device.id], on: true });
        expect(initial[device.id].on).toBe(false);
      } else expect(after[device.id]).toBe(initial[device.id]);
    }
    expect(synchronizeSolarLights(after, true)).toBe(after);
  });

  it('follows clock transitions and preserves brightness through dawn', () => {
    const store = useHomeStore.getState();
    store.setDeviceLevel(poles[0].id, 36);
    store.syncAutomaticLighting(true);
    expect(useHomeStore.getState().night).toBe(true);
    expect(useHomeStore.getState().deviceStates[poles[0].id]).toEqual({ on: true, level: 36 });
    store.syncAutomaticLighting(false);
    expect(useHomeStore.getState().deviceStates[poles[0].id]).toEqual({ on: false, level: 36 });
  });

  it('allows manual previews without the clock overwriting them', () => {
    const store = useHomeStore.getState();
    store.setNight(true);
    store.syncAutomaticLighting(false);
    expect(useHomeStore.getState()).toMatchObject({ night: true, lightingMode: 'night' });
    store.setLightingMode('auto');
    store.syncAutomaticLighting(false);
    expect(useHomeStore.getState()).toMatchObject({ night: false, lightingMode: 'auto' });
    expect(poles.every((pole) => !useHomeStore.getState().deviceStates[pole.id].on)).toBe(true);
  });

  it('keeps solar lights synchronized when a home resets during automatic night', () => {
    useHomeStore.getState().syncAutomaticLighting(true);
    useHomeStore.getState().reset(true);
    expect(useHomeStore.getState()).toMatchObject({ night: true, lightingMode: 'auto' });
    expect(poles.every((pole) => useHomeStore.getState().deviceStates[pole.id].on)).toBe(true);
  });

  it('retains individual controls until the next automation transition', () => {
    const store = useHomeStore.getState();
    store.syncAutomaticLighting(true);
    store.toggleDevice(poles[0].id);
    store.setDeviceLevel('living-light', 12);
    expect(useHomeStore.getState().deviceStates[poles[0].id].on).toBe(false);
    store.syncAutomaticLighting(false);
    store.syncAutomaticLighting(true);
    expect(useHomeStore.getState().deviceStates[poles[0].id].on).toBe(true);
  });

  it('restores the new automatic mode for existing saved homes without losing devices', () => {
    const previous = { ...createDefaultState(), lightingMode: undefined, night: true };
    previous.deviceStates['living-light'].level = 29;
    const migrated = parseStoredState(JSON.stringify({ version: 5, state: previous }));
    expect(migrated.lightingMode).toBe('auto');
    expect(migrated.deviceStates['living-light'].level).toBe(29);
  });

  it('keeps night and morning presets consistent with their solar lights', () => {
    const night = applyPreset(createDefaultState(), 'night');
    expect(night.lightingMode).toBe('night');
    expect(poles.every((pole) => night.deviceStates[pole.id].on)).toBe(true);
    const morning = applyPreset(night, 'morning');
    expect(morning.lightingMode).toBe('day');
    expect(poles.every((pole) => !morning.deviceStates[pole.id].on)).toBe(true);
  });
});
