import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { useHomeStore, type HomeState, type HouseholdMember } from '../../../store/useHomeStore';
import { buildCameraCenterModel, getCameraCenterAccess } from '../cameraCenterModel';

/** Real registry identities explicitly map to the existing authored simulation cameras. */
function fixture(role: HouseholdMember['role'] = 'Owner'): HomeState {
  return {
    ...useHomeStore.getState(), accountUserId: 'person', authenticatedUserId: 'person',
    activeHomeId: 'home', accountHomeId: 'home', activeMemberId: 'person', sessionEpoch: 1,
    membershipReady: true, authTaskBlockingHome: false,
    realtime: { enabled: false, useMqtt: false, wsUrl: '' },
    household: [{ id: 'person', name: 'Person', role, status: 'home' }],
    roomMembers: [{ memberId: 'person', roomIds: ['outside'] }], memberPermissionOverrides: [],
    rooms: [{ id: 'outside', name: 'Grounds & entry', modelRoomId: 'grounds' }, { id: 'inside', name: 'Living room', modelRoomId: 'living' }],
    devices: [
      { id: 'entry', name: 'Entry camera', kind: 'camera', roomId: 'outside', isOn: true, simulationOnly: true, modelDeviceId: 'entry-camera' },
      { id: 'drive', name: 'Driveway camera', kind: 'camera', roomId: 'outside', isOn: true, simulationOnly: true, modelDeviceId: 'drive-camera' },
      { id: 'light', name: 'Living light', kind: 'light', roomId: 'inside', isOn: false, simulationOnly: true, modelDeviceId: 'living-light' },
      { id: 'unconfigured', name: 'Unconfigured camera', kind: 'camera', roomId: 'outside', isOn: true,
        streamUrl: 'https://private.invalid/feed', thumbnailUrl: 'https://private.invalid/image' },
    ],
  };
}

test.each(['Owner', 'Admin', 'Member'] as const)('%s can view its permitted camera collection', (role) => {
  const access = getCameraCenterAccess(fixture(role), 'production');
  expect(access.canView).toBe(true);
  expect(access.canViewActivity).toBe(true);
  expect(access.canManage).toBe(role !== 'Member');
  expect(access.devices.map((item) => item.id)).toEqual(['entry', 'drive', 'unconfigured']);
  expect(access.bindings).toEqual({ entry: 'entry-camera', drive: 'drive-camera' });
  expect(access.usesSimulationCenter).toBe(true);
});

test.each(['Guest', 'Tenant'] as const)('%s shared layout never grants camera access', (role) => {
  const state = fixture(role);
  state.household[0].shareInteriorLayout = true;
  const access = getCameraCenterAccess(state, 'production');
  expect(access.canView).toBe(false);
  expect(access.devices).toEqual([]);
  expect(access.bindings).toEqual({});
});

test('an explicit camera grant still respects room assignments and separate history permission', () => {
  const state = fixture('Guest');
  state.memberPermissionOverrides = [{ memberId: 'person', permission: 'camera.live', allowed: true }];
  let access = getCameraCenterAccess(state, 'production');
  expect(access.devices).toHaveLength(3);
  expect(access.canViewActivity).toBe(false);
  expect(access.canManage).toBe(false);
  state.roomMembers = [{ memberId: 'person', roomIds: ['inside'] }];
  access = getCameraCenterAccess(state, 'production');
  expect(access.devices).toEqual([]);
  expect(access.bindings).toEqual({});
});

test.each(['device.view', 'camera.live'] as const)('revoking %s clears the entire camera projection', (permission) => {
  const state = fixture('Member');
  state.memberPermissionOverrides = [{ memberId: 'person', permission, allowed: false }];
  const access = getCameraCenterAccess(state, 'production');
  expect(access.canView).toBe(false);
  expect(buildCameraCenterModel(access, state.rooms, createDefaultSimulationSnapshot())).toEqual({ cameras: [], events: [] });
});

test.each(['account', 'home', 'member', 'verification', 'authTask', 'expiration'])('fails closed for invalid %s', (reason) => {
  const state = fixture('Guest');
  state.memberPermissionOverrides = [{ memberId: 'person', permission: 'camera.live', allowed: true }];
  if (reason === 'account') state.authenticatedUserId = 'someone-else';
  if (reason === 'home') state.activeHomeId = 'another-home';
  if (reason === 'member') state.activeMemberId = 'missing';
  if (reason === 'verification') state.membershipReady = false;
  if (reason === 'authTask') state.authTaskBlockingHome = true;
  if (reason === 'expiration') state.household[0].accessExpiresAt = '2000-01-01T00:00:00Z';
  const access = getCameraCenterAccess(state, 'production');
  expect(access.canView).toBe(false);
  expect(access.scopeKey).toBeNull();
  expect(access.devices).toEqual([]);
});

test('camera preferences retain their scope across a session but stale callbacks have a new identity', () => {
  const state = fixture();
  const previous = getCameraCenterAccess(state, 'production');
  state.sessionEpoch += 1;
  const next = getCameraCenterAccess(state, 'production');
  expect(next.scopeKey).toBe(previous.scopeKey);
  expect(next.identityKey).not.toBe(previous.identityKey);
  state.activeHomeId = state.accountHomeId = 'next-home';
  expect(getCameraCenterAccess(state, 'production').scopeKey).not.toBe(previous.scopeKey);
});

test('room camera revocation and regrant renew the protected identity without changing preference scope', () => {
  const state = fixture('Guest');
  state.memberPermissionOverrides = [{ memberId: 'person', permission: 'camera.live', allowed: true }];
  const granted = getCameraCenterAccess(state, 'production');
  state.roomMembers = [{ memberId: 'person', roomIds: ['inside'] }];
  const revoked = getCameraCenterAccess(state, 'production');
  expect(revoked.canView).toBe(true);
  expect(revoked.devices).toEqual([]);
  expect(revoked.scopeKey).toBe(granted.scopeKey);
  expect(revoked.identityKey).not.toBe(granted.identityKey);
  state.roomMembers = [{ memberId: 'person', roomIds: ['outside'] }];
  const restored = getCameraCenterAccess(state, 'production');
  expect(restored.identityKey).not.toBe(revoked.identityKey);
  expect(restored.scopeKey).toBe(granted.scopeKey);
});

test('camera names, state and registry order preserve identity but a new binding renews it', () => {
  const state = fixture();
  const before = getCameraCenterAccess(state, 'production').identityKey;
  state.devices = state.devices.map((device) => ({ ...device, name: `Renamed ${device.name}`, isOn: !device.isOn })).reverse();
  expect(getCameraCenterAccess(state, 'production').identityKey).toBe(before);
  state.devices = state.devices.map((device) => device.id === 'entry' ? { ...device, modelDeviceId: 'terrace-camera' } : device);
  expect(getCameraCenterAccess(state, 'production').identityKey).not.toBe(before);
});

test('only validated camera mappings receive demonstration artwork or saved settings', () => {
  const state = fixture();
  state.devices[0].modelDeviceId = 'living-light';
  state.devices[1].simulationOnly = false;
  const access = getCameraCenterAccess(state, 'production');
  expect(access.bindings).toEqual({});
  const model = buildCameraCenterModel(access, state.rooms, createDefaultSimulationSnapshot());
  expect(model.cameras.slice(0, 2).every((camera) => camera.status === 'unconfigured' && !camera.modelDeviceId)).toBe(true);
  expect(model.cameras[2]).toMatchObject({ status: 'configured', statusDetail: 'Open the configured viewer' });
  expect(JSON.stringify(model)).not.toContain('private.invalid');
});

test('projects the canonical VISION settings and only its saved sample event without inventing capture time', () => {
  const state = fixture();
  const simulation = createDefaultSimulationSnapshot();
  simulation.deviceStates['entry-camera'] = { on: false, level: 50,
    settings: { cameraPreviewEvent: 'Simulated snapshot', nightVision: false, recording: true } };
  const before = JSON.stringify(simulation);
  const model = buildCameraCenterModel(getCameraCenterAccess(state, 'production'), state.rooms, simulation, ['drive']);
  expect(model.cameras.map((camera) => camera.id)).toEqual(['drive', 'entry', 'unconfigured']);
  expect(model.cameras[0]).toMatchObject({ view: 'driveway', favorite: true, status: 'demo' });
  expect(model.cameras[1]).toMatchObject({ armed: false, nightVision: false, status: 'demo' });
  expect(model.events).toEqual([{ id: 'entry:snapshot', cameraId: 'entry', label: 'Sample snapshot',
    timeLabel: 'No capture time', detail: 'Last saved simulation event. No photo or video was captured.' }]);
  expect(JSON.stringify(simulation)).toBe(before);
});

test('history denial removes sample events while preserving live-view permission', () => {
  const state = fixture('Member');
  state.memberPermissionOverrides = [{ memberId: 'person', permission: 'camera.history', allowed: false }];
  const simulation = createDefaultSimulationSnapshot();
  simulation.deviceStates['entry-camera'].settings = { cameraPreviewEvent: 'Simulated snapshot' };
  const model = buildCameraCenterModel(getCameraCenterAccess(state, 'production'), state.rooms, simulation);
  expect(model.cameras).toHaveLength(3);
  expect(model.events).toEqual([]);
});

test('unhydrated settings never display authored defaults as restored preferences', () => {
  const state = fixture();
  const model = buildCameraCenterModel(getCameraCenterAccess(state, 'production'), state.rooms, null);
  expect(model.cameras[0]).toMatchObject({ status: 'unavailable' });
  expect(model.cameras[0].armed).toBeUndefined();
  expect(model.events).toEqual([]);
});

test('existing configured cameras retain an explicit viewer entry without exposing their address or claiming playback', () => {
  const state = fixture();
  const access = getCameraCenterAccess(state, 'production');
  const model = buildCameraCenterModel(access, state.rooms, createDefaultSimulationSnapshot());
  const configured = model.cameras.find((camera) => camera.id === 'unconfigured');
  expect(configured).toMatchObject({ status: 'configured', statusDetail: 'Open the configured viewer', view: 'generic' });
  expect(configured?.modelDeviceId).toBeUndefined();
  expect(JSON.stringify(model)).not.toContain('private.invalid');
  expect(model.events).toEqual([]);
});

test.each([undefined, '', '   '])('a camera without a usable configured address stays unconfigured: %s', (streamUrl) => {
  const state = fixture();
  state.devices[3].streamUrl = streamUrl;
  const model = buildCameraCenterModel(getCameraCenterAccess(state, 'production'), state.rooms, createDefaultSimulationSnapshot());
  expect(model.cameras[2]).toMatchObject({ status: 'unconfigured', statusDetail: 'Camera not connected to this preview' });
});

test('an empty local model still chooses Camera Center without inventing cameras', () => {
  const state = fixture();
  state.accountUserId = state.authenticatedUserId = state.accountHomeId = state.activeHomeId = null;
  state.modelCatalogVersion = 1;
  state.devices = [];
  const access = getCameraCenterAccess(state, 'demo');
  expect(access.usesSimulationCenter).toBe(true);
  expect(access.canView).toBe(true);
  expect(buildCameraCenterModel(access, state.rooms, createDefaultSimulationSnapshot())).toEqual({ cameras: [], events: [] });
});
