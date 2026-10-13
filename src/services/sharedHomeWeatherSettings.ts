import { PROPERTY_LOCATION } from '../../packages/home-scene/src/environment/types';
import { useHomeStore } from '../store/useHomeStore';
import { readHomeWeatherSettings, getHomeWeatherSettingsRevision, type HomeWeatherSettings } from './homeWeather';
import { canReadWeatherSettings, isLocalWeatherDemo, weatherScopeKey } from './homeWeatherScope';

const FRESH_MS = 60_000;
type CachedRead = {
  scope: string;
  revision: number;
  value?: HomeWeatherSettings | null;
  verifiedAt: number;
  pending?: Promise<HomeWeatherSettings | null>;
};
let cached: CachedRead | undefined;
const listeners = new Set<() => void>();

/** Publish changes to the routine clock without exposing property coordinates in its UI. */
function publish(): void { listeners.forEach((listener) => listener()); }

/** Discard old reads before a property edit triggers refreshed settings requests. */
export function invalidateSharedHomeWeatherSettings(): void {
  cached = undefined;
  publish();
}

/** Observe the single shared result; consumers still check their current account/home scope. */
export function subscribeSharedHomeWeatherSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Reuse recent verified settings and coalesce simultaneous scene/runtime reads without caching failures. */
export function readSharedHomeWeatherSettings(fresh = false): Promise<HomeWeatherSettings | null> {
  const state = useHomeStore.getState();
  if (!canReadWeatherSettings(state)) return Promise.reject(new Error('Refresh your home access to load property weather.'));
  const scope = weatherScopeKey(state);
  const revision = getHomeWeatherSettingsRevision();
  if (cached?.scope !== scope || cached.revision !== revision) cached = { scope, revision, verifiedAt: 0 };
  const record = cached;
  if (record.pending) return record.pending;
  if (!fresh && record.value !== undefined && Date.now() - record.verifiedAt < FRESH_MS) return Promise.resolve(record.value);
  // A brief membership loss must invalidate an old request even if the same identity returns before it settles.
  const unsubscribeScope = useHomeStore.subscribe((current) => {
    if (cached === record && (weatherScopeKey(current) !== scope || !canReadWeatherSettings(current))) {
      invalidateSharedHomeWeatherSettings();
    }
  });
  const pending = readHomeWeatherSettings().then((value) => {
    const current = useHomeStore.getState();
    if (cached !== record || record.revision !== getHomeWeatherSettingsRevision() || weatherScopeKey(current) !== scope || !canReadWeatherSettings(current)) {
      throw new Error('Your home changed. Reopen property weather.');
    }
    record.value = value;
    record.verifiedAt = Date.now();
    publish();
    return value;
  }).catch((error: unknown) => {
    if (cached === record) { record.value = undefined; publish(); }
    throw error;
  }).finally(() => {
    unsubscribeScope();
    if (record.pending === pending) record.pending = undefined;
  });
  record.pending = pending;
  return pending;
}

/** Return no timezone until verified; never substitute phone time or another home's cached timezone. */
export function getRoutineTimeZone(): string | null {
  const state = useHomeStore.getState();
  if (isLocalWeatherDemo(state)) return PROPERTY_LOCATION.timeZone;
  if (!canReadWeatherSettings(state) || cached?.scope !== weatherScopeKey(state) || cached.value === undefined
    || cached.revision !== getHomeWeatherSettingsRevision() || Date.now() - cached.verifiedAt >= FRESH_MS) return null;
  return cached.value?.location.timeZone ?? PROPERTY_LOCATION.timeZone;
}
