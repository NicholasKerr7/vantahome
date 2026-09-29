import type { HomeState } from '../../store/useHomeStore';

/** Identify a draft's household session independently of device readings and other telemetry. */
export function homeEditorScope(state: HomeState): string {
  return JSON.stringify([state.accountUserId, state.accountHomeId, state.authenticatedUserId, state.activeHomeId, state.activeMemberId, state.sessionEpoch, state.membershipReady]);
}
