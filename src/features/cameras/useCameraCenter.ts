import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import { useSimulationControls } from '../three-d-home/useSimulationControls';
import { buildCameraCenterModel, getCameraCenterAccess } from './cameraCenterModel';
import { cameraCenterPreferenceStore, EMPTY_CAMERA_PREFERENCES } from './cameraCenterPreferences';

/** Watch only authorization/catalog inputs; unrelated weather and slider activity do not rerender the wall. */
function selectCameraCenterInputs(state: HomeState) {
  return {
    accountUserId: state.accountUserId, authenticatedUserId: state.authenticatedUserId,
    accountHomeId: state.accountHomeId, activeHomeId: state.activeHomeId,
    membershipReady: state.membershipReady, authTaskBlockingHome: state.authTaskBlockingHome,
    sessionEpoch: state.sessionEpoch, activeMemberId: state.activeMemberId,
    household: state.household, memberPermissionOverrides: state.memberPermissionOverrides,
    roomMembers: state.roomMembers, rooms: state.rooms, devices: state.devices,
    realtime: state.realtime, modelCatalogVersion: state.modelCatalogVersion,
  };
}

/** Track authorization independently of protected content so expiry/regrant can renew its authentication boundary. */
export function useCameraCenterAccess() {
  const inputs = useHomeStore(useShallow(selectCameraCenterInputs));
  const [expiryRevision, setExpiryRevision] = useState(0);
  // The pure access selector only reads the inputs listed above. The full store
  // is supplied to preserve its shared selector contract without a type assertion.
  const access = useMemo(() => getCameraCenterAccess(useHomeStore.getState()), [inputs, expiryRevision]);

  useEffect(() => {
    if (!access.canView) return;
    const member = inputs.household.find((item) => item.id === inputs.activeMemberId);
    if (member?.role !== 'Guest' || !member.accessExpiresAt) return;
    const remaining = Date.parse(member.accessExpiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timer = setTimeout(() => setExpiryRevision((value) => value + 1), Math.min(remaining + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [access.canView, inputs.household, inputs.activeMemberId, expiryRevision]);

  return { access, inputs };
}

/** Keep Camera Center's read-only simulation projection and harmless favorites tied to the current grant. */
export function useCameraCenter(active: boolean) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const { access, inputs } = useCameraCenterAccess();
  const enabled = active && access.canView;
  const hasSimulation = Object.keys(access.bindings).length > 0;
  const simulation = useSimulationControls(enabled && hasSimulation);
  const preferenceScope = enabled ? access.scopeKey : null;
  const subscribe = useCallback((notify: () => void) => preferenceScope
    ? cameraCenterPreferenceStore.subscribe(preferenceScope, notify) : () => undefined, [preferenceScope]);
  const getPreferences = useCallback(() => preferenceScope
    ? cameraCenterPreferenceStore.getSnapshot(preferenceScope) : EMPTY_CAMERA_PREFERENCES, [preferenceScope]);
  const preferences = useSyncExternalStore(subscribe, getPreferences, getPreferences);

  useEffect(() => {
    activeRef.current = active;
    return () => { activeRef.current = false; };
  }, [active]);

  useEffect(() => {
    if (preferenceScope) void cameraCenterPreferenceStore.load(preferenceScope);
  }, [preferenceScope]);

  const model = useMemo(() => enabled ? buildCameraCenterModel(access, inputs.rooms,
    simulation.ready ? simulation.state : null, preferences.favoriteIds) : { cameras: [], events: [] },
  [enabled, access, inputs.rooms, simulation.ready, simulation.state, preferences.favoriteIds]);

  /** Recheck identity and current camera grants at the moment a remembered UI callback is used. */
  const toggleFavorite = useCallback((id: string) => {
    if (!activeRef.current) return;
    const current = getCameraCenterAccess(useHomeStore.getState());
    if (!current.canView || current.identityKey !== access.identityKey || !current.scopeKey) return;
    cameraCenterPreferenceStore.toggleFavorite(current.scopeKey, id, current.devices.map((device) => device.id));
  }, [active, access.identityKey]);

  /** Recovery cannot accidentally retry a previous account's preferences after a sign-out. */
  const retryPreferences = useCallback(() => {
    if (!activeRef.current) return;
    const current = getCameraCenterAccess(useHomeStore.getState());
    if (current.canView && current.identityKey === access.identityKey && current.scopeKey) {
      cameraCenterPreferenceStore.retry(current.scopeKey);
    }
  }, [active, access.identityKey]);

  return {
    ...access,
    ...model,
    ready: enabled && (!hasSimulation || simulation.ready),
    preferencesReady: enabled && preferences.ready,
    preferenceError: enabled && preferences.status === 'error'
      ? 'Camera favorites could not be saved or restored. Retry to keep your choices.' : null,
    simulationError: enabled && hasSimulation && ['load-error', 'corrupt', 'disconnected'].includes(simulation.status)
      ? 'Saved camera previews are unavailable. Your existing settings have been kept.' : null,
    retrySimulation: simulation.reconnect,
    toggleFavorite,
    retryPreferences,
  };
}
