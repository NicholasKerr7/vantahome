import { DEVICES, ROOMS } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { useHomeStore, type AutomationFlow, type AutomationRule, type Device, type HomeState, type Scene } from '../../../store/useHomeStore';
import { LEGACY_MODEL_DEVICE_ALIASES, MODEL_CATALOG_VERSION, isModeledDevice, isModeledRoom, upgradeModelHomeCatalog } from '../modelHomeCatalog';

const initial = useHomeStore.getInitialState();

/** Isolate migration fixtures from both persistence and the live Zustand store. */
function demoState(overrides: Partial<HomeState> = {}): HomeState {
  return {
    ...initial, modelCatalogVersion: undefined, modelCatalogArchive: undefined,
    accountUserId: null, authenticatedUserId: null, accountHomeId: null, activeHomeId: null,
    realtime: { ...initial.realtime, enabled: false, useMqtt: false },
    rooms: [], devices: [], scenes: [], rules: [], flows: [], roomMembers: [],
    household: [{ id: 'member-1', name: 'Demo owner', role: 'Owner', status: 'home' }],
    activeSceneId: null, lastSceneRun: null, ...overrides,
  };
}

/** Create an explicitly identified old or custom device without incidental seed state. */
function device(id: string, kind: Device['kind'] = 'light', fields: Partial<Device> = {}): Device {
  return { id, kind, roomId: 'r1', name: 'Saved device', isOn: true, ...fields };
}

/** Test migration results as a complete state without invoking store mutations. */
function upgrade(state: HomeState, snapshot = createDefaultSimulationSnapshot()): HomeState {
  return { ...state, ...upgradeModelHomeCatalog(state, snapshot) };
}

/** Construct a room scene whose original action ordering is significant. */
function scene(id: string, roomId: string, deviceIds: string[], scope?: Scene['scope']): Scene {
  return { id, name: id, roomId, scope, actions: deviceIds.map((deviceId) => ({ type: 'toggle', deviceId, on: false })) };
}

/** Minimal scheduled action makes missing-target behavior explicit. */
function rule(id: string, deviceId: string): AutomationRule {
  return { id, name: id, enabled: true, trigger: { type: 'time', hour: 8, minute: 0 }, action: { type: 'toggle', deviceId, on: true } };
}

/** Build a flow with references in all executable device positions. */
function flow(id: string, deviceId: string, sceneId: string): AutomationFlow {
  return { id, name: id, enabled: true,
    triggers: [{ type: 'device', deviceId, state: 'off' }, { type: 'presence', memberId: 'member-1', status: 'home' }],
    conditions: [{ type: 'device', deviceId, state: 'off' }],
    actions: [{ type: 'toggle', deviceId, on: true }, { type: 'run-scene', sceneId }],
  };
}

describe('canonical model home catalog', () => {
  test('builds exactly the manifest rooms, devices and three camera locations', () => {
    const result = upgrade(demoState());
    expect(result.modelCatalogVersion).toBe(MODEL_CATALOG_VERSION);
    expect(result.rooms).toEqual(ROOMS.map(({ id, name }) => ({ id, name })));
    expect(result.rooms).toHaveLength(20);
    expect(result.devices).toHaveLength(92);
    expect(new Set(result.devices.map(({ id }) => id)).size).toBe(92);
    expect(result.devices.map(({ id, name, roomId, kind }) => ({ id, name, roomId, kind })))
      .toEqual(DEVICES.map(({ id, name, roomId, kind }) => ({ id, name, roomId, kind })));
    expect(result.devices.filter(({ kind }) => kind === 'camera').map(({ id, name, roomId }) => ({ id, name, roomId }))).toEqual([
      { id: 'entry-camera', name: 'Entry camera', roomId: 'grounds' },
      { id: 'drive-camera', name: 'Driveway camera', roomId: 'grounds' },
      { id: 'terrace-camera', name: 'Terrace camera', roomId: 'grounds' },
    ]);
    expect(isModeledDevice({ id: 'drive-camera', kind: 'camera' })).toBe(true);
    expect(isModeledDevice({ id: 'drive-camera', kind: 'light' })).toBe(false);
    expect(isModeledRoom({ id: 'grounds' })).toBe(true);
    expect(isModeledRoom({ id: 'r6' })).toBe(false);
  });

  test('uses saved scene controls while preserving paired native metadata and camera power', () => {
    const snapshot = createDefaultSimulationSnapshot();
    snapshot.deviceStates['living-light'] = { on: false, level: 32, settings: { color: '#B69CFF', colorTempK: 3400, lightEffect: 'none' } };
    snapshot.deviceStates['entry-camera'] = { on: true, level: 60, settings: { motionSensitivity: 8 } };
    const state = demoState({ devices: [
      device('d2', 'light', { brightness: 99, lightEffect: 'party', observedAt: 73 }),
      device('d15', 'camera', { isOn: false, armed: false, streamUrl: 'https://private.invalid/live' }),
    ] });
    const before = JSON.stringify({ state, snapshot });
    const result = upgrade(state, snapshot);
    expect(result.devices.find(({ id }) => id === 'living-light')).toMatchObject({ isOn: false, brightness: 32, color: '#B69CFF', colorTempK: 3400, observedAt: 73 });
    expect(result.devices.find(({ id }) => id === 'living-light')?.lightEffect).toBeUndefined();
    expect(result.devices.find(({ id }) => id === 'entry-camera')).toMatchObject({ isOn: false, armed: true, motionSensitivity: 8 });
    expect(result.devices.find(({ id }) => id === 'drive-camera')).toMatchObject({ isOn: true });
    expect(JSON.stringify(result)).not.toContain('private.invalid');
    expect(JSON.stringify({ state, snapshot })).toBe(before);
  });

  test('migrates only the 24 verified aliases and archives other seed records without camera guessing', () => {
    const paired = LEGACY_MODEL_DEVICE_ALIASES.map(({ demoId, kind }, index) => device(demoId, kind, { observedAt: index + 1 }));
    const result = upgrade(demoState({ devices: [...paired, device('d1', 'ac'), device('d37', 'camera'), device('d38', 'camera')] }));
    for (const [index, alias] of LEGACY_MODEL_DEVICE_ALIASES.entries()) {
      expect(result.devices.find(({ id }) => id === alias.sceneId)?.observedAt).toBe(index + 1);
    }
    expect(result.modelCatalogArchive?.devices.map(({ id }) => id)).toEqual(['d1', 'd37', 'd38']);
    expect(result.devices.find(({ id }) => id === 'drive-camera')?.observedAt).toBeUndefined();
    expect(result.devices).toHaveLength(92);
  });

  test('rejects alias kind collisions and never binds custom devices by display name', () => {
    const result = upgrade(demoState({
      rooms: [{ id: 'studio', name: 'Custom studio' }],
      devices: [device('d2', 'camera', { armed: true }), device('living-light', 'camera'), device('custom-camera', 'camera', { name: 'Driveway camera', roomId: 'studio' })],
      scenes: [scene('custom-scene', 'r1', ['d2'])],
    }));
    expect(result.modelCatalogArchive?.devices.map(({ id }) => id)).toEqual(['d2', 'living-light']);
    expect(result.modelCatalogArchive?.scenes.map(({ id }) => id)).toEqual(['custom-scene']);
    expect(result.devices.find(({ id }) => id === 'custom-camera')).toMatchObject({ roomId: 'studio', name: 'Driveway camera' });
    expect(result.devices.find(({ id }) => id === 'living-light')?.kind).toBe('light');
  });

  test('preserves custom rooms and devices and resolves only explicit legacy room aliases', () => {
    const result = upgrade(demoState({ rooms: [
      { id: 'r3', name: 'Kitchen' }, { id: 'r4', name: 'My custom office' }, { id: 'studio', name: 'Studio' },
    ], devices: [
      device('custom-kitchen', 'light', { roomId: 'r3' }), device('custom-office', 'light', { roomId: 'r4' }),
      device('custom-studio', 'camera', { roomId: 'studio' }), device('orphan', 'light', { roomId: 'missing-room' }),
    ] }));
    expect(result.devices.find(({ id }) => id === 'custom-kitchen')?.roomId).toBe('kitchen');
    expect(result.rooms.slice(-2)).toEqual([{ id: 'r4', name: 'My custom office' }, { id: 'studio', name: 'Studio' }]);
    expect(result.devices.find(({ id }) => id === 'custom-office')?.roomId).toBe('r4');
    expect(result.modelCatalogArchive?.devices.map(({ id }) => id)).toEqual(['orphan']);
  });

  test('migrates scenes atomically and promotes only known legacy scenes that span modeled rooms', () => {
    const state = demoState({ devices: [device('d2'), device('d3', 'tv'), device('d5')], scenes: [
      scene('s1', 'r1', ['d2', 'd3']), scene('custom-cross-room', 'r1', ['d2', 'd3']),
      scene('custom-home', 'r1', ['d2', 'd3'], 'home'), scene('bedtime', 'r2', ['d5']),
      scene('unsafe', 'r1', ['d2', 'd1']),
    ], activeSceneId: 'unsafe', lastSceneRun: { sceneId: 'unsafe', ts: 1 } });
    const result = upgrade(state);
    expect(result.scenes.map(({ id }) => id)).toEqual(['s1', 'custom-home', 'bedtime']);
    expect(result.scenes[0]).toMatchObject({ scope: 'home', roomId: 'living', actions: [{ deviceId: 'living-light' }, { deviceId: 'family-tv' }] });
    expect(result.scenes[2]).toMatchObject({ roomId: 'master', actions: [{ deviceId: 'master-bedside-left' }] });
    expect(result.modelCatalogArchive?.scenes.map(({ id }) => id)).toEqual(['custom-cross-room', 'unsafe']);
    expect(result.activeSceneId).toBeNull();
    expect(result.lastSceneRun).toBeNull();
  });

  test('preserves complete valid routines and archives every routine with an unavailable target', () => {
    const safeFlow = flow('safe-flow', 'd2', 'safe-scene');
    const missingMemberFlow = { ...safeFlow, id: 'missing-member', triggers: [{ type: 'presence' as const, memberId: 'missing', status: 'home' as const }] };
    const state = demoState({ devices: [device('d2')], scenes: [scene('safe-scene', 'r1', ['d2']), scene('unsafe-scene', 'r1', ['d1'])],
      rules: [rule('safe-rule', 'd2'), rule('missing-rule', 'd1')],
      flows: [safeFlow, flow('missing-device', 'd1', 'safe-scene'), flow('missing-scene', 'd2', 'unsafe-scene'), missingMemberFlow],
    });
    const result = upgrade(state);
    expect(result.rules).toEqual([{ ...state.rules[0], action: { type: 'toggle', deviceId: 'living-light', on: true } }]);
    expect(result.flows).toHaveLength(1);
    expect(result.flows[0]).toMatchObject({ triggers: [{ deviceId: 'living-light' }, { memberId: 'member-1' }], conditions: [{ deviceId: 'living-light' }], actions: [{ deviceId: 'living-light' }, { sceneId: 'safe-scene' }] });
    expect(result.modelCatalogArchive?.rules.map(({ id }) => id)).toEqual(['missing-rule']);
    expect(result.modelCatalogArchive?.flows.map(({ id }) => id)).toEqual(['missing-device', 'missing-scene', 'missing-member']);
  });

  test('does not broaden guest room access when a legacy room or cross-room device cannot be mapped', () => {
    const result = upgrade(demoState({ rooms: [{ id: 'r4', name: 'Office' }], roomMembers: [{ memberId: 'guest', roomIds: ['r1', 'r2', 'r2', 'r4'] }] }));
    expect(result.roomMembers).toEqual([{ memberId: 'guest', roomIds: ['living', 'master'] }]);
    expect(result.roomMembers[0].roomIds).not.toContain('family');
    expect(result.modelCatalogArchive?.roomMembers).toEqual([{ memberId: 'guest', roomIds: ['r1', 'r2', 'r2', 'r4'] }]);
    expect(result.modelCatalogArchive?.rooms).toEqual([{ id: 'r4', name: 'Office' }]);
  });

  test('sanitizes reusable camera URLs in retained and archived records, including older archives', () => {
    const urls = { streamUrl: 'https://private.invalid/live', thumbnailUrl: 'https://private.invalid/thumbnail', lastThumbnailUrl: 'https://private.invalid/last' };
    const patchScene = (id: string, deviceId: string): Scene => ({ id, name: id, roomId: 'r6', actions: [{ type: 'patch', deviceId, patch: { ...urls, recording: true } }] });
    const result = upgrade(demoState({ devices: [device('d15', 'camera', urls), device('d37', 'camera', urls)],
      scenes: [patchScene('retained', 'd15'), patchScene('archived', 'd37')],
      modelCatalogArchive: { rooms: [], devices: [device('older-camera', 'camera', urls)], scenes: [patchScene('older-scene', 'older-camera')], rules: [], flows: [], roomMembers: [] },
    }));
    expect(JSON.stringify(result)).not.toContain('private.invalid');
    expect(result.scenes[0].actions[0]).toMatchObject({ deviceId: 'entry-camera', patch: { recording: true } });
    expect(result.modelCatalogArchive?.devices.map(({ id }) => id)).toEqual(['older-camera', 'd37']);
    expect(result.modelCatalogArchive?.scenes.map(({ id }) => id)).toEqual(['older-scene', 'archived']);
  });

  test('refreshes canonical names idempotently while retaining user room order and custom records', () => {
    const snapshot = createDefaultSimulationSnapshot();
    const first = upgrade(demoState({ rooms: [{ id: 'studio', name: 'Studio' }], devices: [device('d37', 'camera'), device('custom', 'light', { roomId: 'studio' })] }), snapshot);
    expect(upgrade(first, snapshot)).toEqual(first);
    const modified: HomeState = { ...first,
      rooms: [{ id: 'studio', name: 'My studio' }, { id: 'master', name: 'Old bedroom' }, ...first.rooms.filter(({ id }) => !['master', 'studio', 'kitchen'].includes(id))],
      devices: first.devices.map((item) => item.id === 'master-ac' ? { ...item, name: 'Old AC', roomId: 'studio' } : item),
    };
    const refreshed = upgrade(modified, snapshot);
    expect(refreshed.rooms.slice(0, 2)).toEqual([{ id: 'studio', name: 'My studio' }, { id: 'master', name: 'Primary suite' }]);
    expect(refreshed.rooms.at(-1)?.id).toBe('kitchen');
    expect(refreshed.devices.find(({ id }) => id === 'master-ac')).toMatchObject({ name: DEVICES.find(({ id }) => id === 'master-ac')?.name, roomId: 'master' });
    expect(refreshed.modelCatalogArchive?.devices.map(({ id }) => id)).toEqual(['d37']);
    expect(upgrade(refreshed, snapshot)).toEqual(refreshed);
  });

  test.each(['accountUserId', 'authenticatedUserId', 'accountHomeId', 'activeHomeId'] as const)('never rewrites a real account identified by %s', (field) => {
    expect(upgradeModelHomeCatalog(demoState({ [field]: 'real-identity' }), createDefaultSimulationSnapshot())).toEqual({});
  });

  test.each(['enabled', 'useMqtt'] as const)('never rewrites a connected home with realtime %s', (field) => {
    const state = demoState();
    state.realtime = { ...state.realtime, [field]: true };
    expect(upgradeModelHomeCatalog(state, createDefaultSimulationSnapshot())).toEqual({});
  });

  test('migrates the entire legacy seed without leaving active references to missing records', () => {
    const result = upgrade(demoState({ rooms: initial.rooms, devices: initial.devices, scenes: initial.scenes, rules: initial.rules, flows: initial.flows, roomMembers: initial.roomMembers, household: initial.household }));
    const rooms = new Set(result.rooms.map(({ id }) => id));
    const devices = new Set(result.devices.map(({ id }) => id));
    const scenes = new Set(result.scenes.map(({ id }) => id));
    expect(result.devices).toHaveLength(92);
    expect(result.rooms).toHaveLength(20);
    for (const item of result.devices) expect(rooms.has(item.roomId)).toBe(true);
    for (const item of result.scenes) for (const action of item.actions) expect(devices.has(action.deviceId)).toBe(true);
    for (const item of result.rules) expect(devices.has(item.action.deviceId)).toBe(true);
    for (const item of result.flows) for (const part of [...item.triggers, ...item.conditions, ...item.actions]) {
      if ('deviceId' in part) expect(devices.has(part.deviceId)).toBe(true);
      if ('sceneId' in part) expect(scenes.has(part.sceneId)).toBe(true);
    }
    for (const membership of result.roomMembers) for (const roomId of membership.roomIds) expect(rooms.has(roomId)).toBe(true);
  });
});
