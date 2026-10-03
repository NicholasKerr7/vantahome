import { runtimePolicy, type RuntimeMode } from '../../config/runtimeMode';
import { hasCurrentMembershipAccess } from '../../security/guestAccess';
import { roleHasPermission } from '../../security/permissions';
import { selectActiveMember, selectVisibleDevices, selectVisibleRooms, type HomeState } from '../../store/useHomeStore';
import type { HomeDestination } from './homeDestinations';
import type { HomeSection } from './HomeNavigation';

export type HomeNavigationAccess = Readonly<Record<HomeDestination | HomeSection, boolean> & {
  ready: boolean;
  admin: boolean;
}>;

/** Resolve current membership before exposing home capabilities, including during account changes. */
export function selectHomeNavigationAccess(state: HomeState, mode: RuntimeMode = runtimePolicy.mode): HomeNavigationAccess {
  const member = selectActiveMember(state);
  const hasAccountScope = Boolean(state.accountUserId || state.authenticatedUserId || state.accountHomeId || state.activeHomeId);
  const ready = hasCurrentMembershipAccess(member) && (hasAccountScope
    ? Boolean(state.membershipReady && state.accountUserId && state.activeHomeId
      && state.accountUserId === state.authenticatedUserId && state.accountHomeId === state.activeHomeId
      && (member?.userId ?? member?.id) === state.authenticatedUserId)
    : mode === 'demo');
  const overrides = state.memberPermissionOverrides.filter((item) => item.memberId === member?.id);
  const admin = ready && (member?.role === 'Owner' || member?.role === 'Admin');
  const devices = ready && Boolean(member && roleHasPermission(member.role, 'device.view', overrides));
  const rooms = ready && selectVisibleRooms(state).length > 0;
  const cameras = devices && selectVisibleDevices(state).some((device) => device.kind === 'camera');
  const automations = ready && Boolean(member && roleHasPermission(member.role, 'automation.manage', overrides));
  // The comparison renderer has no assigned-room projection, so only full-home administrators may open it.
  const renderer = admin && (hasAccountScope || (member?.role === 'Owner' && !state.realtime.enabled && !state.realtime.useMqtt));
  return {
    ready, admin, devices, rooms, cameras, automations, renderer,
    // Scene execution can combine sensitive actions; keep its editor and runner with routine management.
    scenes: devices && rooms && automations,
    integrations: admin, audit: admin,
    notifications: ready, activity: ready,
    home: true, more: true, household: true, settings: true,
  };
}
