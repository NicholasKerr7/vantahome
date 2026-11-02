import React from 'react';
import { NavigationContext } from '@react-navigation/native';
import { AppState, type AppStateStatus } from 'react-native';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { useHomeStore, type HomeState } from '../../../store/useHomeStore';
import { simulationPersistence } from '../../three-d-home/simulationPersistence';
import { LightingConnectionRehearsal } from '../lightingConnectionRehearsal';
import { canPrepareLightingConnection, lightingPreparationIdentity } from '../lightingPreparationAccess';
import { useLightingConnectionRehearsal } from '../useLightingConnectionRehearsal';

const originalState = useHomeStore.getState();
const originalAppState = AppState.currentState;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const appListeners = new Set<(state: AppStateStatus) => void>();

/** Use the real access selector with a verified administrator and an unrelated household light. */
function prepare(): HomeState {
  useHomeStore.setState({
    ...originalState,
    accountUserId: 'lighting-owner', authenticatedUserId: 'lighting-owner',
    accountHomeId: 'lighting-home', activeHomeId: 'lighting-home',
    activeMemberId: 'lighting-owner', sessionEpoch: 7, membershipReady: true,
    authTaskBlockingHome: false,
    household: [{ id: 'lighting-owner', name: 'Sample owner', role: 'Owner', status: 'home' }],
    memberPermissionOverrides: [], roomMembers: [],
    rooms: [{ id: 'living', name: 'Living room' }],
    devices: [{ id: 'registered-light', name: 'Household light', kind: 'light', roomId: 'living', isOn: false }],
    realtime: { enabled: false, useMqtt: false, wsUrl: '' },
  });
  const state = useHomeStore.getState();
  expect(canPrepareLightingConnection(state)).toBe(true);
  return state;
}

/** Deliver real lifecycle listener callbacks inside React's update boundary. */
function changeAppState(state: AppStateStatus): void {
  act(() => {
    AppState.currentState = state;
    [...appListeners].forEach((listener) => listener(state));
  });
}

/** Capture the hook's local adapter without replacing its implementation. */
function mountRehearsal(strict = false) {
  const identity = lightingPreparationIdentity(useHomeStore.getState());
  const hook = renderHook(() => useLightingConnectionRehearsal(identity), strict ? { wrapper: React.StrictMode } : {});
  let connection: LightingConnectionRehearsal | undefined;
  hook.result.current.run((current) => { connection = current; });
  if (!connection) throw new Error('Authorized hook did not expose its rehearsal.');
  return { ...hook, connection };
}

beforeEach(() => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  appListeners.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appListeners.add(listener);
    return { remove: () => { appListeners.delete(listener); } };
  });
  prepare();
});

afterEach(() => {
  cleanup();
  useHomeStore.setState(originalState);
  AppState.currentState = originalAppState;
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
  jest.clearAllTimers();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const scopeChanges: Array<{ label: string; patch: (state: HomeState) => Partial<HomeState> }> = [
  { label: 'verified membership loss', patch: () => ({ membershipReady: false }) },
  { label: 'sign out', patch: () => ({ authenticatedUserId: null }) },
  { label: 'account mismatch', patch: () => ({ accountUserId: 'another-account' }) },
  { label: 'account replacement', patch: (state) => ({
    accountUserId: 'replacement-owner', authenticatedUserId: 'replacement-owner', activeMemberId: 'replacement-owner',
    household: [{ ...state.household[0], id: 'replacement-owner' }],
  }) },
  { label: 'household replacement', patch: () => ({ accountHomeId: 'another-home', activeHomeId: 'another-home' }) },
  { label: 'household mismatch', patch: () => ({ activeHomeId: 'another-home' }) },
  { label: 'active member replacement', patch: () => ({ activeMemberId: 'missing-member' }) },
  { label: 'member downgrade', patch: (state) => ({ household: [{ ...state.household[0], role: 'Member' }] }) },
  { label: 'administrator role replacement', patch: (state) => ({ household: [{ ...state.household[0], role: 'Admin' }] }) },
  { label: 'session replacement', patch: (state) => ({ sessionEpoch: state.sessionEpoch + 1 }) },
];

test.each(scopeChanges)('$label synchronously rejects held actions and invalidates in-flight sample results', ({ patch }) => {
  const { result, connection } = mountRehearsal();
  const oldRun = result.current.run;
  const timerSpy = jest.spyOn(global, 'setTimeout');
  act(() => oldRun((current) => current.actions.toggle()));
  const pendingCallbacks = timerSpy.mock.calls.map(([callback]) => callback);
  expect(connection.getSnapshot().phase).toBe('sending');
  const heldAction = jest.fn((current: LightingConnectionRehearsal) => current.actions.toggle());
  act(() => {
    // Invoke before React can rerender: the direct store subscription and action guard must win.
    useHomeStore.setState(patch(useHomeStore.getState()));
    oldRun(heldAction);
  });
  expect(heldAction).not.toHaveBeenCalled();
  const invalidated = connection.getSnapshot();
  expect(invalidated.model.on).toBe(false);
  act(() => {
    pendingCallbacks.forEach((callback) => { if (typeof callback === 'function') callback(); });
    jest.advanceTimersByTime(10000);
  });
  expect(connection.getSnapshot()).toBe(invalidated);
  expect(jest.getTimerCount()).toBe(0);
});

test('revoked access cannot revive a disposed session when the same account becomes verified again', () => {
  const { result, connection } = mountRehearsal();
  const oldRun = result.current.run;
  act(() => oldRun((current) => current.actions.toggle()));
  act(() => { useHomeStore.setState({ membershipReady: false }); });
  act(() => { useHomeStore.setState({ membershipReady: true }); });
  const cancelled = connection.getSnapshot();
  act(() => {
    oldRun((current) => current.actions.toggle());
    jest.advanceTimersByTime(10000);
  });
  expect(connection.getSnapshot()).toBe(cancelled);
  expect(connection.getSnapshot().model.on).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
});

test('background cancels acknowledgement and sample delivery; foreground waits for new intent', () => {
  const { result, connection } = mountRehearsal();
  const oldRun = result.current.run;
  act(() => oldRun((current) => current.actions.toggle()));
  act(() => jest.advanceTimersByTime(200));
  expect(result.current.snapshot.phase).toBe('awaiting');
  changeAppState('background');
  expect(result.current.snapshot).toMatchObject({ active: false, canControl: false, phase: 'interrupted', model: { on: null, previewBrightness: 0 } });
  act(() => {
    oldRun((current) => current.actions.toggle());
    jest.advanceTimersByTime(10000);
  });
  expect(jest.getTimerCount()).toBe(0);
  changeAppState('active');
  act(() => jest.advanceTimersByTime(10000));
  expect(result.current.snapshot).toMatchObject({ active: true, canControl: true, phase: 'idle', model: { on: false, brightness: 50 } });
  act(() => result.current.run((current) => current.actions.toggle()));
  act(() => jest.advanceTimersByTime(1000));
  expect(connection.getSnapshot()).toMatchObject({ phase: 'confirmed', model: { on: true, previewBrightness: 50 } });
});

test('mounting in the background never queues work until the application is active', () => {
  AppState.currentState = 'background';
  const { result } = mountRehearsal();
  expect(result.current.snapshot).toMatchObject({ active: false, canControl: false, model: { on: null } });
  act(() => result.current.run((current) => current.actions.toggle()));
  expect(jest.getTimerCount()).toBe(0);
  changeAppState('active');
  expect(result.current.snapshot).toMatchObject({ active: true, phase: 'idle', model: { on: false } });
});

test('a retained navigation screen pauses on blur and never replays its pending command on focus', () => {
  let focused = true;
  const listeners = new Map<string, () => void>();
  const navigation = {
    isFocused: () => focused,
    addListener: (event: string, listener: () => void) => {
      listeners.set(event, listener);
      return () => { listeners.delete(event); };
    },
  } as React.ContextType<typeof NavigationContext>;
  const identity = lightingPreparationIdentity(useHomeStore.getState());
  const wrapper = ({ children }: React.PropsWithChildren) => <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>;
  const { result, unmount } = renderHook(() => useLightingConnectionRehearsal(identity), { wrapper });
  act(() => result.current.run((current) => current.actions.toggle()));
  act(() => { focused = false; listeners.get('blur')?.(); });
  expect(result.current.snapshot).toMatchObject({ active: false, canControl: false, phase: 'interrupted' });
  expect(jest.getTimerCount()).toBe(0);
  act(() => { focused = true; listeners.get('focus')?.(); jest.advanceTimersByTime(10000); });
  expect(result.current.snapshot).toMatchObject({ active: true, phase: 'idle', model: { on: false } });
  unmount();
  expect(listeners.size).toBe(0);
});

test('web visibility also cancels pending work and removes its listener on unmount', () => {
  const listeners = new Set<() => void>();
  const page = {
    hidden: false,
    addEventListener: jest.fn((_event: string, listener: () => void) => { listeners.add(listener); }),
    removeEventListener: jest.fn((_event: string, listener: () => void) => { listeners.delete(listener); }),
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: page });
  const { result, unmount } = mountRehearsal();
  act(() => result.current.run((current) => current.actions.toggle()));
  act(() => { page.hidden = true; listeners.forEach((listener) => listener()); });
  expect(result.current.snapshot.active).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
  act(() => { page.hidden = false; listeners.forEach((listener) => listener()); });
  act(() => jest.advanceTimersByTime(10000));
  expect(result.current.snapshot.model.on).toBe(false);
  unmount();
  expect(listeners.size).toBe(0);
});

test('unmount cancels commands and subscriptions, and held command callbacks cannot replay', () => {
  const { result, connection, unmount } = mountRehearsal();
  const oldRun = result.current.run;
  act(() => oldRun((current) => current.actions.toggle()));
  unmount();
  const cancelled = connection.getSnapshot();
  expect(cancelled).toMatchObject({ active: false, canControl: false, phase: 'interrupted' });
  expect(appListeners.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
  act(() => {
    oldRun((current) => current.actions.toggle());
    jest.advanceTimersByTime(10000);
  });
  expect(connection.getSnapshot()).toBe(cancelled);
  const fresh = mountRehearsal();
  expect(fresh.connection).not.toBe(connection);
  expect(fresh.result.current.snapshot).toMatchObject({ phase: 'idle', model: { on: false, brightness: 50 } });
});

test('StrictMode lifecycle leaves exactly one live subscription and a working sample command', () => {
  const { result, unmount } = mountRehearsal(true);
  expect(appListeners.size).toBe(1);
  expect(result.current.snapshot.canControl).toBe(true);
  act(() => result.current.run((current) => current.actions.toggle()));
  act(() => jest.advanceTimersByTime(1000));
  expect(result.current.snapshot).toMatchObject({ phase: 'confirmed', model: { on: true } });
  unmount();
  expect(appListeners.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('commands and scenario changes never write household devices, scenes or shared simulation state', () => {
  const initial = useHomeStore.getState();
  const simulation = simulationPersistence.getSnapshot('demo');
  const save = jest.spyOn(simulationPersistence, 'save');
  const homeNotifications = jest.fn();
  const unsubscribe = useHomeStore.subscribe(homeNotifications);
  const { result } = mountRehearsal();
  act(() => result.current.run((current) => current.setProfile('color')));
  act(() => result.current.run((current) => current.actions.setColor('#B69CFF')));
  act(() => jest.advanceTimersByTime(1000));
  act(() => result.current.run((current) => current.actions.toggle()));
  act(() => jest.advanceTimersByTime(1000));
  act(() => result.current.run((current) => current.setScenario('offline')));
  act(() => result.current.run((current) => current.setScenario('stale')));
  expect(useHomeStore.getState()).toBe(initial);
  expect(useHomeStore.getState().devices).toBe(initial.devices);
  expect(useHomeStore.getState().scenes).toBe(initial.scenes);
  expect(homeNotifications).not.toHaveBeenCalled();
  expect(simulationPersistence.getSnapshot('demo')).toBe(simulation);
  expect(save).not.toHaveBeenCalled();
  unsubscribe();
});
