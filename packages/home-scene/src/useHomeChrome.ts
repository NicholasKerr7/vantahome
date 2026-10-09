import { useEffect, useMemo, useRef, useState } from 'react';
import { isEmbeddedScene } from './embeddedHost';
import type { LiveEnvironment } from './environment/types';
import { useCinematicStore } from './cinematicStore';
import { useHomeStore } from './state';
import { subscribeScenePresentation } from './scenePresentation';
import { isHomeChromePreferenceCommand, reportHomeChromeSnapshot, subscribeHomeChromeCommands, subscribeHomeChromePreferences, type HomeChromeSnapshot } from './homeChromeProtocol';

interface HomeChromeOptions {
  environment: LiveEnvironment;
  motionDisabled: boolean;
  systemReducedMotion: boolean;
  hostSuspended: boolean;
  ready: boolean;
  onOpenEnvironment: () => void;
  onOpenPreferences: () => void;
}

/** Share the existing environment and preferences with native chrome, without another source of truth. */
export function useHomeChrome(options: HomeChromeOptions): void {
  const { environment, motionDisabled, systemReducedMotion, ready } = options;
  const idleEnabled = useCinematicStore((state) => state.idleEnabled);
  const preferenceError = useCinematicStore((state) => state.preferenceError);
  const [preferencesReady, setPreferencesReady] = useState(() => !isEmbeddedScene());
  const current = useRef(options);
  current.current = options;
  const hostSuspended = useRef(options.hostSuspended);
  hostSuspended.current = options.hostSuspended;
  const lastCommandId = useRef(0);
  const snapshot = useMemo<HomeChromeSnapshot>(() => ({
    locationName: environment.location.name,
    localTime: environment.localTime,
    tempC: environment.weather?.tempC ?? null,
    weatherCode: environment.weather?.weatherCode ?? null,
    weatherStatus: environment.status === 'stale' ? 'cached' : environment.status,
    isNight: environment.isNight, motionDisabled, systemReducedMotion, idleEnabled, preferenceError,
  }), [environment.location.name, environment.localTime, environment.weather?.tempC, environment.weather?.weatherCode, environment.status, environment.isNight, motionDisabled, systemReducedMotion, idleEnabled, preferenceError]);

  useEffect(() => {
    if (isEmbeddedScene() && ready && preferencesReady) reportHomeChromeSnapshot(window, snapshot);
  }, [ready, preferencesReady, snapshot]);

  useEffect(() => {
    if (!isEmbeddedScene()) return;
    // A trusted resume event can precede its React render; consume its state synchronously.
    const stopPresentation = subscribeScenePresentation(window, (suspended) => { hostSuspended.current = suspended; });
    const stopPreferences = subscribeHomeChromePreferences(window, ({ idleEnabled, preferenceError }) => {
      // Native/opaque embeds never own storage; a stored preference cannot start a tour itself.
      useCinematicStore.setState({ idleEnabled, preferenceError, ...(!idleEnabled ? { showcase: false } : {}) });
      setPreferencesReady(true);
    });
    const stopCommands = subscribeHomeChromeCommands(window, ({ id, command }) => {
      // Consume every fresh intent even when unavailable: foregrounding must never replay it.
      if (id <= lastCommandId.current) return;
      lastCommandId.current = id;
      const state = current.current;
      if (!state.ready || document.hidden || (hostSuspended.current && !isHomeChromePreferenceCommand(command))) return;
      // The native host separately gates setters to its foreground Preferences panel.
      if (command.type === 'set-motion') {
        if (!state.systemReducedMotion) useHomeStore.getState().setMotionDisabled(command.disabled);
      } else if (command.type === 'set-tour') return; // This preference is saved and echoed only by the host.
      else {
        useCinematicStore.getState().setShowcase(false);
        if (command.type === 'open-environment') state.onOpenEnvironment();
        else state.onOpenPreferences();
      }
    });
    return () => { stopPresentation(); stopPreferences(); stopCommands(); };
  }, []);
}
