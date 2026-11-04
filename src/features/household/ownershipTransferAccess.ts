import { selectActiveMember, type HomeState, type HouseholdMember } from '../../store/useHomeStore';

/** Identify the signed-in household actor who may offer ownership or receive an offer. */
export function selectOwnershipTransferActor(state: HomeState): HouseholdMember | null {
  if (state.authTaskBlockingHome || !state.membershipReady || !state.authenticatedUserId
    || state.authenticatedUserId !== state.accountUserId || !state.activeHomeId
    || state.activeHomeId !== state.accountHomeId) return null;

  const member = selectActiveMember(state);
  if (!member || (member.userId ?? member.id) !== state.authenticatedUserId) return null;
  return member.role === 'Owner' || member.role === 'Admin' || member.role === 'Member' ? member : null;
}
