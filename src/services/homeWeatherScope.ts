import { runtimePolicy } from '../config/runtimeMode';
import { hasCurrentMembershipAccess } from '../security/guestAccess';
import type { HomeState } from '../store/useHomeStore';

/** Scope shared weather reads to the verified account, home, actor and access deadline. */
export function weatherScopeKey(state: HomeState): string {
  const member = state.household.find((candidate) => candidate.id === state.activeMemberId);
  return JSON.stringify([state.authenticatedUserId, state.accountUserId, state.activeHomeId,
    state.accountHomeId, state.sessionEpoch, state.membershipReady, state.activeMemberId,
    member?.id, member?.role, member?.accessExpiresAt, state.realtime.enabled, state.realtime.useMqtt]);
}

/** Only the explicit local demo can use town weather without verified property settings. */
export function isLocalWeatherDemo(state: HomeState): boolean {
  return runtimePolicy.allowUnauthenticatedDemo && !state.authenticatedUserId && !state.accountUserId
    && !state.activeHomeId && !state.accountHomeId && !state.realtime.enabled && !state.realtime.useMqtt;
}

/** Recheck identity and expiry without borrowing device or room grants. */
export function canReadWeatherSettings(state: HomeState): boolean {
  const member = state.household.find((candidate) => candidate.id === state.activeMemberId);
  return state.membershipReady && Boolean(state.authenticatedUserId && state.activeHomeId)
    && state.authenticatedUserId === state.accountUserId && state.activeHomeId === state.accountHomeId
    && member?.id === state.authenticatedUserId && hasCurrentMembershipAccess(member);
}
