import { useEffect, useSyncExternalStore } from "react";
import { runtimePolicy } from "../../config/runtimeMode";
import {
  selectVisibleDevices,
  useHomeStore,
  type HomeState,
} from "../../store/useHomeStore";
import { getDevice } from "../../../packages/home-scene/src/data";
import { isModelHome } from "./modelHomeScope";
import { canShareDemoDevices } from "./simulationSession";
import {
  modelDeviceFavorites,
  type FavoriteSnapshot,
} from "./deviceBrowserPreferences";

const hiddenSnapshot: FavoriteSnapshot = { ids: [], status: "saved" };

/** Favorites belong only to the offline authored house under its owner demonstration. */
export function canUseModelFavorites(state: HomeState): boolean {
  return isModelHome(state) && canShareDemoDevices(state, runtimePolicy.mode);
}

/** Hide preferences immediately on a scope switch and recheck visibility before every edit. */
export function useDeviceBrowserFavorites() {
  const enabled = useHomeStore(canUseModelFavorites);
  const snapshot = useSyncExternalStore(
    modelDeviceFavorites.subscribe,
    modelDeviceFavorites.getSnapshot,
    modelDeviceFavorites.getSnapshot,
  );
  useEffect(() => {
    if (enabled) void modelDeviceFavorites.load();
  }, [enabled]);

  /** Reject stale controls after identity, role, or device access changes. */
  function toggle(id: string): void {
    const state = useHomeStore.getState();
    if (!canUseModelFavorites(state)) return;
    const definition = getDevice(id);
    if (
      !definition ||
      !selectVisibleDevices(state).some(
        (device) => device.id === id && device.kind === definition.kind,
      )
    )
      return;
    modelDeviceFavorites.toggle(id);
  }

  return { ...(enabled ? snapshot : hiddenSnapshot), enabled, toggle };
}
