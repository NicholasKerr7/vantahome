import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import { useControllerFocused } from '../three-d-home/useControllerFocused';
import { useSimulationControls } from '../three-d-home/useSimulationControls';
import { buildDeviceHealthEntries, getDeviceHealthAccess, type DeviceHealthAccess } from './deviceHealthModel';

/** Subscribe only to identity, grants and catalog inputs; unrelated home activity stays outside the view. */
function healthInputs(state: HomeState) {
  return { accountUserId: state.accountUserId, authenticatedUserId: state.authenticatedUserId,
    accountHomeId: state.accountHomeId, activeHomeId: state.activeHomeId, activeMemberId: state.activeMemberId,
    sessionEpoch: state.sessionEpoch, membershipReady: state.membershipReady, authTaskBlockingHome: state.authTaskBlockingHome,
    household: state.household, memberPermissionOverrides: state.memberPermissionOverrides, roomMembers: state.roomMembers,
    rooms: state.rooms, devices: state.devices, realtime: state.realtime, modelCatalogVersion: state.modelCatalogVersion };
}

/** Expire Guest access even when no store event occurs, and hide reports while covered or backgrounded. */
export function useDeviceHealthAccess() {
  const inputs = useHomeStore(useShallow(healthInputs));
  const focused = useControllerFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active' || AppState.currentState == null);
  const [visible, setVisible] = useState(typeof document === 'undefined' || !document.hidden);
  const [clockRevision, setClockRevision] = useState(0);
  const access = useMemo(() => getDeviceHealthAccess(useHomeStore.getState()), [inputs, clockRevision]);
  useEffect(() => {
    const application = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state === 'active') setClockRevision((value) => value + 1);
    });
    const page = typeof document === 'undefined' ? undefined : document;
    const visibility = () => { setVisible(!page?.hidden); setClockRevision((value) => value + 1); };
    page?.addEventListener('visibilitychange', visibility);
    return () => { application.remove(); page?.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    const member = inputs.household.find((item) => item.id === inputs.activeMemberId);
    if (!access.canView || member?.role !== 'Guest' || !member.accessExpiresAt) return;
    const remaining = Date.parse(member.accessExpiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timer = setTimeout(() => setClockRevision((value) => value + 1), Math.min(remaining + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [access.canView, inputs.household, inputs.activeMemberId, clockRevision]);
  return { access, rooms: inputs.rooms, active: focused && foreground && visible && access.canView };
}

/** Read the existing scoped model without exposing a command client to the health interface. */
export function useDeviceHealthEntries(access: DeviceHealthAccess, rooms: readonly { id: string; name: string }[], examples: boolean) {
  const hasBindings = Object.keys(access.bindings).length > 0;
  const snapshot = useSimulationControls(access.canView && hasBindings);
  const entries = useMemo(() => buildDeviceHealthEntries(access, rooms, snapshot.ready ? snapshot.state : null, examples),
    [access, rooms, snapshot.ready, snapshot.state, examples]);
  return { entries, loading: hasBindings && !snapshot.ready && snapshot.status === 'loading',
    error: hasBindings && !snapshot.ready && ['load-error', 'corrupt', 'disconnected'].includes(snapshot.status),
    retry: snapshot.reconnect };
}
