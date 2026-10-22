import { createDefaultSimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { createDefaultDevicePlacement, replaceRuntimeDevices } from '../../../packages/home-scene/src/devicePlacement';
import { resolveModelSceneAccess } from '../three-d-home/modelSceneAccess';
import { synchronizeRuntimeDeviceCatalog } from '../three-d-home/runtimeDeviceCatalog';
import type { ControlSnapshot } from '../three-d-home/simulationControlClient';
import { virtualSceneHome } from '../scenes/sceneTestFixtures';
import type { HomeState } from '../../store/useHomeStore';
import type { ConciergeResponse } from '../../../shared/home-concierge/contract';
import { assistantAuthorizationFingerprint, assistantContextIsCurrent, assistantSceneDraft, buildAssistantContext } from './assistantContext';

const now = Date.now();

/** Hydrate the model separately from registry defaults to catch stale-host-state summaries. */
function snapshot(home: HomeState): ControlSnapshot {
  const state = createDefaultSimulationSnapshot();
  state.deviceStates['living-light'] = { on: true, level: 31, settings: { colorTempK: 2800 } };
  return { ready: true, status: 'saved', access: resolveModelSceneAccess(home), state };
}

/** A private Guest has exactly one room and no scene-management permission by default. */
function guestHome(): HomeState {
  const home = virtualSceneHome();
  return { ...home, household: [{ ...home.household[0], role: 'Guest', accessExpiresAt: new Date(now + 30_000).toISOString() }],
    roomMembers: [{ memberId: home.activeMemberId, roomIds: ['registry-room:living'] }] };
}

/** Explicit desired scene settings intentionally differ from the current model reading. */
function proposal(): ConciergeResponse {
  return { title: 'A quieter evening', answer: 'Review this soft lighting scene.', deviceIds: ['registry-device:living-light'],
    scene: { name: 'Evening calm', explanation: 'Warm light at a low level.', actions: [{ deviceId: 'registry-device:living-light', values: { isOn: true, brightness: 20, colorTempK: 2700 } }] } };
}

test('reads hydrated simulation state rather than registry power and never exports raw private metadata', () => {
  const home = virtualSceneHome();
  home.profile = { ...home.profile, email: 'owner-private@example.invalid' };
  const context = buildAssistantContext(home, snapshot(home), now);
  expect(home.devices.find((device) => device.modelDeviceId === 'living-light')?.isOn).toBe(false);
  expect(context.devices.find((device) => device.id === 'registry-device:living-light')?.values)
    .toEqual({ isOn: true, brightness: 31, colorTempK: 2800 });
  expect(context.available).toBe(true);
  expect(context.canDraft).toBe(true);
  expect(context.devices.every((device) => !['camera', 'gate', 'door', 'garage', 'smoke', 'window'].includes(device.kind))).toBe(true);
  const transmitted = JSON.stringify(context.requestContext);
  expect(transmitted).not.toContain('owner-private');
  expect(transmitted).not.toContain('name');
  expect(context.requestContext?.devices.every((device) => Object.keys(device).join(',') === 'id,values')).toBe(true);
  expect(transmitted).not.toContain('camera');
  expect(transmitted).not.toContain('latitude');
});

test('limits Guest records and counts to authorized comfort devices and withholds scene drafting', () => {
  const home = guestHome();
  const context = buildAssistantContext(home, snapshot(home), now);
  expect(context.available).toBe(true);
  expect(context.devices.length).toBeGreaterThan(0);
  expect(context.devices.every((device) => device.roomId === 'registry-room:living')).toBe(true);
  expect(context.brief.roomCount).toBe(1);
  expect(context.canDraft).toBe(false);
  expect(assistantSceneDraft(proposal(), context, home, snapshot(home), now)).toBeNull();
});

test('shared interior-layout visibility never expands assistant device data', () => {
  const home = guestHome();
  const shared = { ...home, household: [{ ...home.household[0], shareInteriorLayout: true }] };
  expect(buildAssistantContext(shared, snapshot(shared), now).devices).toEqual(buildAssistantContext(home, snapshot(home), now).devices);
});

test('a selected registered room narrows every reading, count and request while retaining permitted choices', () => {
  const home = virtualSceneHome();
  const context = buildAssistantContext(home, snapshot(home), now, { roomId: 'registry-room:living' });
  expect(context).toMatchObject({ available: true, roomId: 'registry-room:living', scopeLabel: 'Living room' });
  expect(context.brief.roomCount).toBe(1);
  expect(context.devices.every((device) => device.roomId === context.roomId)).toBe(true);
  expect(context.devices.find((device) => device.id === 'registry-device:living-light')?.modelDeviceId).toBe('living-light');
  expect(context.availableRooms.length).toBeGreaterThan(1);
  expect(context.requestContext?.devices.map((device) => device.id)).toEqual(context.devices.map((device) => device.id));
  expect(JSON.stringify(context.requestContext)).not.toContain('modelDeviceId');
  expect(context.fingerprint).not.toBe(buildAssistantContext(home, snapshot(home), now).fingerprint);
  expect(assistantContextIsCurrent(context, home, now)).toBe(true);
});

test.each(['', 'living', 'registry-room:master', 'not-a-room'])('Guest selection %s fails closed without borrowing layout access', (roomId) => {
  const home = guestHome();
  home.household[0].shareInteriorLayout = true;
  const context = buildAssistantContext(home, snapshot(home), now, { roomId });
  expect(context).toMatchObject({ available: false, roomId, scopeLabel: 'Room unavailable', devices: [], requestContext: null, canDraft: false });
  expect(context.availableRooms).toEqual([{ id: 'registry-room:living', name: 'Living room' }]);
});

test('explicit all-permitted scope remains limited to the Guest grant and excludes snapshot-denied rooms', () => {
  const home = guestHome();
  const context = buildAssistantContext(home, snapshot(home), now, { roomId: null });
  expect(context.scopeLabel).toBe('All permitted rooms');
  expect(context.devices.every((device) => device.roomId === 'registry-room:living')).toBe(true);
  const reading = snapshot(home);
  reading.access = { ...reading.access!, roomIds: [], deviceIds: [], controllableDeviceIds: [] };
  expect(buildAssistantContext(home, reading, now, { roomId: 'registry-room:living' }))
    .toMatchObject({ available: false, availableRooms: [], devices: [] });
});

test('an admitted room without supported comfort devices stays empty instead of widening to another room', () => {
  const home = virtualSceneHome();
  const room = home.rooms.find((candidate) => candidate.id !== 'registry-room:living')!;
  home.devices = home.devices.filter((device) => device.roomId !== room.id);
  const context = buildAssistantContext(home, snapshot(home), now, { roomId: room.id });
  expect(context).toMatchObject({ available: false, roomId: room.id, scopeLabel: room.name, devices: [], requestContext: null });
  expect(context.reason).toContain('this room');
});

test.each(['ready', 'account', 'home', 'blocked', 'socket', 'mqtt', 'member'] as const)('fails closed on %s access mismatch', (change) => {
  const home = virtualSceneHome();
  const reading = snapshot(home);
  if (change === 'ready') home.membershipReady = false;
  if (change === 'account') home.authenticatedUserId = 'other';
  if (change === 'home') home.activeHomeId = 'other';
  if (change === 'blocked') home.authTaskBlockingHome = true;
  if (change === 'socket') home.realtime = { ...home.realtime, enabled: true, wsUrl: 'wss://hub.example.invalid' };
  if (change === 'mqtt') home.realtime = { ...home.realtime, useMqtt: true };
  if (change === 'member') home.activeMemberId = 'other';
  expect(buildAssistantContext(home, reading, now)).toMatchObject({ available: false, devices: [], requestContext: null });
});

test('accepts the signed-in no-hub default without enabling physical transport', () => {
  const home = virtualSceneHome({ realtime: { enabled: true, wsUrl: '', useMqtt: false } });
  const context = buildAssistantContext(home, snapshot(home), now);
  expect(context.available).toBe(true);
  expect(context.devices.length).toBeGreaterThan(0);
  const connected = { ...home, realtime: { ...home.realtime, wsUrl: 'wss://hub.example.invalid' } };
  expect(assistantAuthorizationFingerprint(connected)).not.toBe(context.fingerprint);
  expect(assistantContextIsCurrent(context, connected, now)).toBe(false);
  expect(buildAssistantContext(connected, snapshot(connected), now).available).toBe(false);
});

test.each(['loading', 'load-error', 'corrupt', 'error', 'disconnected'] as const)('does not report %s storage readings as ready', (status) => {
  const home = virtualSceneHome();
  expect(buildAssistantContext(home, { ...snapshot(home), status }, now).available).toBe(false);
});

test('requires both fresh current grants and the active snapshot grant', () => {
  const home = virtualSceneHome();
  const reading = snapshot(home);
  reading.access = { ...reading.access!, deviceIds: ['living-light'], controllableDeviceIds: [] };
  const context = buildAssistantContext(home, reading, now);
  expect(context.devices.map((device) => device.id)).toEqual(['registry-device:living-light']);
  expect(context.devices[0].controllable).toBe(false);
  expect(context.canDraft).toBe(false);
});

test('stable fingerprint ignores readings but detects grants, names, bindings and sessions', () => {
  const home = virtualSceneHome();
  const initial = assistantAuthorizationFingerprint(home);
  const readingOnly = { ...home, devices: home.devices.map((device) => ({ ...device, isOn: !device.isOn, brightness: 40 })) };
  expect(assistantAuthorizationFingerprint(readingOnly)).toBe(initial);
  expect(assistantAuthorizationFingerprint({ ...home, sessionEpoch: home.sessionEpoch + 1 })).not.toBe(initial);
  expect(assistantAuthorizationFingerprint({ ...home, memberPermissionOverrides: [{ memberId: home.activeMemberId, permission: 'light.control', allowed: false }] })).not.toBe(initial);
  expect(assistantAuthorizationFingerprint({ ...home, devices: home.devices.map((device) => device.kind === 'light' ? { ...device, name: 'Changed' } : device) })).not.toBe(initial);
});

test('request validity expires with Guest access, context age or session identity', () => {
  const home = guestHome();
  const context = buildAssistantContext(home, snapshot(home), now);
  expect(assistantContextIsCurrent(context, home, now + 1000)).toBe(true);
  expect(assistantContextIsCurrent(context, home, now + 30_000)).toBe(false);
  expect(buildAssistantContext(home, snapshot(home), now + 30_000).available).toBe(false);
  const owner = virtualSceneHome();
  const ownerContext = buildAssistantContext(owner, snapshot(owner), now);
  expect(assistantContextIsCurrent(ownerContext, owner, now + 60_001)).toBe(false);
  expect(assistantContextIsCurrent(ownerContext, { ...owner, sessionEpoch: owner.sessionEpoch + 2 }, now)).toBe(false);
});

test('generates an unsaved exact scene without adding defaults, model metadata or executing controls', () => {
  const home = virtualSceneHome();
  const reading = snapshot(home);
  const before = JSON.stringify(reading);
  const draft = assistantSceneDraft(proposal(), buildAssistantContext(home, reading, now), home, reading, now);
  expect(draft).toEqual({ name: 'Evening calm', scope: 'room', roomId: 'registry-room:living',
    actions: [{ type: 'patch', deviceId: 'registry-device:living-light', patch: { isOn: true, brightness: 20, colorTempK: 2700 } }] });
  expect(home.scenes).toEqual([]);
  expect(JSON.stringify(reading)).toBe(before);
});

test('draft conversion rejects stale scope, revoked controls, unsafe values and new unsolicited references', () => {
  const home = virtualSceneHome();
  const reading = snapshot(home);
  const context = buildAssistantContext(home, reading, now);
  expect(assistantSceneDraft(proposal(), context, { ...home, sessionEpoch: home.sessionEpoch + 1 }, reading, now)).toBeNull();
  expect(assistantSceneDraft(proposal(), context, home, { ...reading, access: { ...reading.access!, controllableDeviceIds: [] } }, now)).toBeNull();
  const invalid = proposal();
  invalid.scene!.actions[0].values = { tempC: 22 };
  expect(assistantSceneDraft(invalid, context, home, reading, now)).toBeNull();
  expect(assistantSceneDraft(proposal(), { ...context, devices: context.devices.filter((device) => device.id !== 'registry-device:living-light') }, home, reading, now)).toBeNull();
});

test('room-scoped drafts reject another permitted room and changed target values without rejecting unrelated edits', () => {
  const home = virtualSceneHome();
  const reading = snapshot(home);
  const context = buildAssistantContext(home, reading, now, { roomId: 'registry-room:living' });
  const other = buildAssistantContext(home, reading, now).devices.find((device) => device.roomId !== context.roomId && device.kind === 'light')!;
  const outside = { ...proposal(), deviceIds: [other.id], scene: { ...proposal().scene!, actions: [{ deviceId: other.id, values: { brightness: 20 } }] } };
  expect(assistantSceneDraft(outside, context, home, reading, now)).toBeNull();

  const brightnessOnly = { ...proposal(), scene: { ...proposal().scene!, actions: [{ deviceId: 'registry-device:living-light', values: { brightness: 20 } }] } };
  const unrelated = { ...reading, state: { ...reading.state, deviceStates: { ...reading.state.deviceStates,
    'living-light': { ...reading.state.deviceStates['living-light'], on: false, settings: { colorTempK: 3100 } } } } };
  expect(assistantSceneDraft(brightnessOnly, context, home, unrelated, now)?.actions)
    .toEqual([{ type: 'patch', deviceId: 'registry-device:living-light', patch: { brightness: 20 } }]);
  const changed = { ...unrelated, state: { ...unrelated.state, deviceStates: { ...unrelated.state.deviceStates,
    'living-light': { ...unrelated.state.deviceStates['living-light'], level: 72 } } } };
  expect(assistantSceneDraft(brightnessOnly, context, home, changed, now)).toBeNull();
});

test('does not infer a model identity from a matching device name or wrong room binding', () => {
  const home = virtualSceneHome();
  const reading = snapshot(home);
  home.devices = home.devices.map((device) => device.modelDeviceId === 'living-light'
    ? { ...device, modelDeviceId: 'entry-gate', name: 'Living light' } : device);
  expect(buildAssistantContext(home, reading, now).devices.some((device) => device.id === 'registry-device:living-light')).toBe(false);
});

test('includes a saved custom fixture by its admitted binding and preserves its registry identity in drafts', () => {
  const home = virtualSceneHome();
  const id = '00000000-0000-4000-8000-000000000001';
  const modelId = `placed-${id}`;
  home.devices = [...home.devices, { id, name: 'Reading light', kind: 'light', roomId: 'registry-room:living',
    isOn: false, modelDeviceId: modelId, simulationOnly: true,
    modelPlacement: createDefaultDevicePlacement('master-bedside-left', 'living')! }];
  try {
    synchronizeRuntimeDeviceCatalog(home);
    const reading = snapshot(home);
    reading.state.deviceStates[modelId] = { on: true, level: 40, settings: { colorTempK: 3000 } };
    const context = buildAssistantContext(home, reading, now);
    expect(context.devices.find((device) => device.id === id)).toMatchObject({ name: 'Reading light', values: { isOn: true, brightness: 40 } });
    const response: ConciergeResponse = { ...proposal(), deviceIds: [id], scene: { ...proposal().scene!, actions: [{ deviceId: id, values: { brightness: 30 } }] } };
    expect(assistantSceneDraft(response, context, home, reading, now)?.actions).toEqual([{ type: 'patch', deviceId: id, patch: { brightness: 30 } }]);
  } finally { replaceRuntimeDevices([]); }
});
