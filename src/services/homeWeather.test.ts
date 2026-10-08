import { useHomeStore, type HomeState, type HouseholdMember } from '../store/useHomeStore';
import type { WeatherLocation } from '../../packages/home-scene/src/environment/types';
import { canManageHomeWeather, readHomeWeatherSettings, resetHomeWeatherSettings, saveHomeWeatherSettings, subscribeHomeWeatherSettings } from './homeWeather';

const mockRpc = jest.fn();
const mockGetUser = jest.fn();
const mockRead = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
let mockClientAvailable = true;

jest.mock('./supabaseClient', () => ({
  get supabase() {
    return mockClientAvailable ? {
      rpc: (...args: unknown[]) => mockRpc(...args), auth: { getUser: () => mockGetUser() },
      from: (table: string) => ({ select: (columns: string) => {
        mockSelect(table, columns);
        return { eq: (key: string, value: string) => {
          mockEq(key, value);
          return { maybeSingle: () => mockRead() };
        } };
      } }),
    } : null;
  },
}));

const seed = useHomeStore.getState();
const owner: HouseholdMember = { id: 'owner', userId: 'owner', name: 'Owner', role: 'Owner', status: 'home' };
const location: WeatherLocation = { name: 'Property', latitude: 18.45, longitude: -78.01, timeZone: 'America/Jamaica' };
const row = { home_id: 'home', name: 'Property', latitude: 18.45, longitude: -78.01,
  time_zone: 'America/Jamaica', updated_at: '2026-10-08T15:00:00Z', provider_consent_at: '2026-10-08T15:00:00Z' };

beforeEach(() => {
  jest.resetAllMocks();
  mockClientAvailable = true;
  useHomeStore.setState({ ...seed, authenticatedUserId: 'owner', accountUserId: 'owner', activeMemberId: 'owner',
    accountHomeId: 'home', activeHomeId: 'home', sessionEpoch: 7, membershipReady: true, household: [owner],
    rooms: [{ id: 'private-room', name: 'Private room' }],
    devices: [{ id: 'private-device', name: 'Private light', kind: 'light', roomId: 'private-room', isOn: false }],
    roomMembers: [{ memberId: 'guest', roomIds: [] }], memberPermissionOverrides: [{ memberId: 'guest', permission: 'light.control', allowed: false }],
  });
  mockGetUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  mockRpc.mockResolvedValue({ data: row, error: null });
  mockRead.mockResolvedValue({ data: row, error: null });
});

afterEach(() => { mockClientAvailable = true; useHomeStore.setState(seed); });

test.each(['Admin', 'Member', 'Guest', 'Tenant'] as const)('permits %s reads but rejects writes without widening device access', async (role) => {
  useHomeStore.setState({ household: [{ ...owner, role }] });
  const before = useHomeStore.getState();
  expect(canManageHomeWeather(before)).toBe(false);
  await expect(readHomeWeatherSettings()).resolves.toEqual({ location, updatedAt: row.updated_at });
  await expect(saveHomeWeatherSettings(location)).rejects.toThrow('home owner');
  await expect(resetHomeWeatherSettings()).rejects.toThrow('home owner');
  expect(mockRpc).not.toHaveBeenCalled();
  expect(useHomeStore.getState()).toBe(before);
});

test.each<Partial<HomeState>>([
  { membershipReady: false }, { authenticatedUserId: null }, { accountUserId: 'other' },
  { accountHomeId: 'other-home' }, { activeHomeId: null }, { activeMemberId: 'guest' },
])('rejects inconsistent membership before all network work: %j', async (patch) => {
  useHomeStore.setState(patch);
  expect(canManageHomeWeather(useHomeStore.getState())).toBe(false);
  await expect(readHomeWeatherSettings()).rejects.toThrow('home access');
  await expect(saveHomeWeatherSettings(location)).rejects.toThrow('home owner');
  await expect(resetHomeWeatherSettings()).rejects.toThrow('home owner');
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRead).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each(['2000-01-01T00:00:00Z', 'invalid'])('rejects a Guest whose access deadline is %s', async (accessExpiresAt) => {
  useHomeStore.setState({ household: [{ ...owner, role: 'Guest', accessExpiresAt }] });
  await expect(readHomeWeatherSettings()).rejects.toThrow('home access');
  expect(mockGetUser).not.toHaveBeenCalled();
});

test('an absent configured row explicitly returns null without inventing property coordinates', async () => {
  mockRead.mockResolvedValue({ data: null, error: null });
  await expect(readHomeWeatherSettings()).resolves.toBeNull();
  expect(mockSelect).toHaveBeenCalledWith('home_weather_settings', expect.stringContaining('provider_consent_at'));
  expect(mockEq).toHaveBeenCalledWith('home_id', 'home');
});

test('a failed settings read cannot masquerade as the town fallback or change membership', async () => {
  const before = useHomeStore.getState();
  mockRead.mockResolvedValue({ data: null, error: { message: 'private details' } });
  await expect(readHomeWeatherSettings()).rejects.toThrow('could not be loaded');
  expect(useHomeStore.getState()).toBe(before);
});

test.each([
  { home_id: 'other-home' }, { latitude: NaN }, { longitude: 181 }, { time_zone: 'Wrong/Zone' },
  { name: '   ' }, { name: 'Unsafe\nname' }, { updated_at: 'invalid' }, { provider_consent_at: null },
])('rejects an unverified property row: %j', async (patch) => {
  mockRead.mockResolvedValue({ data: { ...row, ...patch }, error: null });
  await expect(readHomeWeatherSettings()).rejects.toThrow();
});

test.each([
  { latitude: Infinity }, { latitude: -91 }, { longitude: NaN }, { longitude: 181 },
  { name: '' }, { name: 'a'.repeat(121) }, { name: 'Unsafe\nname' }, { timeZone: 'Wrong/Zone' },
])('validates the edited location before authenticated networking: %j', async (patch) => {
  await expect(saveHomeWeatherSettings({ ...location, ...patch })).rejects.toThrow('valid coordinates');
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('an Owner save explicitly confirms provider consent and publishes one verified change', async () => {
  const before = useHomeStore.getState();
  const changed = jest.fn();
  const unsubscribe = subscribeHomeWeatherSettings(changed);
  try {
    expect(canManageHomeWeather(before)).toBe(true);
    await expect(saveHomeWeatherSettings({ ...location, name: ' Property ' })).resolves.toEqual({ location, updatedAt: row.updated_at });
    expect(mockRpc).toHaveBeenCalledWith('set_home_weather_settings', {
      target_home_id: 'home', location_name: 'Property', property_latitude: 18.45,
      property_longitude: -78.01, property_time_zone: 'America/Jamaica', provider_location_consent: true,
    });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(useHomeStore.getState()).toBe(before);
  } finally { unsubscribe(); }
});

test('an Owner reset removes only weather configuration and notifies active subscribers', async () => {
  const before = useHomeStore.getState();
  const changed = jest.fn();
  const unsubscribed = jest.fn();
  const unsubscribe = subscribeHomeWeatherSettings(changed);
  subscribeHomeWeatherSettings(unsubscribed)();
  try {
    await expect(resetHomeWeatherSettings()).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('reset_home_weather_settings', { target_home_id: 'home' });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(unsubscribed).not.toHaveBeenCalled();
    expect(useHomeStore.getState()).toBe(before);
  } finally { unsubscribe(); }
});

test.each(['save', 'reset'] as const)('backend %s denial does not publish or mutate local permissions', async (operation) => {
  const before = useHomeStore.getState();
  const changed = jest.fn();
  const unsubscribe = subscribeHomeWeatherSettings(changed);
  mockRpc.mockResolvedValue({ data: null, error: { message: 'Denied' } });
  try {
    await expect(operation === 'save' ? saveHomeWeatherSettings(location) : resetHomeWeatherSettings()).rejects.toThrow();
    expect(changed).not.toHaveBeenCalled();
    expect(useHomeStore.getState()).toBe(before);
  } finally { unsubscribe(); }
});

test('an invalid save confirmation never publishes a successful change', async () => {
  const changed = jest.fn();
  const unsubscribe = subscribeHomeWeatherSettings(changed);
  mockRpc.mockResolvedValue({ data: { ...row, home_id: 'other-home' }, error: null });
  try {
    await expect(saveHomeWeatherSettings(location)).rejects.toThrow('could not be verified');
    expect(changed).not.toHaveBeenCalled();
  } finally { unsubscribe(); }
});

test.each(['read', 'save', 'reset'] as const)('checks the API identity before %s', async (operation) => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'other' } }, error: null });
  const work = operation === 'read' ? readHomeWeatherSettings() : operation === 'save' ? saveHomeWeatherSettings(location) : resetHomeWeatherSettings();
  await expect(work).rejects.toThrow('account changed');
  expect(mockRead).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each<Partial<HomeState>>([
  { sessionEpoch: 8 }, { activeHomeId: 'other-home' }, { authenticatedUserId: 'other' },
  { membershipReady: false }, { household: [{ ...owner, role: 'Admin' }] },
])('rechecks scope and Owner authority after identity verification: %j', async (patch) => {
  mockGetUser.mockImplementation(async () => { useHomeStore.setState(patch); return { data: { user: { id: 'owner' } }, error: null }; });
  await expect(saveHomeWeatherSettings(location)).rejects.toThrow();
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each(['read', 'save', 'reset'] as const)('discards %s completion after a home switch', async (operation) => {
  const changed = jest.fn();
  const unsubscribe = subscribeHomeWeatherSettings(changed);
  const completion = async () => {
    useHomeStore.setState({ activeHomeId: 'other-home', accountHomeId: 'other-home' });
    return { data: row, error: null };
  };
  mockRead.mockImplementation(completion);
  mockRpc.mockImplementation(completion);
  try {
    const work = operation === 'read' ? readHomeWeatherSettings() : operation === 'save' ? saveHomeWeatherSettings(location) : resetHomeWeatherSettings();
    await expect(work).rejects.toThrow('home changed');
    expect(changed).not.toHaveBeenCalled();
  } finally { unsubscribe(); }
});

test('unavailable cloud configuration cannot silently persist local coordinates', async () => {
  mockClientAvailable = false;
  await expect(saveHomeWeatherSettings(location)).rejects.toThrow('unavailable');
  expect(mockRpc).not.toHaveBeenCalled();
});
