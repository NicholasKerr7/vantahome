import { useHomeStore } from '../store/useHomeStore';
import { PROPERTY_LOCATION } from '../../packages/home-scene/src/environment/types';
import { getRoutineTimeZone, invalidateSharedHomeWeatherSettings, readSharedHomeWeatherSettings } from './sharedHomeWeatherSettings';

const mockRead = jest.fn();
let mockRevision = 0;
jest.mock('./homeWeather', () => ({
  readHomeWeatherSettings: () => mockRead(),
  getHomeWeatherSettingsRevision: () => mockRevision,
}));
const seed = useHomeStore.getState();
const settings = { location: { ...PROPERTY_LOCATION, timeZone: 'Asia/Tokyo' }, updatedAt: '2026-10-13T12:00:00Z' };

/** Hold a settings response while testing a superseding edit or identity change. */
function deferred() {
  let resolve!: (value: typeof settings | null) => void;
  const promise = new Promise<typeof settings | null>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  invalidateSharedHomeWeatherSettings(); mockRevision = 0;
  mockRead.mockReset().mockResolvedValue(settings);
  useHomeStore.setState({ ...seed, accountUserId: 'owner', authenticatedUserId: 'owner', activeHomeId: 'home',
    accountHomeId: 'home', membershipReady: true, activeMemberId: 'owner', sessionEpoch: 1,
    household: [{ id: 'owner', role: 'Owner', name: 'Owner', status: 'home' }] });
});
afterEach(() => { invalidateSharedHomeWeatherSettings(); useHomeStore.setState(seed, true); jest.useRealTimers(); });

test('one shared request serves concurrent scene/runtime consumers and caches verified settings briefly', async () => {
  const pending = deferred(); mockRead.mockReturnValueOnce(pending.promise);
  const scene = readSharedHomeWeatherSettings(true);
  const routine = readSharedHomeWeatherSettings();
  expect(scene).toBe(routine);
  expect(getRoutineTimeZone()).toBeNull();
  pending.resolve(settings); await scene;
  expect(getRoutineTimeZone()).toBe('Asia/Tokyo');
  await readSharedHomeWeatherSettings();
  expect(mockRead).toHaveBeenCalledTimes(1);
});

test('a property edit supersedes older in-flight data for all consumers', async () => {
  const pending = deferred(); mockRead.mockReturnValueOnce(pending.promise);
  const oldRead = readSharedHomeWeatherSettings();
  const oldRejected = expect(oldRead).rejects.toThrow('home changed');
  mockRevision += 1;
  await readSharedHomeWeatherSettings();
  pending.resolve({ ...settings, location: PROPERTY_LOCATION });
  await oldRejected;
  expect(getRoutineTimeZone()).toBe('Asia/Tokyo');
});

test('unknown, failed and expired reads pause scheduling instead of choosing town or phone time', async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  expect(getRoutineTimeZone()).toBeNull();
  await readSharedHomeWeatherSettings();
  jest.advanceTimersByTime(60_000);
  expect(getRoutineTimeZone()).toBeNull();
  mockRead.mockRejectedValueOnce(new Error('Unavailable'));
  await expect(readSharedHomeWeatherSettings()).rejects.toThrow('Unavailable');
  expect(getRoutineTimeZone()).toBeNull();
  mockRead.mockResolvedValueOnce(null);
  await readSharedHomeWeatherSettings();
  expect(getRoutineTimeZone()).toBe(PROPERTY_LOCATION.timeZone);
});

test('a late old-account result cannot set or clear the next account timezone', async () => {
  const pending = deferred(); mockRead.mockReturnValueOnce(pending.promise);
  const oldRead = readSharedHomeWeatherSettings();
  const oldRejected = expect(oldRead).rejects.toThrow('home changed');
  useHomeStore.setState({ authenticatedUserId: 'next', accountUserId: 'next', activeMemberId: 'next', sessionEpoch: 2,
    household: [{ id: 'next', role: 'Owner', name: 'Next', status: 'home' }] });
  expect(getRoutineTimeZone()).toBeNull();
  await readSharedHomeWeatherSettings();
  pending.resolve({ ...settings, location: PROPERTY_LOCATION });
  await oldRejected;
  expect(getRoutineTimeZone()).toBe('Asia/Tokyo');
});

test('membership loss removes cached property time before another request', async () => {
  await readSharedHomeWeatherSettings();
  useHomeStore.setState({ membershipReady: false });
  expect(getRoutineTimeZone()).toBeNull();
  await expect(readSharedHomeWeatherSettings()).rejects.toThrow('home access');
  expect(mockRead).toHaveBeenCalledTimes(1);
});

test('a pre-background request remains invalid after the same membership is verified again', async () => {
  const pending = deferred(); mockRead.mockReturnValueOnce(pending.promise);
  const oldRead = readSharedHomeWeatherSettings();
  const oldRejected = expect(oldRead).rejects.toThrow('home changed');
  useHomeStore.setState({ membershipReady: false });
  useHomeStore.setState({ membershipReady: true });
  pending.resolve(settings);
  await oldRejected;
  expect(getRoutineTimeZone()).toBeNull();
  await readSharedHomeWeatherSettings();
  expect(mockRead).toHaveBeenCalledTimes(2);
});
