import { getDevice } from '../../../../packages/home-scene/src/data';
import { createDefaultDevicePlacement, getRuntimePlacements, replaceRuntimeDevices } from '../../../../packages/home-scene/src/devicePlacement';
import { useHomeStore, type HomeState, type HouseholdMember } from '../../../store/useHomeStore';
import { runtimeDevicesForHome, synchronizeRuntimeDeviceCatalog } from '../runtimeDeviceCatalog';

const deviceId = '00000000-0000-4000-8000-000000000001';
const modelId = `placed-${deviceId}`;
/** Model a fresh server-admitted registry, not a cached account that merely knows a device ID. */
function home(role: HouseholdMember['role'] = 'Owner'): HomeState {
  return { ...useHomeStore.getState(), accountUserId: 'owner', authenticatedUserId: 'owner', activeMemberId: 'owner',
    accountHomeId: 'home-a', activeHomeId: 'home-a', membershipReady: true, authTaskBlockingHome: false,
    household: [{ id: 'owner', name: 'Person', role, status: 'home' }],
    rooms: [{ id: 'room-a', name: 'Living', modelRoomId: 'living' }, { id: 'room-b', name: 'Primary', modelRoomId: 'master' }],
    roomMembers: [{ memberId: 'owner', roomIds: ['room-a'] }], memberPermissionOverrides: [],
    devices: [{ id: deviceId, modelDeviceId: modelId, name: 'Reading light', kind: 'light', roomId: 'room-a', isOn: false,
      simulationOnly: true, modelPlacement: createDefaultDevicePlacement('master-bedside-left', 'living')! }],
  };
}
afterEach(() => { replaceRuntimeDevices([]); });

test('only explicit, typed simulation registry rows become runtime fixtures', () => {
  const state = home();
  expect(runtimeDevicesForHome(state)).toEqual([{ id: modelId, name: 'Reading light', placement: state.devices[0].modelPlacement }]);
  synchronizeRuntimeDeviceCatalog(state);
  expect(getDevice(modelId)).toMatchObject({ roomId: 'living', kind: 'light' });
  for (const patch of [{ simulationOnly: false }, { modelDeviceId: 'master-light' }, { kind: 'fan' as const }, { roomId: 'room-b' }, { modelPlacement: undefined }]) {
    expect(runtimeDevicesForHome({ ...state, devices: [{ ...state.devices[0], ...patch }] })).toEqual([]);
  }
});

test.each([
  { membershipReady: false }, { authTaskBlockingHome: true }, { accountUserId: 'another' },
  { authenticatedUserId: null }, { accountHomeId: 'another' }, { activeHomeId: null }, { activeMemberId: 'another' },
])('cached metadata cannot outlive verified account and membership authority %#', (patch) => {
  const state = home();
  synchronizeRuntimeDeviceCatalog(state);
  expect(getRuntimePlacements()).toHaveLength(1);
  synchronizeRuntimeDeviceCatalog({ ...state, ...patch });
  expect(getRuntimePlacements()).toEqual([]);
  expect(getDevice(modelId)).toBeUndefined();
});

test('guest room grants and expiry govern device geometry independently from shared interior layout', () => {
  const state = home('Guest');
  state.household[0].shareInteriorLayout = true;
  expect(runtimeDevicesForHome(state)).toHaveLength(1);
  expect(runtimeDevicesForHome({ ...state, roomMembers: [] })).toEqual([]);
  state.household[0].accessExpiresAt = new Date(Date.now() - 1000).toISOString();
  expect(runtimeDevicesForHome(state)).toEqual([]);
});

test('switching to another home replaces rather than merges the previous home geometry', () => {
  synchronizeRuntimeDeviceCatalog(home());
  const second = home();
  second.accountHomeId = 'home-b'; second.activeHomeId = 'home-b'; second.devices = [];
  synchronizeRuntimeDeviceCatalog(second);
  expect(getDevice(modelId)).toBeUndefined();
});
