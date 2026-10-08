import type { WeatherLocation } from '../../packages/home-scene/src/environment/types';
import { isWeatherLocation } from '../../packages/home-scene/src/environment/weatherLocation';
import { useHomeStore, type HomeState } from '../store/useHomeStore';
import { supabase } from './supabaseClient';

export type HomeWeatherSettings = { location: WeatherLocation; updatedAt: string };

const OWNER_REQUIRED = 'Sign in as the home owner to change the weather location.';
const MEMBER_REQUIRED = 'Refresh your home access before loading its weather location.';
const LOCATION_COLUMNS = 'home_id,name,latitude,longitude,time_zone,updated_at,provider_consent_at';
const settingsListeners = new Set<() => void>();

/** Let the trusted host refresh after a verified local edit without storing private coordinates twice. */
export function subscribeHomeWeatherSettings(listener: () => void): () => void {
  settingsListeners.add(listener);
  return () => { settingsListeners.delete(listener); };
}

/** Publish only after a successful write still belongs to the current verified account and home. */
function publishSettingsChange(): void {
  settingsListeners.forEach((listener) => listener());
}

/** Require one verified, unexpired home identity without borrowing device or room permissions. */
function requireWeatherScope(scope: HomeState, ownerOnly = false): void {
  const actor = scope.household.find((member) => member.id === scope.activeMemberId);
  const expiry = actor?.accessExpiresAt == null ? Infinity : Date.parse(actor.accessExpiresAt);
  if (!scope.membershipReady || !scope.authenticatedUserId || !scope.activeHomeId
    || scope.accountUserId !== scope.authenticatedUserId || scope.accountHomeId !== scope.activeHomeId
    || actor?.id !== scope.authenticatedUserId || !(expiry > Date.now())
    || (ownerOnly && actor.role !== 'Owner')) {
    throw new Error(ownerOnly ? OWNER_REQUIRED : MEMBER_REQUIRED);
  }
}

/** Expose presentation eligibility; canonical home ownership remains enforced by the database RPC. */
export function canManageHomeWeather(scope: HomeState): boolean {
  try { requireWeatherScope(scope, true); return true; }
  catch { return false; }
}

/** Never deliver a previous home's location after sign-out, membership loss, or account switching. */
function requireUnchangedScope(expected: HomeState, ownerOnly = false): void {
  const current = useHomeStore.getState();
  if (current.sessionEpoch !== expected.sessionEpoch
    || current.authenticatedUserId !== expected.authenticatedUserId
    || current.accountUserId !== expected.accountUserId
    || current.activeHomeId !== expected.activeHomeId
    || current.accountHomeId !== expected.accountHomeId) {
    throw new Error('Your home changed. Reopen property weather.');
  }
  requireWeatherScope(current, ownerOnly);
}

/** Keep provider coordinates finite and require a real timezone and short, display-safe location name. */
function normalizeLocation(value: WeatherLocation): WeatherLocation {
  if (!isWeatherLocation(value) || /[\u0000-\u001f\u007f]/.test(value.name)) {
    throw new Error('Choose valid coordinates, a location name, and a time zone.');
  }
  return { name: value.name.trim(), latitude: value.latitude, longitude: value.longitude, timeZone: value.timeZone };
}

/** Validate server-owned scope and consent before accepting a saved property location. */
function parseSettings(value: unknown, expectedHomeId: string): HomeWeatherSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Property weather settings could not be verified.');
  const row = value as Record<string, unknown>;
  const location = { name: row.name, latitude: row.latitude, longitude: row.longitude, timeZone: row.time_zone };
  if (row.home_id !== expectedHomeId || !isWeatherLocation(location)
    || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))
    || typeof row.provider_consent_at !== 'string' || !Number.isFinite(Date.parse(row.provider_consent_at))) {
    throw new Error('Property weather settings could not be verified.');
  }
  return { location: normalizeLocation(location), updatedAt: row.updated_at };
}

/** Recheck the authenticated API identity without exposing credentials to the scene or settings. */
async function verifiedClient(scope: HomeState, ownerOnly = false) {
  requireWeatherScope(scope, ownerOnly);
  if (!supabase) throw new Error('Property weather settings are unavailable.');
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error('Your account could not be verified. Try again.');
  if (data.user?.id !== scope.authenticatedUserId) throw new Error('Your account changed. Sign in again.');
  requireUnchangedScope(scope, ownerOnly);
  return supabase;
}

/** Read shared configuration independently of membership loading; no row means the explicit town fallback. */
export async function readHomeWeatherSettings(): Promise<HomeWeatherSettings | null> {
  const scope = useHomeStore.getState();
  const client = await verifiedClient(scope);
  const { data, error } = await client.from('home_weather_settings').select(LOCATION_COLUMNS)
    .eq('home_id', scope.activeHomeId!).maybeSingle();
  requireUnchangedScope(scope);
  if (error) throw new Error('Property weather settings could not be loaded. Try again.');
  return data === null ? null : parseSettings(data, scope.activeHomeId!);
}

/** Save the Owner's explicit provider-location consent, returning only a verified server result. */
export async function saveHomeWeatherSettings(location: WeatherLocation): Promise<HomeWeatherSettings> {
  const scope = useHomeStore.getState();
  requireWeatherScope(scope, true);
  const normalized = normalizeLocation(location);
  const client = await verifiedClient(scope, true);
  const { data, error } = await client.rpc('set_home_weather_settings', {
    target_home_id: scope.activeHomeId,
    location_name: normalized.name,
    property_latitude: normalized.latitude,
    property_longitude: normalized.longitude,
    property_time_zone: normalized.timeZone,
    provider_location_consent: true,
  });
  requireUnchangedScope(scope, true);
  if (error) throw new Error('The weather location could not be saved. Check your owner access and try again.');
  const settings = parseSettings(data, scope.activeHomeId!);
  publishSettingsChange();
  return settings;
}

/** Remove provider-coordinate consent and return this home to its public town fallback. */
export async function resetHomeWeatherSettings(): Promise<void> {
  const scope = useHomeStore.getState();
  const client = await verifiedClient(scope, true);
  const { error } = await client.rpc('reset_home_weather_settings', { target_home_id: scope.activeHomeId });
  requireUnchangedScope(scope, true);
  if (error) throw new Error('The town weather location could not be restored. Try again.');
  publishSettingsChange();
}
