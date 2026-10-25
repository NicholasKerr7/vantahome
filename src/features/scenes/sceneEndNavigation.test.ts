import { openSceneEndReview } from './sceneEndNavigation';
import { useHomeStore } from '../../store/useHomeStore';

const initial = useHomeStore.getState();
const scene = { id: 'evening', name: 'Evening', roomId: 'room', scope: 'room' as const,
  actions: [{ type: 'patch' as const, deviceId: 'light', patch: { isOn: true, brightness: 30 } }] };

beforeEach(() => {
  useHomeStore.setState({ ...initial, accountUserId: 'person', authenticatedUserId: 'person', activeHomeId: 'home', accountHomeId: 'home',
    membershipReady: true, authTaskBlockingHome: false, activeMemberId: 'person',
    household: [{ id: 'person', name: 'Member', role: 'Member', status: 'home' }],
    memberPermissionOverrides: [], rooms: [{ id: 'room', name: 'Living room', modelRoomId: 'living' }],
    devices: [{ id: 'light', name: 'Pendant', modelDeviceId: 'living-light', roomId: 'room', kind: 'light', isOn: true, brightness: 30, simulationOnly: true }],
    scenes: [scene], activeSceneId: scene.id, realtime: { ...initial.realtime, enabled: false, useMqtt: false },
  });
});
afterEach(() => useHomeStore.setState(initial, true));

test('opens only review for the current visible scene, without applying device or scene changes', () => {
  const dispatch = jest.fn();
  const before = useHomeStore.getState();
  expect(openSceneEndReview(dispatch, 'evening')).toBe(true);
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: {
    name: 'Main', pop: true, params: { screen: 'Scenes', params: { sceneEndId: 'evening' }, pop: true },
  } }));
  expect(useHomeStore.getState()).toBe(before);
});

test('rejects stale identities, authority loss, hidden scenes and blocked home verification', () => {
  const dispatch = jest.fn();
  expect(openSceneEndReview(dispatch, 'another-scene')).toBe(false);
  useHomeStore.setState({ activeSceneId: null });
  expect(openSceneEndReview(dispatch, 'evening')).toBe(false);
  useHomeStore.setState({ activeSceneId: scene.id, authTaskBlockingHome: true });
  expect(openSceneEndReview(dispatch, 'evening')).toBe(false);
  useHomeStore.setState({ authTaskBlockingHome: false, membershipReady: false });
  expect(openSceneEndReview(dispatch, 'evening')).toBe(false);
  useHomeStore.setState({ membershipReady: true, household: [{ id: 'person', name: 'Guest', role: 'Guest', status: 'home' }] });
  expect(openSceneEndReview(dispatch, 'evening')).toBe(false);
  useHomeStore.setState({ household: [{ id: 'person', name: 'Member', role: 'Member', status: 'home' }], scenes: [{ ...scene, roomId: 'missing' }] });
  expect(openSceneEndReview(dispatch, 'evening')).toBe(false);
  expect(dispatch).not.toHaveBeenCalled();
});
