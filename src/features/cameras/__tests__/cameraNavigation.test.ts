import { useHomeStore } from '../../../store/useHomeStore';
import { CommonActions, type NavigationAction } from '@react-navigation/native';
import { StackRouter } from '@react-navigation/routers';
import { openCameraCenter, consumeCameraLocation, locateCameraInHome, openCameraViewer, resolveCameraDeviceId } from '../cameraNavigation';

const initial = useHomeStore.getState();
const dispatch = jest.fn();

/** Provide one explicitly bound camera under a verified household identity. */
function seedCamera() {
  useHomeStore.setState({ ...initial, accountUserId: 'owner', authenticatedUserId: 'owner', accountHomeId: 'home', activeHomeId: 'home',
    activeMemberId: 'owner', membershipReady: true, authTaskBlockingHome: false,
    household: [{ id: 'owner', name: 'Owner', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'grounds', name: 'Grounds', modelRoomId: 'grounds' }],
    devices: [{ id: 'camera-one', name: 'Entry camera', roomId: 'grounds', kind: 'camera', isOn: true, modelDeviceId: 'entry-camera', simulationOnly: true }],
    realtime: { ...initial.realtime, enabled: false, useMqtt: false }, memberPermissionOverrides: [],
  });
}
/** Read the exact nested Home intent produced by the public navigation helper. */
function locationToken(): string {
  return dispatch.mock.calls.at(-1)![0].payload.params.params.cameraLocationToken as string;
}
beforeEach(() => { jest.useFakeTimers(); dispatch.mockClear(); seedCamera(); });
afterEach(() => { useHomeStore.setState(initial, true); jest.useRealTimers(); });

test('Watch resolves the exact registry camera and performs no device writes', () => {
  const devices = useHomeStore.getState().devices;
  expect(resolveCameraDeviceId(useHomeStore.getState(), 'entry-camera')).toBe('camera-one');
  expect(resolveCameraDeviceId(useHomeStore.getState(), 'living-light')).toBeNull();
  expect(openCameraViewer(dispatch, 'camera-one')).toBe(true);
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: { name: 'CameraViewer', params: { deviceId: 'camera-one' }, pop: true } }));
  expect(openCameraViewer(dispatch, 'entry-camera')).toBe(false);
  expect(useHomeStore.getState().devices).toBe(devices);
});

test('Locate reuses Home, redeems once and preserves all canonical state', () => {
  const devices = useHomeStore.getState().devices;
  expect(locateCameraInHome(dispatch, 'camera-one')).toBe(true);
  const token = locationToken();
  expect(dispatch.mock.calls[0][0]).toMatchObject({ payload: { name: 'Main', pop: true, params: { screen: 'Home', pop: true } } });
  expect(consumeCameraLocation(token)).toBe('entry-camera');
  expect(consumeCameraLocation(token)).toBeNull();
  expect(useHomeStore.getState().devices).toBe(devices);
});

test.each(['expiry', 'identity', 'membership', 'removed', 'permission'] as const)('Locate fails closed after %s changes', (change) => {
  expect(locateCameraInHome(dispatch, 'camera-one')).toBe(true);
  const token = locationToken();
  if (change === 'expiry') jest.advanceTimersByTime(30_001);
  if (change === 'identity') useHomeStore.setState({ sessionEpoch: initial.sessionEpoch + 1 });
  if (change === 'membership') useHomeStore.setState({ membershipReady: false });
  if (change === 'removed') useHomeStore.setState({ devices: [] });
  if (change === 'permission') useHomeStore.setState({ household: [{ id: 'owner', name: 'Guest', role: 'Guest', status: 'home', shareInteriorLayout: true }] });
  expect(consumeCameraLocation(token)).toBeNull();
});

test('property and interior sharing cannot make cameras visible to a Guest', () => {
  useHomeStore.setState({ household: [{ id: 'owner', name: 'Guest', role: 'Guest', status: 'home', shareInteriorLayout: true }] });
  expect(openCameraViewer(dispatch, 'camera-one')).toBe(false);
  expect(locateCameraInHome(dispatch, 'camera-one')).toBe(false);
  expect(resolveCameraDeviceId(useHomeStore.getState(), 'entry-camera')).toBeNull();
  expect(dispatch).not.toHaveBeenCalled();
});


test('repeated Wall, Watch, All cameras and Controls navigation reuse existing stack routes', () => {
  const router = StackRouter({ initialRouteName: 'Main' });
  const options = { routeNames: ['Main', 'Cameras', 'CameraViewer', 'DeviceDetail'], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  /** Exercise the installed router, not just the shape of emitted navigation actions. */
  const navigate = (action: NavigationAction): void => {
    expect(action.type).toBe('NAVIGATE');
    const next = router.getStateForAction(state, action as ReturnType<typeof CommonActions.navigate>, options);
    if (next) state = router.getRehydratedState(next, options);
  };
  for (let index = 0; index < 4; index += 1) {
    expect(openCameraCenter(navigate)).toBe(true);
    expect(state.routes.map((route) => route.name)).toEqual(['Main', 'Cameras']);
    openCameraViewer(navigate, 'camera-one');
    expect(state.routes.map((route) => route.name)).toEqual(['Main', 'Cameras', 'CameraViewer']);
    navigate(CommonActions.navigate({ name: 'DeviceDetail', params: { deviceId: 'camera-one' } }));
    openCameraViewer(navigate, 'camera-one');
    expect(state.routes.map((route) => route.name)).toEqual(['Main', 'Cameras', 'CameraViewer']);
  }
  useHomeStore.setState({ membershipReady: false });
  expect(openCameraCenter(navigate)).toBe(false);
});
