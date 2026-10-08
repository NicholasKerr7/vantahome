import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { PROPERTY_LOCATION, type WeatherLocation } from '../../../packages/home-scene/src/environment/types';
import { runtimePolicy } from '../../config/runtimeMode';
import { hasCurrentMembershipAccess } from '../../security/guestAccess';
import { canManageHomeWeather, readHomeWeatherSettings, subscribeHomeWeatherSettings } from '../../services/homeWeather';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';

const ACCESS_REQUIRED = 'Refresh your home access to load property weather.';
const LOAD_FAILED = 'Property weather settings could not be loaded. Try again.';
const SETTINGS_REFRESH_MS = 60_000;

interface SettingsSnapshot {
  scopeKey: string;
  location: WeatherLocation | null;
  configured: boolean;
  loading: boolean;
  error: string | null;
}

export interface HomeWeatherSettingsState extends Omit<SettingsSnapshot, 'scopeKey'> {
  canManage: boolean;
  reload: () => void;
}

/** Coordinates belong to a verified account, home and session, including membership role/expiry changes. */
function weatherScopeKey(state: HomeState): string {
  const member = state.household.find((candidate) => candidate.id === state.activeMemberId);
  return JSON.stringify([state.authenticatedUserId, state.accountUserId, state.activeHomeId,
    state.accountHomeId, state.sessionEpoch, state.membershipReady, state.activeMemberId,
    member?.id, member?.role, member?.accessExpiresAt, state.realtime.enabled, state.realtime.useMqtt]);
}

/** Only the explicit unauthenticated demo may choose town weather without checking shared settings. */
function isLocalWeatherDemo(state: HomeState): boolean {
  return runtimePolicy.allowUnauthenticatedDemo && !state.authenticatedUserId && !state.accountUserId
    && !state.activeHomeId && !state.accountHomeId && !state.realtime.enabled && !state.realtime.useMqtt;
}

/** Apply current membership rules without borrowing room/device grants or stale account identities. */
function canReadWeatherSettings(state: HomeState): boolean {
  const member = state.household.find((candidate) => candidate.id === state.activeMemberId);
  return state.membershipReady && Boolean(state.authenticatedUserId && state.activeHomeId)
    && state.authenticatedUserId === state.accountUserId && state.activeHomeId === state.accountHomeId
    && member?.id === state.authenticatedUserId && hasCurrentMembershipAccess(member);
}

/** Resolve shared property coordinates independently of home verification and fail closed across identity changes. */
export function useHomeWeatherSettings(): HomeWeatherSettingsState {
  const scopeKey = useHomeStore(weatherScopeKey);
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [attempt, setAttempt] = useState(0);
  const state = useHomeStore.getState();
  const demo = isLocalWeatherDemo(state);
  const eligible = canReadWeatherSettings(state);

  /** A retry restarts the scoped effect, invalidating any older response before it can publish. */
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (demo || !eligible) return;
    // React Native may expose window/document globals without the browser event API.
    const page = typeof document !== 'undefined' && typeof document.addEventListener === 'function'
      && typeof document.removeEventListener === 'function' ? document : undefined;
    const browser = typeof window !== 'undefined' && typeof window.addEventListener === 'function'
      && typeof window.removeEventListener === 'function' ? window : undefined;
    let appActive = AppState.currentState === 'active';
    let disposed = false;
    let generation = 0;
    let inFlight = false;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setInterval> | undefined;

    /** Check current store state again because effects may settle after sign-out, expiry or another login. */
    function scopeIsCurrent(): boolean {
      const current = useHomeStore.getState();
      return !disposed && weatherScopeKey(current) === scopeKey && canReadWeatherSettings(current);
    }

    /** Background work must not publish a new location while the app is inactive. */
    function isVisible(): boolean {
      return appActive && !page?.hidden;
    }

    /** End access at the exact Guest deadline rather than waiting for an unrelated store update. */
    function scheduleExpiry(): void {
      clearTimeout(expiryTimer);
      if (!isVisible() || !scopeIsCurrent()) return;
      const current = useHomeStore.getState();
      const member = current.household.find((candidate) => candidate.id === current.activeMemberId);
      if (member?.role !== 'Guest' || !member.accessExpiresAt) return;
      const remaining = Date.parse(member.accessExpiresAt) - Date.now();
      expiryTimer = setTimeout(() => {
        if (!scopeIsCurrent()) {
          generation += 1;
          inFlight = false;
          setSnapshot({ scopeKey, location: null, configured: false, loading: false, error: ACCESS_REQUIRED });
        } else scheduleExpiry();
      }, Math.max(1, Math.min(remaining, 2_147_483_647)));
    }

    /** Read only while visible and current; a service edit supersedes an older in-flight settings read. */
    async function load(force = false): Promise<void> {
      if (!isVisible() || !scopeIsCurrent() || (inFlight && !force)) return;
      const requestGeneration = ++generation;
      inFlight = true;
      setSnapshot((previous) => previous?.scopeKey === scopeKey && previous.location && !previous.error
        ? previous : { scopeKey, location: null, configured: false, loading: true, error: null });
      try {
        const settings = await readHomeWeatherSettings();
        if (!scopeIsCurrent() || !isVisible() || generation !== requestGeneration) return;
        const location = settings?.location ?? PROPERTY_LOCATION;
        const configured = settings !== null;
        setSnapshot((previous) => {
          const sameLocation = previous?.scopeKey === scopeKey && previous.configured === configured
            && previous.location?.name === location.name && previous.location.latitude === location.latitude
            && previous.location.longitude === location.longitude && previous.location.timeZone === location.timeZone;
          if (sameLocation && !previous.loading && !previous.error) return previous;
          return { scopeKey, location: sameLocation ? previous.location : location, configured, loading: false, error: null };
        });
      } catch (error: unknown) {
        if (!scopeIsCurrent() || !isVisible() || generation !== requestGeneration) return;
        setSnapshot({ scopeKey, location: null, configured: false, loading: false,
          error: error instanceof Error ? error.message : LOAD_FAILED });
      } finally {
        if (generation === requestGeneration) inFlight = false;
      }
    }

    /** Return from native or browser background requires a fresh shared-settings read. */
    function syncVisibility(): void {
      clearTimeout(expiryTimer);
      if (!isVisible()) {
        clearInterval(refreshTimer);
        refreshTimer = undefined;
        generation += 1;
        inFlight = false;
        return;
      }
      if (!scopeIsCurrent()) {
        setSnapshot({ scopeKey, location: null, configured: false, loading: false, error: ACCESS_REQUIRED });
        return;
      }
      scheduleExpiry();
      void load();
      // Revalidate shared settings without discarding a same-scope verified location while the read is pending.
      if (refreshTimer === undefined) refreshTimer = setInterval(() => { void load(); }, SETTINGS_REFRESH_MS);
    }

    const appSubscription = AppState.addEventListener('change', (next) => {
      appActive = next === 'active';
      syncVisibility();
    });
    const unsubscribeSettings = subscribeHomeWeatherSettings(() => { void load(true); });
    browser?.addEventListener('focus', syncVisibility);
    page?.addEventListener('visibilitychange', syncVisibility);
    syncVisibility();
    return () => {
      disposed = true;
      generation += 1;
      clearTimeout(expiryTimer);
      clearInterval(refreshTimer);
      appSubscription.remove();
      unsubscribeSettings();
      browser?.removeEventListener('focus', syncVisibility);
      page?.removeEventListener('visibilitychange', syncVisibility);
    };
  }, [scopeKey, demo, eligible, attempt]);

  if (demo) return { location: PROPERTY_LOCATION, configured: false, loading: false, error: null, canManage: false, reload };
  if (!eligible) return { location: null, configured: false, loading: false, error: ACCESS_REQUIRED, canManage: false, reload };
  // Render filtering removes the previous identity before passive cleanup gets a chance to run.
  const visible = snapshot?.scopeKey === scopeKey ? snapshot : null;
  return { location: visible?.location ?? null, configured: visible?.configured ?? false,
    loading: visible?.loading ?? true, error: visible?.error ?? null, canManage: canManageHomeWeather(state), reload };
}
