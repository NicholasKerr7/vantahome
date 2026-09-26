import { isMonitor } from './deviceCapabilities';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICES, formatDeviceLevel, getDevice, isPositionDevice, type PresetId } from './data';
import {
  applyPreset,
  clampLevel,
  createDefaultState,
  parseStoredState,
  STORAGE_VERSION,
  useHomeStore,
  type HomeSnapshot,
} from './state';

/** Build realistic persisted input while allowing intentionally invalid payloads. */
function storedEnvelope(state: unknown, version = STORAGE_VERSION): string {
  return JSON.stringify({ version, state });
}

/** Freeze every mutable snapshot layer so preset mutations fail immediately. */
function freezeSnapshot(state: HomeSnapshot): HomeSnapshot {
  Object.values(state.deviceStates).forEach(Object.freeze);
  Object.freeze(state.deviceStates);
  Object.freeze(state.indoorContext);
  return Object.freeze(state);
}

describe('restoring saved simulation state', () => {
  it.each([
    null,
    '',
    '{broken-json',
    'null',
    '[]',
    '42',
    storedEnvelope(createDefaultState(), 1),
    storedEnvelope(createDefaultState(), STORAGE_VERSION + 1),
    storedEnvelope([]),
    storedEnvelope(null),
  ])('recovers usable defaults from an unsupported envelope: %s', (raw) => {
    expect(parseStoredState(raw)).toEqual(createDefaultState());
  });

  it('repairs individual device fields without discarding valid settings', () => {
    const result = parseStoredState(storedEnvelope({
      deviceStates: {
        'living-light': { on: false, level: 230 },
        'living-fan': { on: 'true', level: -12 },
        'family-tv': { on: true, level: 49.7 },
        'laundry-washer': { on: false, level: '72' },
        'master-ac': null,
        'master-blinds': [],
        'injected-device': { on: true, level: 100 },
      },
    }));

    expect(result.deviceStates['living-light']).toEqual({ on: false, level: 100 });
    expect(result.deviceStates['living-fan']).toEqual({ on: true, level: 0 });
    expect(result.deviceStates['family-tv']).toEqual({ on: true, level: 50 });
    expect(result.deviceStates['laundry-washer']).toEqual({ on: false, level: 25 });
    expect(result.deviceStates['master-ac']).toEqual(createDefaultState().deviceStates['master-ac']);
    expect(result.deviceStates['master-blinds']).toEqual(createDefaultState().deviceStates['master-blinds']);
    expect(Object.keys(result.deviceStates).sort()).toEqual(DEVICES.map((device) => device.id).sort());
  });

  it('rejects numeric overflow accepted by JSON without losing a valid power state', () => {
    const raw = `{"version":${STORAGE_VERSION},"state":{"deviceStates":{"living-light":{"on":false,"level":1e400}}}}`;
    expect(parseStoredState(raw).deviceStates['living-light']).toEqual({ on: false, level: 72 });
  });

  it('derives floor and cutaway from the room and clears an incompatible device', () => {
    const result = parseStoredState(storedEnvelope({
      roomId: 'master', floor: 'ground', view: 'ground', selectedDevice: 'living-light',
    }));
    expect(result).toMatchObject({ roomId: 'master', floor: 'upper', view: 'upper', selectedDevice: null });
  });

  it.each(['exterior', 'immersive'])('preserves the %s view and a matching room selection', (view) => {
    const result = parseStoredState(storedEnvelope({
      roomId: 'laundry', floor: 'upper', view, selectedDevice: 'laundry-washer',
    }));
    expect(result).toMatchObject({ roomId: 'laundry', floor: 'ground', view, selectedDevice: 'laundry-washer' });
  });

  it('repairs unknown navigation and rejects truthy strings as preferences', () => {
    const result = parseStoredState(storedEnvelope({
      roomId: 'garage', floor: 'basement', view: 'free-flight', selectedDevice: 'foreign-device',
      night: 'true', motionDisabled: 1, activePreset: 'custom',
    }));
    expect(result).toMatchObject({
      roomId: 'living', floor: 'ground', view: 'ground', selectedDevice: null,
      night: false, motionDisabled: false, activePreset: null,
    });
  });

  it('returns independent default device objects for separate sessions', () => {
    const first = parseStoredState(null);
    const second = parseStoredState(null);
    first.deviceStates['living-light'].level = 4;
    expect(second.deviceStates['living-light'].level).toBe(72);
    expect(createDefaultState().deviceStates['living-light'].level).toBe(72);
  });

  it.each([
    [{ on: false, level: 85 }, { on: false, level: 0 }],
    [{ on: true, level: 0 }, { on: false, level: 0 }],
    [{ on: true, level: 55 }, { on: true, level: 55 }],
  ])('migrates legacy blinds according to their previously visible position', (legacy, expected) => {
    const result = parseStoredState(storedEnvelope({
      roomId: 'master', view: 'immersive', deviceStates: { 'master-blinds': legacy },
    }, 2));
    expect(result.deviceStates['master-blinds']).toEqual(expected);
    expect(result).toMatchObject({ roomId: 'master', floor: 'upper', view: 'immersive' });
  });

  it('uses saved position as the authority for the current blinds schema', () => {
    const result = parseStoredState(storedEnvelope({ deviceStates: { 'master-blinds': { on: false, level: 64 } } }));
    expect(result.deviceStates['master-blinds']).toEqual({ on: true, level: 64 });
  });

  it.each([2, 3])('migrates schema %s with a closed gate and preserves existing preferences', (version) => {
    const result = parseStoredState(storedEnvelope({
      roomId: 'family', view: 'immersive', selectedDevice: 'family-tv',
      night: true, motionDisabled: true, activePreset: null,
      deviceStates: {
        'family-tv': { on: true, level: 62 },
        'living-light': { on: false, level: 33 },
        'master-blinds': { on: false, level: 70 },
        // This key was not part of either legacy schema and must not open a new gate.
        'entry-gate': { on: true, level: 100 },
      },
    }, version));

    expect(result).toMatchObject({ roomId: 'family', floor: 'upper', view: 'immersive', selectedDevice: 'family-tv', night: true, motionDisabled: true, activePreset: null });
    expect(result.deviceStates['family-tv']).toEqual({ on: true, level: 62 });
    expect(result.deviceStates['living-light']).toEqual({ on: false, level: 33 });
    expect(result.deviceStates['master-blinds']).toEqual(version === 2 ? { on: false, level: 0 } : { on: true, level: 70 });
    expect(result.deviceStates['entry-gate']).toEqual({ on: false, level: 0 });
  });

  it('restores gate position as the authority and repairs an incompatible grounds cutaway', () => {
    const result = parseStoredState(storedEnvelope({
      roomId: 'grounds', floor: 'upper', view: 'ground', selectedDevice: 'entry-gate',
      deviceStates: { 'entry-gate': { on: false, level: 50 } },
    }));
    expect(result).toMatchObject({ roomId: 'grounds', floor: 'upper', view: 'exterior', selectedDevice: 'entry-gate', indoorContext: { roomId: 'family', selectedDevice: 'family-tv' } });
    expect(result.deviceStates['entry-gate']).toEqual({ on: true, level: 50 });
  });

  it('preserves an immersive entry view and safely defaults an invalid gate position', () => {
    const result = parseStoredState(storedEnvelope({
      roomId: 'grounds', view: 'immersive', selectedDevice: 'entry-gate',
      deviceStates: { 'entry-gate': { on: true, level: 'open' } },
    }));
    expect(result).toMatchObject({ roomId: 'grounds', floor: 'ground', view: 'immersive', selectedDevice: 'entry-gate' });
    expect(result.deviceStates['entry-gate']).toEqual({ on: false, level: 0 });
  });

  it('restores the exact indoor bookmark while viewing the site', () => {
    const result = parseStoredState(storedEnvelope({
      roomId: 'grounds', floor: 'ground', view: 'immersive', selectedDevice: 'entry-gate',
      indoorContext: { roomId: 'master', selectedDevice: 'master-blinds' },
    }));
    expect(result).toMatchObject({ floor: 'upper', roomId: 'grounds', view: 'immersive', indoorContext: { roomId: 'master', selectedDevice: 'master-blinds' } });
  });

  it('rejects an exterior bookmark and mismatched indoor device', () => {
    const invalidRoom = parseStoredState(storedEnvelope({
      roomId: 'grounds', floor: 'upper', view: 'exterior',
      indoorContext: { roomId: 'grounds', selectedDevice: 'entry-gate' },
    }));
    expect(invalidRoom.indoorContext).toEqual({ roomId: 'family', selectedDevice: null });
    const invalidDevice = parseStoredState(storedEnvelope({
      roomId: 'grounds', floor: 'upper', view: 'exterior',
      indoorContext: { roomId: 'master', selectedDevice: 'living-light' },
    }));
    expect(invalidDevice.indoorContext).toEqual({ roomId: 'master', selectedDevice: null });
  });
});

describe('finite device controls', () => {
  it.each([
    [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0], [Number.NEGATIVE_INFINITY, 0],
    [-12, 0], [0, 0], [35.4, 35], [35.5, 36], [100, 100], [900, 100],
  ])('clamps %s to the supported integer value %s', (input, expected) => {
    expect(clampLevel(input)).toBe(expected);
  });
});

describe('preset transactions', () => {
  it.each<PresetId>(['morning', 'movie', 'night', 'away'])('applies %s without mutating input or camera preferences', (preset) => {
    const input = freezeSnapshot({
      ...createDefaultState(), floor: 'upper', roomId: 'master', view: 'immersive',
      selectedDevice: 'master-ac', motionDisabled: true,
    });
    const original = structuredClone(input);
    const result = applyPreset(input, preset);

    expect(input).toEqual(original);
    expect(result).toMatchObject({
      floor: 'upper', roomId: 'master', view: 'immersive', selectedDevice: 'master-ac',
      motionDisabled: true, activePreset: preset,
    });
    expect(result.deviceStates).not.toBe(input.deviceStates);
    for (const device of DEVICES) {
      expect(result.deviceStates[device.id]).not.toBe(input.deviceStates[device.id]);
    }
  });

  it('turns movie lighting and television on together while closing the blinds', () => {
    const result = applyPreset(createDefaultState(), 'movie');
    expect(result.night).toBe(true);
    expect(result.deviceStates['living-light']).toEqual({ on: true, level: 18 });
    expect(result.deviceStates['family-tv']).toEqual({ on: true, level: 45 });
    expect(result.deviceStates['master-blinds']).toEqual({ on: false, level: 0 });
  });

  it('powers down discretionary devices for Away while retaining monitoring and excluding injected entries', () => {
    const input = createDefaultState();
    const polluted = {
      ...input,
      deviceStates: { ...input.deviceStates, 'foreign-device': { on: true, level: 100 } },
    };
    const result = applyPreset(polluted, 'away');
    expect(Object.keys(result.deviceStates).sort()).toEqual(DEVICES.map((device) => device.id).sort());
    for (const device of DEVICES) expect(result.deviceStates[device.id].on).toBe(isMonitor(device.kind) || ['fridge', 'battery', 'camera'].includes(device.kind));
    expect(result.deviceStates['master-blinds'].level).toBe(0);
    expect(polluted.deviceStates['foreign-device'].on).toBe(true);
  });

  it.each<PresetId>(['morning', 'movie', 'night', 'away'])('keeps blinds status consistent with position in %s', (preset) => {
    const blinds = applyPreset(createDefaultState(), preset).deviceStates['master-blinds'];
    expect(blinds.on).toBe(blinds.level > 0);
  });

  it.each<PresetId>(['morning', 'movie', 'night', 'away'])('closes the entry gate in %s while preserving grounds navigation', (preset) => {
    const initial = createDefaultState();
    const input = freezeSnapshot({
      ...initial, roomId: 'grounds', floor: 'ground', view: 'immersive', selectedDevice: 'entry-gate',
      deviceStates: { ...initial.deviceStates, 'entry-gate': { on: true, level: 50 } },
    });
    const result = applyPreset(input, preset);
    expect(result.deviceStates['entry-gate']).toEqual({ on: false, level: 0 });
    expect(input.deviceStates['entry-gate']).toEqual({ on: true, level: 50 });
    expect(result).toMatchObject({ roomId: 'grounds', view: 'immersive', selectedDevice: 'entry-gate' });
  });
});

describe('interactive store actions', () => {
  beforeEach(() => {
    useHomeStore.getState().reset();
  });

  it('moves a device pick to its correct room and floor while retaining immersion', () => {
    useHomeStore.getState().setView('immersive');
    useHomeStore.getState().selectDevice('master-ac');
    expect(useHomeStore.getState()).toMatchObject({
      roomId: 'master', floor: 'upper', view: 'immersive', selectedDevice: 'master-ac',
    });
  });

  it('ignores unknown scene picks without inserting a device', () => {
    const before = useHomeStore.getState();
    useHomeStore.getState().selectDevice('unknown-mesh');
    expect(useHomeStore.getState()).toMatchObject({
      roomId: before.roomId, floor: before.floor, selectedDevice: before.selectedDevice,
      deviceStates: before.deviceStates,
    });
  });

  it.each(['exterior', 'immersive'] as const)('keeps %s presentation when a hotspot updates the inspector', (view) => {
    useHomeStore.getState().setView(view);
    useHomeStore.getState().selectHotspotDevice('master-blinds');
    expect(useHomeStore.getState()).toMatchObject({ view, roomId: 'master', floor: 'upper', selectedDevice: 'master-blinds' });
  });

  it('keeps the current floor plan when another room hotspot is selected', () => {
    useHomeStore.getState().selectHotspotDevice('laundry-washer');
    expect(useHomeStore.getState()).toMatchObject({ view: 'ground', roomId: 'laundry', floor: 'ground', selectedDevice: 'laundry-washer' });
  });

  it('moves a cross-floor hotspot pick to the matching floor plan', () => {
    useHomeStore.getState().selectHotspotDevice('family-tv');
    expect(useHomeStore.getState()).toMatchObject({ view: 'upper', roomId: 'family', floor: 'upper', selectedDevice: 'family-tv' });
  });

  it('selects the first newly equipped exercise-room device', () => {
    useHomeStore.getState().setRoom('gym');
    expect(useHomeStore.getState()).toMatchObject({
      roomId: 'gym', floor: 'upper', view: 'upper', selectedDevice: 'gym-light',
    });
  });

  it('keeps explicit floor and cutaway navigation coherent', () => {
    useHomeStore.getState().setFloor('upper');
    expect(useHomeStore.getState()).toMatchObject({
      roomId: 'family', floor: 'upper', view: 'upper', selectedDevice: 'family-tv',
    });
    useHomeStore.getState().setView('ground');
    expect(useHomeStore.getState()).toMatchObject({
      roomId: 'living', floor: 'ground', view: 'ground', selectedDevice: 'living-light',
    });
  });

  it.each(['ground', 'upper', 'immersive'] as const)('navigates from %s to grounds through the exterior view', (startingView) => {
    useHomeStore.getState().setView(startingView);
    useHomeStore.getState().setRoom('grounds');
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'grounds', floor: startingView === 'upper' ? 'upper' : 'ground', view: 'exterior', selectedDevice: 'entry-gate' });
  });

  it('selects the entry gate whenever the exterior view is requested', () => {
    useHomeStore.getState().selectDevice('master-ac');
    useHomeStore.getState().setView('exterior');
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'grounds', floor: 'upper', view: 'exterior', selectedDevice: 'entry-gate' });
  });

  it('opens an exterior entry view when the gate is selected from an immersive room', () => {
    useHomeStore.getState().setRoom('master');
    useHomeStore.getState().setView('immersive');
    useHomeStore.getState().selectDevice('entry-gate');
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'grounds', floor: 'upper', view: 'exterior', selectedDevice: 'entry-gate' });
  });

  it.each(['ground', 'upper'] as const)('returns from grounds to the default %s interior room', (floor) => {
    useHomeStore.getState().setRoom('grounds');
    useHomeStore.getState().setView(floor);
    expect(useHomeStore.getState()).toMatchObject({
      roomId: floor === 'ground' ? 'living' : 'family', floor, view: floor,
      selectedDevice: floor === 'ground' ? 'living-light' : 'family-tv',
    });
  });

  it('retains the selected interior room when switching back to its floor plan', () => {
    useHomeStore.getState().setRoom('master');
    useHomeStore.getState().setView('immersive');
    useHomeStore.getState().setView('upper');
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'master', floor: 'upper', view: 'upper', selectedDevice: 'master-ac' });
  });

  it('keeps grounds selected in the immersive entry view, including hotspot picks', () => {
    useHomeStore.getState().setRoom('grounds');
    useHomeStore.getState().setView('immersive');
    useHomeStore.getState().selectHotspotDevice('entry-gate');
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'grounds', floor: 'ground', view: 'immersive', selectedDevice: 'entry-gate' });
  });

  it('moves a gate hotspot from an interior cutaway into the exterior view', () => {
    useHomeStore.getState().setFloor('upper');
    useHomeStore.getState().selectHotspotDevice('entry-gate');
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'grounds', floor: 'upper', view: 'exterior', selectedDevice: 'entry-gate' });
  });

  it.each(['landscape-button', 'grounds-room', 'gate-inspector', 'gate-hotspot'])('returns to the selected suite device after visiting through %s', (entry) => {
    useHomeStore.getState().selectDevice('master-blinds');
    if (entry === 'landscape-button') useHomeStore.getState().setView('exterior');
    if (entry === 'grounds-room') useHomeStore.getState().setRoom('grounds');
    if (entry === 'gate-inspector') useHomeStore.getState().selectDevice('entry-gate');
    if (entry === 'gate-hotspot') useHomeStore.getState().selectHotspotDevice('entry-gate');
    expect(useHomeStore.getState()).toMatchObject({ floor: 'upper', roomId: 'grounds', selectedDevice: 'entry-gate' });
    useHomeStore.getState().setView(useHomeStore.getState().floor);
    expect(useHomeStore.getState()).toMatchObject({ floor: 'upper', view: 'upper', roomId: 'master', selectedDevice: 'master-blinds' });
  });

  it('retains gate immersion when the inspector selects the already visible gate', () => {
    useHomeStore.getState().selectDevice('master-blinds');
    useHomeStore.getState().setView('exterior');
    useHomeStore.getState().setView('immersive');
    useHomeStore.getState().selectDevice('entry-gate');
    expect(useHomeStore.getState()).toMatchObject({ view: 'immersive', roomId: 'grounds', floor: 'upper', selectedDevice: 'entry-gate' });
    useHomeStore.getState().setView(useHomeStore.getState().floor);
    expect(useHomeStore.getState()).toMatchObject({ view: 'upper', roomId: 'master', selectedDevice: 'master-blinds' });
  });

  it.each(['ground', 'upper'] as const)('honors an explicit %s floor button from the landscape', (floor) => {
    useHomeStore.getState().selectDevice('master-blinds');
    useHomeStore.getState().setView('exterior');
    useHomeStore.getState().setFloor(floor);
    expect(useHomeStore.getState()).toMatchObject({
      floor, view: floor, roomId: floor === 'ground' ? 'living' : 'family',
      selectedDevice: floor === 'ground' ? 'living-light' : 'family-tv',
    });
  });

  it('keeps the exercise-room bookmark through site presets and repeated entry views', () => {
    useHomeStore.getState().setRoom('gym');
    useHomeStore.getState().setView('exterior');
    useHomeStore.getState().activatePreset('night');
    useHomeStore.getState().setView('immersive');
    useHomeStore.getState().setView('exterior');
    useHomeStore.getState().setView(useHomeStore.getState().floor);
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'gym', floor: 'upper', view: 'upper', selectedDevice: 'gym-light' });
  });

  it('restores a persisted outside-to-interior roundtrip', () => {
    useHomeStore.getState().selectDevice('laundry-washer');
    useHomeStore.getState().setView('exterior');
    const restored = parseStoredState(storedEnvelope(useHomeStore.getState()));
    useHomeStore.getState().reset();
    useHomeStore.setState(restored);
    useHomeStore.getState().setView(useHomeStore.getState().floor);
    expect(useHomeStore.getState()).toMatchObject({ roomId: 'laundry', floor: 'ground', view: 'ground', selectedDevice: 'laundry-washer' });
  });

  it('remembers intensity through power toggles without mutating previous state', () => {
    useHomeStore.getState().setDeviceLevel('living-light', 61.6);
    const before = useHomeStore.getState();
    useHomeStore.getState().toggleDevice('living-light');
    expect(useHomeStore.getState().deviceStates['living-light']).toEqual({ on: false, level: 62 });
    expect(before.deviceStates['living-light']).toEqual({ on: true, level: 62 });
    expect(useHomeStore.getState().activePreset).toBeNull();
    useHomeStore.getState().toggleDevice('living-light');
    expect(useHomeStore.getState().deviceStates['living-light']).toEqual({ on: true, level: 62 });
  });

  it('bounds level changes without powering on an inactive appliance', () => {
    useHomeStore.getState().setDeviceLevel('laundry-washer', 120);
    expect(useHomeStore.getState().deviceStates['laundry-washer']).toEqual({ on: false, level: 100 });
    useHomeStore.getState().setDeviceLevel('laundry-washer', Number.NaN);
    expect(useHomeStore.getState().deviceStates['laundry-washer']).toEqual({ on: false, level: 0 });
  });

  it('opens and closes blinds with unambiguous positions while preserving navigation', () => {
    useHomeStore.getState().setRoom('master');
    useHomeStore.getState().setView('immersive');
    const before = useHomeStore.getState();
    useHomeStore.getState().toggleDevice('master-blinds');
    expect(useHomeStore.getState().deviceStates['master-blinds']).toEqual({ on: false, level: 0 });
    useHomeStore.getState().toggleDevice('master-blinds');
    expect(useHomeStore.getState().deviceStates['master-blinds']).toEqual({ on: true, level: 100 });
    expect(useHomeStore.getState()).toMatchObject({ view: before.view, roomId: before.roomId, floor: before.floor, selectedDevice: before.selectedDevice, activePreset: null });
    expect(before.deviceStates['master-blinds']).toEqual({ on: true, level: 85 });
  });

  it('moves closed blinds directly through partial and full slider positions', () => {
    useHomeStore.getState().setDeviceLevel('master-blinds', 0);
    expect(useHomeStore.getState().deviceStates['master-blinds']).toEqual({ on: false, level: 0 });
    useHomeStore.getState().setDeviceLevel('master-blinds', 50);
    expect(useHomeStore.getState().deviceStates['master-blinds']).toEqual({ on: true, level: 50 });
    useHomeStore.getState().setDeviceLevel('master-blinds', 100);
    expect(useHomeStore.getState().deviceStates['master-blinds']).toEqual({ on: true, level: 100 });
    useHomeStore.getState().setDeviceLevel('master-blinds', Number.NaN);
    expect(useHomeStore.getState().deviceStates['master-blinds']).toEqual({ on: false, level: 0 });
  });

  it('moves the gate through closed, partial and fully open positions immediately', () => {
    useHomeStore.getState().selectDevice('entry-gate');
    for (const position of [0, 50, 100]) {
      useHomeStore.getState().setDeviceLevel('entry-gate', position);
      expect(useHomeStore.getState().deviceStates['entry-gate']).toEqual({ on: position > 0, level: position });
      expect(useHomeStore.getState()).toMatchObject({ view: 'exterior', roomId: 'grounds', selectedDevice: 'entry-gate', activePreset: null });
    }
  });

  it('toggles a closed gate fully open and closes a partially open gate', () => {
    expect(useHomeStore.getState().deviceStates['entry-gate']).toEqual({ on: false, level: 0 });
    const closedSnapshot = useHomeStore.getState();
    useHomeStore.getState().toggleDevice('entry-gate');
    expect(useHomeStore.getState().deviceStates['entry-gate']).toEqual({ on: true, level: 100 });
    expect(closedSnapshot.deviceStates['entry-gate']).toEqual({ on: false, level: 0 });
    useHomeStore.getState().setDeviceLevel('entry-gate', 50);
    useHomeStore.getState().toggleDevice('entry-gate');
    expect(useHomeStore.getState().deviceStates['entry-gate']).toEqual({ on: false, level: 0 });
    useHomeStore.getState().toggleDevice('entry-gate');
    expect(useHomeStore.getState().deviceStates['entry-gate']).toEqual({ on: true, level: 100 });
  });

  it('bounds gate values and resets the gate to closed without affecting appliance semantics', () => {
    useHomeStore.getState().setDeviceLevel('entry-gate', 400);
    expect(useHomeStore.getState().deviceStates['entry-gate']).toEqual({ on: true, level: 100 });
    useHomeStore.getState().setDeviceLevel('entry-gate', -40);
    expect(useHomeStore.getState().deviceStates['entry-gate']).toEqual({ on: false, level: 0 });
    useHomeStore.getState().setDeviceLevel('entry-gate', Number.NaN);
    expect(useHomeStore.getState().deviceStates['entry-gate']).toEqual({ on: false, level: 0 });
    useHomeStore.getState().setDeviceLevel('entry-gate', 100);
    useHomeStore.getState().reset();
    expect(useHomeStore.getState().deviceStates['entry-gate']).toEqual({ on: false, level: 0 });
  });

  it('publishes one complete preset update with no intermediate device states', () => {
    const listener = vi.fn();
    const unsubscribe = useHomeStore.subscribe(listener);
    try {
      useHomeStore.getState().activatePreset('movie');
      expect(listener).toHaveBeenCalledTimes(1);
      const published = listener.mock.calls[0]?.[0] as HomeSnapshot;
      expect(published).toMatchObject({ activePreset: 'movie', night: true });
      expect(published.deviceStates['family-tv'].on).toBe(true);
      expect(published.deviceStates['living-light'].level).toBe(18);
    } finally {
      unsubscribe();
    }
  });
});

describe('position control presentation', () => {
  it('identifies the gate and blinds while leaving appliances as power controls', () => {
    expect(isPositionDevice(getDevice('entry-gate'))).toBe(true);
    expect(isPositionDevice(getDevice('master-blinds'))).toBe(true);
    expect(isPositionDevice(getDevice('living-light'))).toBe(false);
    expect(isPositionDevice(undefined)).toBe(false);
  });

  it.each([[0, 'Closed'], [50, '50% open'], [100, 'Fully open']] as const)('describes the gate position %s as %s', (level, label) => {
    const gate = getDevice('entry-gate');
    expect(gate).toBeDefined();
    if (gate) expect(formatDeviceLevel(gate, level)).toBe(label);
  });
});
