import { create } from 'zustand';

export const CINEMATIC_PREFERENCE_KEY = 'vantahome.cinematic-preferences.v1';

interface CinematicState {
  showcase: boolean;
  chapter: string;
  idleEnabled: boolean;
  preferenceError: boolean;
  resetViewVersion: number;
  setShowcase: (value: boolean) => void;
  setChapter: (chapter: string) => void;
  setIdleEnabled: (value: boolean) => void;
  resetView: () => void;
}

/** Read only this device's motion preference; malformed/unavailable storage conservatively leaves idle motion off. */
export function readCinematicPreference(): Pick<CinematicState, 'idleEnabled' | 'preferenceError'> {
  if (typeof window === 'undefined') return { idleEnabled: true, preferenceError: false };
  try {
    const raw = window.localStorage.getItem(CINEMATIC_PREFERENCE_KEY);
    if (raw === null) return { idleEnabled: true, preferenceError: false };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !('version' in parsed) || parsed.version !== 1 || !('idleEnabled' in parsed) || typeof parsed.idleEnabled !== 'boolean') throw new Error('Invalid cinematic preference');
    return { idleEnabled: parsed.idleEnabled, preferenceError: false };
  } catch {
    return { idleEnabled: false, preferenceError: true };
  }
}

/** Keep playback and shot titles transient, with only a separate local motion preference persisted. */
export const useCinematicStore = create<CinematicState>((set, get) => ({
  ...readCinematicPreference(),
  showcase: false,
  chapter: 'A place to come home to',
  resetViewVersion: 0,
  /** Eligibility belongs to the idle controller; repeated activity must not publish redundant React updates. */
  setShowcase(value) {
    if (get().showcase !== value) set({ showcase: value });
  },
  /** The camera publishes a chapter only when its authored shot changes, never on every frame. */
  setChapter(chapter) {
    if (get().chapter !== chapter) set({ chapter });
  },
  /** Persist no navigation or device state, and explain a failed preference save in Settings. */
  setIdleEnabled(value) {
    let preferenceError = false;
    try { window.localStorage.setItem(CINEMATIC_PREFERENCE_KEY, JSON.stringify({ version: 1, idleEnabled: value })); }
    catch { preferenceError = true; }
    set({ idleEnabled: value, preferenceError, ...(!value ? { showcase: false } : {}) });
  },
  /** Preserve the existing camera reset contract for renderer compatibility, without a dashboard button. */
  resetView() {
    set((state) => ({ showcase: false, resetViewVersion: state.resetViewVersion + 1 }));
  },
}));
