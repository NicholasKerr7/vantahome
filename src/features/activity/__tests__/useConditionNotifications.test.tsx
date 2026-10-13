import { act, renderHook } from '@testing-library/react-native';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { DEVICES } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot, type SimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { useHomeStore, type HomeState } from '../../../store/useHomeStore';
import { sendLocalNotification } from '../../../services/notifications';
import { useConditionNotifications } from '../useConditionNotifications';

jest.mock('../../../services/notifications', () => ({ sendLocalNotification: jest.fn(async () => undefined) }));
const send = jest.mocked(sendLocalNotification);
const initialHome = useHomeStore.getState();
const originalAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState');
const originalPlatform = Object.getOwnPropertyDescriptor(Platform, 'OS');
let changeAppState: (state: AppStateStatus) => void;

/** Exercise the real report/grant selectors against one fresh physical report in an authenticated home. */
function physicalHome(): Partial<HomeState> {
  return {
    ...initialHome, accountUserId: 'owner', authenticatedUserId: 'owner', accountHomeId: 'home', activeHomeId: 'home',
    sessionEpoch: initialHome.sessionEpoch + 1, activeMemberId: 'owner', membershipReady: true,
    household: [{ id: 'owner', userId: 'owner', name: 'Owner', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'utility', name: 'Utility' }], roomMembers: [], memberPermissionOverrides: [],
    devices: [{ id: 'air', roomId: 'utility', name: 'Utility air', kind: 'air', isOn: true,
      observedAt: Date.now(), airCo2: 500, airAlertCo2: 600, airAlertsEnabled: true }],
  };
}

/** Apply a fresh sensor report through the subscribed store without introducing a second observer. */
function setCo2(value: number): void {
  act(() => { useHomeStore.setState({ devices: useHomeStore.getState().devices.map(device => ({ ...device, airCo2: value, observedAt: Date.now() })) }); });
}

beforeEach(() => {
  send.mockClear();
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    changeAppState = listener;
    return { remove: jest.fn() };
  });
  useHomeStore.setState(physicalHome());
});

afterEach(() => {
  jest.restoreAllMocks();
  if (originalAppState) Object.defineProperty(AppState, 'currentState', originalAppState);
  if (originalPlatform) Object.defineProperty(Platform, 'OS', originalPlatform);
  useHomeStore.setState(initialHome);
});

test('reports a new foreground condition once, clears it, and reports the next episode without replay on mount', () => {
  setCo2(700);
  renderHook(() => useConditionNotifications(null));
  expect(send).not.toHaveBeenCalled();
  setCo2(500);
  setCo2(700);
  setCo2(710);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0].slice(0, 3)).toEqual([
    'Reported CO₂ above limit', 'Utility air. 700 ppm · configured limit 600 ppm', { kind: 'condition', simulated: false },
  ]);
  setCo2(500);
  setCo2(720);
  expect(send).toHaveBeenCalledTimes(2);
});

test('invalidates a pending notice from an earlier condition episode, even if that condition reappears', () => {
  renderHook(() => useConditionNotifications(null));
  setCo2(700);
  const oldDelivery = send.mock.calls[0][3]!.shouldSend;
  expect(oldDelivery()).toBe(true);
  setCo2(500);
  expect(oldDelivery()).toBe(false);
  setCo2(720);
  expect(send).toHaveBeenCalledTimes(2);
  expect(oldDelivery()).toBe(false);
  expect(send.mock.calls[1][3]!.shouldSend()).toBe(true);
});

test('background and resume never revive an old pending foreground notice', () => {
  renderHook(() => useConditionNotifications(null));
  setCo2(700);
  const pending = send.mock.calls[0][3]!.shouldSend;
  act(() => changeAppState('background'));
  expect(pending()).toBe(false);
  act(() => changeAppState('active'));
  expect(send).toHaveBeenCalledTimes(1);
  expect(pending()).toBe(false);
});

test('revocation and teardown invalidate pending private details', () => {
  useHomeStore.setState({ household: [{ id: 'owner', userId: 'owner', name: 'Guest', role: 'Guest', status: 'home' }],
    roomMembers: [{ memberId: 'owner', roomIds: ['utility'] }] });
  const { unmount } = renderHook(() => useConditionNotifications(null));
  setCo2(700);
  const pending = send.mock.calls[0][3]!.shouldSend;
  act(() => { useHomeStore.setState({ roomMembers: [] }); });
  expect(pending()).toBe(false);
  unmount();
  expect(pending()).toBe(false);
});

test.each(['device', 'global'] as const)('turning %s notices off then on does not revive a pending old notice', (preference) => {
  renderHook(() => useConditionNotifications(null));
  setCo2(700);
  const pending = send.mock.calls[0][3]!.shouldSend;
  for (const enabled of [false, true]) {
    act(() => {
      if (preference === 'global') useHomeStore.setState({ preferences: { ...useHomeStore.getState().preferences, notifications: enabled } });
      else useHomeStore.setState({ devices: useHomeStore.getState().devices.map(device => ({ ...device, airAlertsEnabled: enabled })) });
    });
  }
  expect(send).toHaveBeenCalledTimes(1);
  expect(pending()).toBe(false);
});

test('canonical model samples notify only after hydration and never borrow registry sample values', () => {
  const model = DEVICES.find(device => device.kind === 'air')!;
  useHomeStore.setState({ rooms: [{ id: 'utility', name: 'Utility', modelRoomId: model.roomId }],
    devices: [{ ...useHomeStore.getState().devices[0], simulationOnly: true, modelDeviceId: model.id, airCo2: 3000 }] });
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[model.id] = { on: true, level: 0, settings: { airCo2: 500, airAlertCo2: 600, airAlertsEnabled: true } };
  const { rerender } = renderHook(({ state, ready }: { state: SimulationSnapshot | null; ready: boolean }) => useConditionNotifications(state, ready),
    { initialProps: { state: null as SimulationSnapshot | null, ready: false } });
  expect(send).not.toHaveBeenCalled();
  rerender({ state: snapshot, ready: true });
  expect(send).not.toHaveBeenCalled();
  const next = { ...snapshot, deviceStates: { ...snapshot.deviceStates, [model.id]: { ...snapshot.deviceStates[model.id], settings: { airCo2: 620, airAlertCo2: 600, airAlertsEnabled: true } } } };
  rerender({ state: next, ready: true });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toBe('Simulated CO₂ above limit');
  expect(send.mock.calls[0][1]).toContain('620 ppm');
  expect(send.mock.calls[0][2]).toMatchObject({ simulated: true });
});

test('browser observations keep reports in-app instead of asking for native OS delivery', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  renderHook(() => useConditionNotifications(null));
  setCo2(700);
  expect(send).not.toHaveBeenCalled();
});
