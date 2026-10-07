import { act, renderHook } from '@testing-library/react-native';
import { useHomeStore, type HomeState } from '../../../store/useHomeStore';
import { EMPTY_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import { useSceneSimulationSession } from '../useSceneSimulationSession';

let previous: HomeState;

/** Seed a verified Guest whose sole linked room contains one permitted light. */
function guestHome(): HomeState {
  return { ...useHomeStore.getState(), accountUserId: 'scene-guest', authenticatedUserId: 'scene-guest',
    accountHomeId: 'scene-home', activeHomeId: 'scene-home', activeMemberId: 'scene-guest', membershipReady: true,
    household: [{ id: 'scene-guest', name: 'Guest', role: 'Guest', status: 'home' }],
    rooms: [{ id: 'scene-living', name: 'Living room', modelRoomId: 'living' }],
    devices: [{ id: 'scene-light', name: 'Living light', roomId: 'scene-living', kind: 'light', modelDeviceId: 'living-light', isOn: false }],
    roomMembers: [{ memberId: 'scene-guest', roomIds: ['scene-living'] }], memberPermissionOverrides: [],
    scenes: [], activeSceneId: null,
  };
}

/** Drain snapshot hydration and catalog work without mounting a real renderer. */
async function settle(): Promise<void> { await act(async () => { for (let index = 0; index < 24; index += 1) await Promise.resolve(); }); }

beforeEach(() => { previous = useHomeStore.getState(); useHomeStore.setState(guestHome()); });
afterEach(() => { useHomeStore.setState(previous, true); });

test('reconnects a warm document with fresh permissions while synchronously masking invalidated access', async () => {
  const deliver = jest.fn();
  const catalog = jest.fn();
  const status = jest.fn();
  const home = useHomeStore.getState();
  const { result, unmount } = renderHook(() => useSceneSimulationSession(deliver, catalog, status));
  await settle();
  const first = result.current.current;
  expect(first).not.toBeNull();
  expect(first?.canNavigate()).toBe(true);
  expect(deliver.mock.lastCall?.[0].access.controllableDeviceIds).toEqual(['living-light']);
  act(() => {
    useHomeStore.setState({ membershipReady: false, activeHomeId: null, activeMemberId: '', household: [] });
    expect(deliver.mock.lastCall?.[0].access).toEqual(EMPTY_SCENE_ACCESS);
    expect(catalog.mock.lastCall?.[0].catalog).toEqual({ scenes: [], activeSceneId: null });
    expect(first?.canNavigate()).toBe(false);
  });
  expect(result.current.current).toBeNull();
  const count = deliver.mock.calls.length;
  first?.handleMessage({ channel: 'vantahome-simulation', version: 1, type: 'request' });
  await settle();
  expect(deliver).toHaveBeenCalledTimes(count);

  act(() => { useHomeStore.setState({ ...home, roomMembers: [] }); });
  await settle();
  expect(result.current.current).not.toBe(first);
  expect(deliver.mock.lastCall?.[0].access).toMatchObject({ propertyOverview: true, roomIds: [], deviceIds: [], controllableDeviceIds: [] });
  expect(catalog.mock.lastCall?.[0].catalog).toEqual({ scenes: [], activeSceneId: null });
  unmount();
});

test('does not hydrate a simulation bridge while membership remains unverified', async () => {
  useHomeStore.setState({ membershipReady: false, household: [], activeMemberId: '', activeHomeId: null });
  const deliver = jest.fn();
  const catalog = jest.fn();
  const status = jest.fn();
  const { result, unmount } = renderHook(() => useSceneSimulationSession(deliver, catalog, status));
  await settle();
  expect(result.current.current).toBeNull();
  expect(deliver).not.toHaveBeenCalled();
  expect(status).not.toHaveBeenCalled();
  unmount();
});
