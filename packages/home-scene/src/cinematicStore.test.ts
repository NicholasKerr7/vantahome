// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CINEMATIC_PREFERENCE_KEY, readCinematicPreference, useCinematicStore } from './cinematicStore';
import { useHomeStore } from './state';

beforeEach(() => {
  localStorage.clear();
  useCinematicStore.setState({ idleEnabled: true, preferenceError: false, showcase: false, canRecenter: false, chapter: 'Arrival', resetViewVersion: 0 });
});
afterEach(() => vi.restoreAllMocks());

describe('separate cinematic preference', () => {
  it('defaults on, retains an explicit opt-out, and rejects malformed versioned settings', () => {
    expect(readCinematicPreference()).toEqual({ idleEnabled: true, preferenceError: false });
    localStorage.setItem(CINEMATIC_PREFERENCE_KEY, JSON.stringify({ version: 1, idleEnabled: false }));
    expect(readCinematicPreference()).toEqual({ idleEnabled: false, preferenceError: false });
    localStorage.setItem(CINEMATIC_PREFERENCE_KEY, JSON.stringify({ version: 2, idleEnabled: true }));
    expect(readCinematicPreference()).toEqual({ idleEnabled: false, preferenceError: true });
    localStorage.setItem(CINEMATIC_PREFERENCE_KEY, '{');
    expect(readCinematicPreference()).toEqual({ idleEnabled: false, preferenceError: true });
  });

  it('never persists playback or mutates saved rooms, camera view, devices or access', () => {
    const before = useHomeStore.getState();
    const cinematic = useCinematicStore.getState();
    cinematic.setShowcase(true);
    cinematic.setChapter('Along the garden');
    cinematic.setCanRecenter(true);
    cinematic.setIdleEnabled(false);
    expect(useCinematicStore.getState().showcase).toBe(false);
    expect(JSON.parse(localStorage.getItem(CINEMATIC_PREFERENCE_KEY)!)).toEqual({ version: 1, idleEnabled: false });
    cinematic.resetView();
    expect(useCinematicStore.getState().resetViewVersion).toBe(1);
    expect(useCinematicStore.getState().canRecenter).toBe(false);
    expect(useHomeStore.getState()).toBe(before);
  });

  it('keeps opt-out effective for this session and reports unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('unavailable'); });
    expect(readCinematicPreference()).toEqual({ idleEnabled: false, preferenceError: true });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    useCinematicStore.getState().setShowcase(true);
    useCinematicStore.getState().setIdleEnabled(false);
    expect(useCinematicStore.getState()).toMatchObject({ idleEnabled: false, showcase: false, preferenceError: true });
  });
});


describe('transient recenter visibility', () => {
  it('publishes only boolean transitions and clears synchronously on reset without persistence', () => {
    const listener = vi.fn();
    const unsubscribe = useCinematicStore.subscribe(listener);
    const store = useCinematicStore.getState();
    store.setCanRecenter(false);
    store.setCanRecenter(true);
    store.setCanRecenter(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(CINEMATIC_PREFERENCE_KEY)).toBeNull();
    store.resetView();
    expect(useCinematicStore.getState().canRecenter).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
