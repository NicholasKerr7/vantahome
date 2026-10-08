import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { PROPERTY_LOCATION } from '../../../../packages/home-scene/src/environment/types';
import { runtimePolicy } from '../../../config/runtimeMode';
import { useHomeStore, type HomeState } from '../../../store/useHomeStore';
import type { HomeWeatherSettings } from '../../../services/homeWeather';
import { useHomeWeatherSettings } from '../useHomeWeatherSettings';

const mockRead = jest.fn();
const mockSettingsListeners = new Set<() => void>();
jest.mock('../../../services/homeWeather', () => ({
  ...jest.requireActual('../../../services/homeWeather'),
  readHomeWeatherSettings: () => mockRead(),
  subscribeHomeWeatherSettings: (listener: () => void) => {
    mockSettingsListeners.add(listener);
    return () => { mockSettingsListeners.delete(listener); };
  },
}));
jest.mock('../../../config/runtimeMode', () => ({
  ...jest.requireActual('../../../config/runtimeMode'),
  runtimePolicy: { mode: 'demo', allowUnauthenticatedDemo: true },
}));

const NOW = Date.parse('2026-10-08T12:00:00Z');
const seed = useHomeStore.getState();
const SETTINGS: HomeWeatherSettings = {
  location: { ...PROPERTY_LOCATION, name: 'Verified property', latitude: 18.455 }, updatedAt: new Date(NOW).toISOString(),
};
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalAppState = Object.getOwnPropertyDescriptor(AppState, 'currentState');
let changeAppState: (state: AppStateStatus) => void;
const removeAppListener = jest.fn();

class TestPage extends EventTarget { hidden = false; }

/** Create a deferred server read to exercise identity changes before the network settles. */
function deferredSettings() {
  let resolve: (settings: HomeWeatherSettings | null) => void = () => {};
  const promise = new Promise<HomeWeatherSettings | null>((finish) => { resolve = finish; });
  return { promise, resolve };
}

/** Flush the service promise and React publication without advancing refresh/Guest expiry timers. */
async function settle(): Promise<void> {
  await act(async () => { for (let index = 0; index < 4; index += 1) await Promise.resolve(); });
}

/** Keep test identities coherent unless a test intentionally invalidates one part of the scope. */
function verifiedScope(patch: Partial<HomeState> = {}): Partial<HomeState> {
  return { ...seed, authenticatedUserId: 'owner', accountUserId: 'owner', activeHomeId: 'home', accountHomeId: 'home',
    membershipReady: true, sessionEpoch: 4, activeMemberId: 'owner',
    household: [{ id: 'owner', name: 'Owner', role: 'Owner', status: 'home' }],
    realtime: { ...seed.realtime, enabled: false, useMqtt: false }, ...patch };
}

beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(NOW); jest.clearAllMocks();
  mockSettingsListeners.clear(); mockRead.mockReset().mockResolvedValue(SETTINGS);
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: undefined });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: undefined });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    changeAppState = listener;
    return { remove: removeAppListener };
  });
  useHomeStore.setState(verifiedScope());
});

afterEach(() => {
  useHomeStore.setState(seed, true);
  jest.useRealTimers(); jest.restoreAllMocks();
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  if (originalAppState) Object.defineProperty(AppState, 'currentState', originalAppState);
});

test('waits for verified server configuration and preserves stable coordinates across same-value polls', async () => {
  const pending = deferredSettings();
  mockRead.mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useHomeWeatherSettings());
  expect(result.current).toMatchObject({ location: null, configured: false, loading: true, canManage: true });
  await act(async () => pending.resolve(SETTINGS));
  const firstLocation = result.current.location;
  expect(result.current).toMatchObject({ location: SETTINGS.location, configured: true, loading: false, error: null });
  const next = deferredSettings();
  mockRead.mockReturnValueOnce(next.promise);
  act(() => jest.advanceTimersByTime(60_000));
  expect(result.current.location).toBe(firstLocation);
  expect(result.current.loading).toBe(false);
  await act(async () => next.resolve({ ...SETTINGS, location: { ...SETTINGS.location } }));
  expect(result.current.location).toBe(firstLocation);
});

test('only an explicit null server row selects the public town fallback', async () => {
  mockRead.mockResolvedValue(null);
  const { result } = renderHook(() => useHomeWeatherSettings());
  await settle();
  expect(result.current).toMatchObject({ location: PROPERTY_LOCATION, configured: false, loading: false, error: null });
});

test('supports native window/document globals without browser event methods', async () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {} });
  const { result, unmount } = renderHook(() => useHomeWeatherSettings());
  await settle();
  expect(result.current).toMatchObject({ location: SETTINGS.location, loading: false, canManage: true });
  act(() => changeAppState('background'));
  act(() => jest.advanceTimersByTime(120_000));
  expect(mockRead).toHaveBeenCalledTimes(1);
  unmount();
  expect(removeAppListener).toHaveBeenCalledTimes(1);
});

test('uses town weather without a network call only for a completely unauthenticated demo', () => {
  useHomeStore.setState({ authenticatedUserId: null, accountUserId: null, activeHomeId: null, accountHomeId: null });
  const { result } = renderHook(() => useHomeWeatherSettings());
  expect(result.current).toMatchObject({ location: PROPERTY_LOCATION, loading: false, configured: false, canManage: false });
  expect(mockRead).not.toHaveBeenCalled();
  act(() => result.current.reload());
  expect(mockRead).not.toHaveBeenCalled();
});

test('never enables a town demo fallback in an authenticated release mode', () => {
  jest.replaceProperty(runtimePolicy, 'allowUnauthenticatedDemo', false);
  useHomeStore.setState({ authenticatedUserId: null, accountUserId: null, activeHomeId: null, accountHomeId: null });
  const { result } = renderHook(() => useHomeWeatherSettings());
  expect(result.current.location).toBeNull();
  expect(result.current.canManage).toBe(false);
  expect(mockRead).not.toHaveBeenCalled();
});

test.each([
  { membershipReady: false }, { authenticatedUserId: null }, { accountUserId: 'another' },
  { activeHomeId: null }, { accountHomeId: 'another' }, { activeMemberId: 'another' },
  { household: [] }, { household: [{ id: 'owner', name: 'Guest', role: 'Guest', status: 'home', accessExpiresAt: new Date(NOW).toISOString() }] },
] as Partial<HomeState>[])('does not read a partially verified or expired account: %j', (patch) => {
  useHomeStore.setState(patch);
  const { result } = renderHook(() => useHomeWeatherSettings());
  expect(result.current.location).toBeNull();
  expect(result.current.canManage).toBe(false);
  expect(mockRead).not.toHaveBeenCalled();
});

test('lets a verified non-owner read shared configuration without exposing editing eligibility', async () => {
  useHomeStore.setState({ household: [{ id: 'owner', name: 'Member', role: 'Member', status: 'home' }] });
  const { result } = renderHook(() => useHomeWeatherSettings());
  await settle();
  expect(result.current.location).toEqual(SETTINGS.location);
  expect(result.current.canManage).toBe(false);
});

test('clears a verified location after refresh failure and retries without guessing town coordinates', async () => {
  const { result } = renderHook(() => useHomeWeatherSettings());
  await settle();
  mockRead.mockRejectedValueOnce(new Error('Settings unavailable'));
  act(() => jest.advanceTimersByTime(60_000));
  await settle();
  expect(result.current).toMatchObject({ location: null, configured: false, loading: false, error: 'Settings unavailable' });
  act(() => result.current.reload());
  await settle();
  expect(result.current).toMatchObject({ location: SETTINGS.location, configured: true, loading: false, error: null });
});

test.each([
  { authenticatedUserId: 'next', accountUserId: 'next', activeMemberId: 'next', household: [{ id: 'next', name: 'Next', role: 'Owner', status: 'home' }] },
  { activeHomeId: 'next-home', accountHomeId: 'next-home' },
  { sessionEpoch: 5 },
] as Partial<HomeState>[])('suppresses old coordinates immediately and rejects late responses after scope change: %j', async (patch) => {
  const { result } = renderHook(() => useHomeWeatherSettings());
  await settle();
  const oldRead = deferredSettings();
  mockRead.mockReturnValueOnce(oldRead.promise);
  act(() => result.current.reload());
  const nextRead = deferredSettings();
  mockRead.mockReturnValueOnce(nextRead.promise);
  act(() => { useHomeStore.setState(patch); });
  expect(result.current.location).toBeNull();
  expect(result.current.loading).toBe(true);
  await act(async () => oldRead.resolve(SETTINGS));
  expect(result.current.location).toBeNull();
  const nextSettings = { ...SETTINGS, location: { ...SETTINGS.location, name: 'Next property' } };
  await act(async () => nextRead.resolve(nextSettings));
  expect(result.current.location).toEqual(nextSettings.location);
});

test('suppresses settings immediately when membership is invalidated during a pending read', async () => {
  const pending = deferredSettings();
  mockRead.mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useHomeWeatherSettings());
  act(() => { useHomeStore.setState({ membershipReady: false }); });
  expect(result.current.location).toBeNull();
  await act(async () => pending.resolve(SETTINGS));
  expect(result.current.location).toBeNull();
  expect(result.current.canManage).toBe(false);
});

test('pauses polling and pending publication in the background and rechecks on native foreground', async () => {
  const pending = deferredSettings();
  mockRead.mockReturnValueOnce(pending.promise);
  const { result, unmount } = renderHook(() => useHomeWeatherSettings());
  act(() => changeAppState('background'));
  await act(async () => pending.resolve(SETTINGS));
  act(() => jest.advanceTimersByTime(180_000));
  expect(mockRead).toHaveBeenCalledTimes(1);
  expect(result.current.location).toBeNull();
  act(() => changeAppState('active'));
  await settle();
  expect(result.current.location).toEqual(SETTINGS.location);
  unmount();
  act(() => jest.advanceTimersByTime(120_000));
  expect(mockRead).toHaveBeenCalledTimes(2);
  expect(removeAppListener).toHaveBeenCalledTimes(1);
  expect(mockSettingsListeners.size).toBe(0);
});

test('waits while the browser page is hidden and refreshes on visibility, focus and a saved edit', async () => {
  const page = new TestPage(); page.hidden = true;
  const browser = new EventTarget();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: page });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
  const { result } = renderHook(() => useHomeWeatherSettings());
  expect(mockRead).not.toHaveBeenCalled();
  act(() => { page.hidden = false; page.dispatchEvent(new Event('visibilitychange')); });
  await settle();
  act(() => browser.dispatchEvent(new Event('focus')));
  await settle();
  const oldRead = deferredSettings();
  mockRead.mockReturnValueOnce(oldRead.promise);
  act(() => browser.dispatchEvent(new Event('focus')));
  const changed = { ...SETTINGS, location: { ...SETTINGS.location, latitude: 18.46 } };
  mockRead.mockResolvedValueOnce(changed);
  act(() => mockSettingsListeners.forEach((listener) => listener()));
  await settle();
  expect(result.current.location).toEqual(changed.location);
  await act(async () => oldRead.resolve(SETTINGS));
  expect(result.current.location).toEqual(changed.location);
});

test('ends Guest configuration visibility at the exact deadline without waiting for a store update', async () => {
  useHomeStore.setState({ household: [{ id: 'owner', name: 'Guest', role: 'Guest', status: 'home',
    accessExpiresAt: new Date(NOW + 12_000).toISOString() }] });
  const { result } = renderHook(() => useHomeWeatherSettings());
  await settle();
  expect(result.current.location).toEqual(SETTINGS.location);
  act(() => jest.advanceTimersByTime(12_000));
  expect(result.current).toMatchObject({ location: null, loading: false, canManage: false });
  act(() => jest.advanceTimersByTime(120_000));
  expect(mockRead).toHaveBeenCalledTimes(1);
});
