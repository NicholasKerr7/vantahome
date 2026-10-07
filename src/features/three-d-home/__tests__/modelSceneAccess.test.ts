import { createStore } from 'zustand/vanilla';
import { useHomeStore, type HomeState, type HouseholdMember } from '../../../store/useHomeStore';
import { resolveModelSceneAccess, modelPresentationIdentity, modelSimulationIdentity, modelSimulationScope, scopeSimulationSnapshot } from '../modelSceneAccess';
import { SimulationSession } from '../simulationSession';
import { SimulationPersistence } from '../simulationPersistence';
import { EMPTY_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';

/** Model a verified account using database IDs distinct from authored mesh/device IDs. */
function account(role: HouseholdMember['role'] = 'Guest'): HomeState {
  return { ...useHomeStore.getState(), accountUserId: 'person', authenticatedUserId: 'person',
    accountHomeId: 'home', activeHomeId: 'home', activeMemberId: 'person', membershipReady: true,
    household: [{ id: 'person', name: 'Person', role, status: 'home' }],
    rooms: [{ id: 'room-a', name: 'Private room', modelRoomId: 'master' }, { id: 'room-b', name: 'Family room', modelRoomId: 'family' }],
    roomMembers: [{ memberId: 'person', roomIds: ['room-a'] }], memberPermissionOverrides: [],
    devices: [
      { id: 'lamp', kind: 'light', name: 'Lamp', roomId: 'room-a', modelDeviceId: 'master-light', isOn: false },
      { id: 'blinds', kind: 'blinds', name: 'Blinds', roomId: 'room-a', modelDeviceId: 'master-blinds', isOn: false },
      { id: 'tv', kind: 'tv', name: 'TV', roomId: 'room-b', modelDeviceId: 'family-tv', isOn: false },
    ],
  };
}

/** Drain hydration and transport microtasks without real clocks or account services. */
async function settle(): Promise<void> { for (let i = 0; i < 24; i++) await Promise.resolve(); }

test('guests can explore the property while only assigned room states and permitted controls are granted', () => {
  expect(resolveModelSceneAccess(account(), 'production')).toEqual({ fullHome: false, propertyOverview: true, interiorLayout: false,
    roomIds: ['master'], deviceIds: ['master-blinds', 'master-light'], controllableDeviceIds: ['master-light'] });
  expect(resolveModelSceneAccess(account('Tenant'), 'production').controllableDeviceIds).toContain('master-blinds');
});

test('Member remains whole-home scoped but no room or device is inferred from its name', () => {
  const state = account('Member');
  expect(resolveModelSceneAccess(state, 'production').roomIds).toEqual(['master', 'family']);
  state.rooms = state.rooms.map((room) => ({ ...room, modelRoomId: null }));
  expect(resolveModelSceneAccess(state, 'production').roomIds).toEqual([]);
});

test.each(['Guest', 'Tenant'] as const)('sharing the %s interior layout does not grant extra device information or controls', (role) => {
  const state = account(role);
  const before = resolveModelSceneAccess(state, 'production');
  state.household[0].shareInteriorLayout = true;
  expect(resolveModelSceneAccess(state, 'production')).toEqual({ ...before, interiorLayout: true });
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates['family-tv'] = { on: true, level: 80, settings: { source: 'HDMI 1' } };
  const scoped = scopeSimulationSnapshot(snapshot, resolveModelSceneAccess(state, 'production'));
  expect(scoped.deviceStates['family-tv']).toEqual({ on: false, level: 0 });
  expect(scoped.deviceStates['master-light']).toEqual(snapshot.deviceStates['master-light']);
});

test('a current member with no room assignment can view the grounds without receiving device grants', () => {
  const state = account();
  state.roomMembers = [];
  expect(resolveModelSceneAccess(state, 'production')).toEqual({
    fullHome: false, propertyOverview: true, interiorLayout: false,
    roomIds: [], deviceIds: [], controllableDeviceIds: [],
  });
});

test('wrong-room and wrong-kind bindings fail closed and explicit denials remove controls', () => {
  const state = account();
  state.devices = state.devices.map((device) => device.id === 'blinds' ? { ...device, modelDeviceId: 'family-tv' } : device);
  state.memberPermissionOverrides = [{ memberId: 'person', permission: 'light.control', allowed: false }];
  expect(resolveModelSceneAccess(state, 'production')).toMatchObject({ deviceIds: ['master-light'], controllableDeviceIds: [] });
});

test.each(['pending', 'expired', 'mismatched'] as const)('%s identity cannot view any model room', (condition) => {
  const state = account();
  if (condition === 'pending') state.membershipReady = false;
  if (condition === 'mismatched') state.accountUserId = 'other';
  if (condition === 'expired') state.household[0].accessExpiresAt = new Date(Date.now() - 1).toISOString();
  state.household[0].shareInteriorLayout = true;
  expect(resolveModelSceneAccess(state, 'production')).toEqual(EMPTY_SCENE_ACCESS);
});

test('isolated simulation keys distinguish both household and person', () => {
  const state = account();
  expect(modelSimulationScope(state, false)).not.toBe(modelSimulationScope({ ...state, accountHomeId: 'other' }, false));
  expect(modelSimulationScope(state, false)).not.toBe(modelSimulationScope({ ...state, activeMemberId: 'other' }, false));
});

test('a membership recheck retains only the presentation identity, while its authority bridge changes', () => {
  const current = account();
  const checking: HomeState = { ...current, membershipReady: false, activeHomeId: null, activeMemberId: '', household: [] };
  expect(modelPresentationIdentity(checking)).toBe(modelPresentationIdentity(current));
  expect(modelSimulationIdentity(checking)).not.toBe(modelSimulationIdentity(current));
  expect(resolveModelSceneAccess(checking, 'production')).toEqual(EMPTY_SCENE_ACCESS);
});

test.each([
  { authenticatedUserId: 'other' }, { accountUserId: 'other' }, { accountHomeId: 'other' },
  { sessionEpoch: 100 }, { realtime: { enabled: true, useMqtt: false, wsUrl: '' } },
])('presentation resources remain isolated when the account or transport scope changes %#', (change) => {
  const current = account();
  expect(modelPresentationIdentity({ ...current, ...change })).not.toBe(modelPresentationIdentity(current));
});

test('unauthenticated demo member previews do not share a presentation identity', () => {
  const current = { ...account(), accountUserId: null, authenticatedUserId: null, accountHomeId: null, activeHomeId: null };
  expect(modelPresentationIdentity({ ...current, activeMemberId: 'another-demo-member' })).not.toBe(modelPresentationIdentity(current));
});

test('shared interior tour denies forged or stale actions, masks hidden state, and never mutates the real registry', async () => {
  const state = account();
  state.household[0].shareInteriorLayout = true;
  const store = createStore<HomeState>(() => state);
  const storage = { getItem: async () => null, setItem: jest.fn(async () => undefined) };
  const deliver = jest.fn();
  const session = new SimulationSession(deliver, jest.fn(), { store, mode: 'production', persistence: new SimulationPersistence(storage) });
  session.handleMessage({ channel: 'vantahome-simulation', version: 1, type: 'request' });
  await settle();
  expect(deliver.mock.lastCall?.[0].state.deviceStates['family-tv']).toEqual({ on: false, level: 0 });
  session.handleMessage({ channel: 'vantahome-simulation', version: 1, type: 'patch', requestId: 1,
    changes: { deviceStates: { 'master-light': { on: true, level: 40 }, 'family-tv': { on: true, level: 50 } } } });
  await settle();
  expect(storage.setItem).not.toHaveBeenCalled();
  session.handleMessage({ channel: 'vantahome-simulation', version: 1, type: 'patch', requestId: 2,
    changes: { deviceStates: { 'master-light': { on: true, level: 40 } } } });
  await settle();
  expect(deliver.mock.lastCall?.[0].state.deviceStates['master-light']).toMatchObject({ on: true, level: 40 });
  expect(store.getState().devices).toBe(state.devices);
  store.setState({ roomMembers: [] });
  expect(deliver.mock.lastCall?.[0].access.roomIds).toEqual([]);
  session.handleMessage({ channel: 'vantahome-simulation', version: 1, type: 'patch', requestId: 3,
    changes: { deviceStates: { 'master-light': { on: true, level: 99 } } } });
  await settle();
  expect(deliver.mock.lastCall?.[0].state.deviceStates['master-light']).toEqual({ on: false, level: 0 });
  session.dispose();
});

test('an open scene revokes guest access at its deadline without another user action', async () => {
  jest.useFakeTimers();
  const state = account();
  state.household[0].accessExpiresAt = new Date(Date.now() + 1000).toISOString();
  const store = createStore<HomeState>(() => state);
  const deliver = jest.fn();
  const session = new SimulationSession(deliver, jest.fn(), { store, mode: 'production',
    persistence: new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined }) });
  session.handleMessage({ channel: 'vantahome-simulation', version: 1, type: 'request' });
  await settle();
  expect(deliver.mock.lastCall?.[0].access.roomIds).toEqual(['master']);
  jest.advanceTimersByTime(1001);
  expect(deliver.mock.lastCall?.[0].access.roomIds).toEqual([]);
  session.dispose();
  jest.useRealTimers();
});

test('an open scene receives layout sharing and revocation without broadening its device grants', async () => {
  const state = account();
  const store = createStore<HomeState>(() => state);
  const deliver = jest.fn();
  const session = new SimulationSession(deliver, jest.fn(), { store, mode: 'production',
    persistence: new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined }) });
  session.handleMessage({ channel: 'vantahome-simulation', version: 1, type: 'request' });
  await settle();
  const initialAccess = deliver.mock.lastCall?.[0].access;
  expect(initialAccess).toMatchObject({ propertyOverview: true, interiorLayout: false });
  store.setState({ household: [{ ...state.household[0], shareInteriorLayout: true }] });
  expect(deliver.mock.lastCall?.[0].access).toEqual({ ...initialAccess, interiorLayout: true });
  expect(deliver.mock.lastCall?.[0].state.deviceStates['family-tv']).toEqual({ on: false, level: 0 });
  store.setState({ household: [{ ...state.household[0], shareInteriorLayout: false }] });
  expect(deliver.mock.lastCall?.[0].access).toEqual(initialAccess);
  session.dispose();
});
