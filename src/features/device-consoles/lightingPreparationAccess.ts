import { selectHomeNavigationAccess } from '../home-shell/homeNavigationAccess';
import type { HomeState } from '../../store/useHomeStore';

/** Rehearsal belongs to the current integration administrator and never grants device control. */
export function canPrepareLightingConnection(state: HomeState): boolean {
  return selectHomeNavigationAccess(state).integrations;
}

/** Replace all local rehearsal callbacks after an account, household or role boundary changes. */
export function lightingPreparationIdentity(state: HomeState): string {
  const member = state.household.find((candidate) => candidate.id === state.activeMemberId);
  return JSON.stringify([state.accountUserId, state.authenticatedUserId, state.accountHomeId,
    state.activeHomeId, state.activeMemberId, state.sessionEpoch, member?.role]);
}
