import { act, renderHook } from '@testing-library/react-native';
import { useHomeStore, type HomeState, type HouseholdMember } from '../../../store/useHomeStore';
import { useCameraCenter, useCameraCenterAccess } from '../useCameraCenter';
import { cameraCenterPreferenceStore } from '../cameraCenterPreferences';
import { SimulationControlClient } from '../../three-d-home/simulationControlClient';
import { simulationPersistence } from '../../three-d-home/simulationPersistence';

jest.mock('../../three-d-home/simulationPersistence', () => {
  const actual = jest.requireActual('../../three-d-home/simulationPersistence');
  return { ...actual, simulationPersistence: new actual.SimulationPersistence({ getItem: async () => null, setItem: async () => undefined }) };
});

const initial = useHomeStore.getState();
let account = 0;

/** Use a distinct account for every test so saved preference state is never shared accidentally. */
function prepare(role: HouseholdMember['role'] = 'Owner'): HomeState {
  const id = `camera-account-${++account}`;
  const state = {
    ...initial, accountUserId: id, authenticatedUserId: id, activeMemberId: id,
    accountHomeId: 'camera-home', activeHomeId: 'camera-home', membershipReady: true,
    authTaskBlockingHome: false, sessionEpoch: account,
    household: [{ id, name: 'Camera user', role, status: 'home' as const }],
    memberPermissionOverrides: [], roomMembers: [{ memberId: id, roomIds: ['grounds'] }],
    rooms: [{ id: 'grounds', name: 'Grounds', modelRoomId: 'grounds' }],
    devices: [
      { id: 'entry-registry', name: 'Entry camera', kind: 'camera' as const, roomId: 'grounds',
        modelDeviceId: 'entry-camera', simulationOnly: true, isOn: true },
      { id: 'light-registry', name: 'Light', kind: 'light' as const, roomId: 'grounds', isOn: false },
    ],
    realtime: { enabled: false, useMqtt: false, wsUrl: '' },
  };
  useHomeStore.setState(state);
  return useHomeStore.getState();
}

/** Drain shared simulation hydration and ordered preference notifications inside React's update boundary. */
async function settle(): Promise<void> {
  await act(async () => { for (let index = 0; index < 30; index += 1) await Promise.resolve(); });
}

beforeEach(() => { prepare(); });
afterEach(() => { useHomeStore.setState(initial); jest.restoreAllMocks(); jest.useRealTimers(); });

test('shares the saved VISION event without changing canonical device state', async () => {
  const save = jest.spyOn(simulationPersistence, 'save');
  const { result } = renderHook(() => useCameraCenter(true));
  await settle();
  expect(result.current.ready).toBe(true);
  expect(result.current.cameras[0]).toMatchObject({ id: 'entry-registry', status: 'demo' });
  expect(result.current.events).toEqual([]);
  expect(save).not.toHaveBeenCalled();
  const controls = new SimulationControlClient();
  controls.connect(); await settle();
  act(() => controls.runAction('entry-camera', 'camera-snapshot'));
  await settle();
  expect(result.current.events[0]).toMatchObject({ cameraId: 'entry-registry', label: 'Sample snapshot' });
  controls.dispose();
});

test('background or navigation suspension immediately hides camera data until explicitly active again', async () => {
  const write = jest.spyOn(cameraCenterPreferenceStore, 'toggleFavorite');
  let active = true;
  const { result, rerender } = renderHook(() => useCameraCenter(active));
  await settle();
  expect(result.current.cameras).toHaveLength(1);
  const staleFavorite = result.current.toggleFavorite;
  active = false;
  rerender(undefined);
  expect(result.current.cameras).toEqual([]);
  expect(result.current.events).toEqual([]);
  expect(result.current.ready).toBe(false);
  expect(result.current.canView).toBe(true);
  act(() => staleFavorite('entry-registry'));
  expect(write).not.toHaveBeenCalled();
  active = true;
  rerender(undefined); await settle();
  expect(result.current.ready).toBe(true);
});

test('favorite choices survive reopening but not another account or household', async () => {
  const first = renderHook(() => useCameraCenter(true)); await settle();
  act(() => first.result.current.toggleFavorite('entry-registry')); await settle();
  expect(first.result.current.cameras[0].favorite).toBe(true);
  first.unmount();
  const reopened = renderHook(() => useCameraCenter(true)); await settle();
  expect(reopened.result.current.cameras[0].favorite).toBe(true);
  act(() => { useHomeStore.setState({ activeHomeId: 'another-home', accountHomeId: 'another-home' }); });
  await settle();
  expect(reopened.result.current.cameras[0].favorite).toBe(false);
  act(() => { prepare(); }); await settle();
  expect(reopened.result.current.cameras[0].favorite).toBe(false);
});

test('callbacks captured before sign-out or session replacement cannot write or retry another scope', async () => {
  const toggle = jest.spyOn(cameraCenterPreferenceStore, 'toggleFavorite');
  const retry = jest.spyOn(cameraCenterPreferenceStore, 'retry');
  const { result } = renderHook(() => useCameraCenter(true)); await settle();
  const previousFavorite = result.current.toggleFavorite;
  const previousRetry = result.current.retryPreferences;
  act(() => { useHomeStore.setState({ sessionEpoch: useHomeStore.getState().sessionEpoch + 1 }); });
  act(() => { previousFavorite('entry-registry'); previousRetry(); });
  expect(toggle).not.toHaveBeenCalled();
  expect(retry).not.toHaveBeenCalled();
  act(() => { useHomeStore.setState({ authenticatedUserId: null, membershipReady: false }); });
  expect(result.current.cameras).toEqual([]);
  expect(result.current.events).toEqual([]);
  expect(result.current.canView).toBe(false);
});

test('a last-moment camera permission or room revocation blocks stale favorite callbacks', async () => {
  const state = prepare('Guest');
  useHomeStore.setState({ memberPermissionOverrides: [{ memberId: state.activeMemberId, permission: 'camera.live', allowed: true }] });
  const toggle = jest.spyOn(cameraCenterPreferenceStore, 'toggleFavorite');
  const { result } = renderHook(() => useCameraCenter(true)); await settle();
  const previousFavorite = result.current.toggleFavorite;
  act(() => { useHomeStore.setState({ roomMembers: [] }); });
  act(() => previousFavorite('entry-registry'));
  expect(result.current.cameras).toEqual([]);
  // A changed camera scope invalidates the captured callback before it reaches persistence.
  expect(toggle).not.toHaveBeenCalled();
  expect(cameraCenterPreferenceStore.getSnapshot(result.current.scopeKey!).favoriteIds).toEqual([]);
  act(() => { useHomeStore.setState({ memberPermissionOverrides: [] }); });
  act(() => previousFavorite('entry-registry'));
  expect(result.current.canView).toBe(false);
  expect(toggle).not.toHaveBeenCalled();
});

test('default Member may watch and read history but cannot manage cameras', async () => {
  prepare('Member');
  const { result } = renderHook(() => useCameraCenter(true)); await settle();
  expect(result.current.canView).toBe(true);
  expect(result.current.canViewActivity).toBe(true);
  expect(result.current.canManage).toBe(false);
  expect(result.current.cameras[0].canControl).toBe(false);
});

test('an explicitly authorized Guest loses all content at the exact access deadline', async () => {
  jest.useFakeTimers();
  const state = prepare('Guest');
  useHomeStore.setState({
    household: [{ ...state.household[0], accessExpiresAt: new Date(Date.now() + 5000).toISOString() }],
    memberPermissionOverrides: [{ memberId: state.activeMemberId, permission: 'camera.live', allowed: true }],
  });
  const { result } = renderHook(() => useCameraCenter(true)); await settle();
  expect(result.current.cameras).toHaveLength(1);
  act(() => jest.advanceTimersByTime(5001));
  expect(result.current.canView).toBe(false);
  expect(result.current.cameras).toEqual([]);
  expect(result.current.ready).toBe(false);
});

test('default Guest cannot hydrate preferences, simulation data or media through a layout grant', async () => {
  const state = prepare('Guest');
  useHomeStore.setState({ household: [{ ...state.household[0], shareInteriorLayout: true }] });
  const load = jest.spyOn(cameraCenterPreferenceStore, 'load');
  const { result } = renderHook(() => useCameraCenter(true)); await settle();
  expect(result.current.canView).toBe(false);
  expect(result.current.cameras).toEqual([]);
  expect(load).not.toHaveBeenCalled();
});

test('access observer distinguishes permission loss/regrant and membership verification without hydrating private data', () => {
  const state = prepare('Member');
  const load = jest.spyOn(cameraCenterPreferenceStore, 'load');
  const { result } = renderHook(() => useCameraCenterAccess());
  const granted = result.current.access.identityKey;
  act(() => { useHomeStore.setState({ memberPermissionOverrides: [{ memberId: state.activeMemberId, permission: 'camera.live', allowed: false }] }); });
  expect(result.current.access.canView).toBe(false);
  expect(result.current.access.identityKey).not.toBe(granted);
  const denied = result.current.access.identityKey;
  act(() => { useHomeStore.setState({ memberPermissionOverrides: [] }); });
  expect(result.current.access.canView).toBe(true);
  expect(result.current.access.identityKey).not.toBe(denied);
  act(() => { useHomeStore.setState({ membershipReady: false }); });
  expect(result.current.access.canView).toBe(false);
  expect(result.current.access.scopeKey).toBeNull();
  act(() => { useHomeStore.setState({ membershipReady: true }); });
  expect(result.current.access.canView).toBe(true);
  expect(load).not.toHaveBeenCalled();
});

test('expiry and later extension refresh access even while protected content is inactive', () => {
  jest.useFakeTimers();
  const state = prepare('Guest');
  useHomeStore.setState({
    household: [{ ...state.household[0], accessExpiresAt: new Date(Date.now() + 5000).toISOString() }],
    memberPermissionOverrides: [{ memberId: state.activeMemberId, permission: 'camera.live', allowed: true }],
  });
  const { result } = renderHook(() => useCameraCenter(false));
  expect(result.current.canView).toBe(true);
  expect(result.current.cameras).toEqual([]);
  const granted = result.current.identityKey;
  act(() => jest.advanceTimersByTime(5001));
  expect(result.current.canView).toBe(false);
  expect(result.current.identityKey).not.toBe(granted);
  const expired = result.current.identityKey;
  act(() => { useHomeStore.setState({ household: [{ ...state.household[0], accessExpiresAt: new Date(Date.now() + 5000).toISOString() }] }); });
  expect(result.current.canView).toBe(true);
  expect(result.current.identityKey).not.toBe(expired);
  expect(result.current.cameras).toEqual([]);
  act(() => jest.advanceTimersByTime(5001));
  expect(result.current.canView).toBe(false);
});
