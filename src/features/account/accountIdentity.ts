import type { HomeState, HouseholdMember } from '../../store/useHomeStore';

export type AccountScope = Pick<HomeState, 'authenticatedUserId' | 'accountUserId' | 'activeHomeId' | 'accountHomeId' | 'sessionEpoch' | 'membershipReady'>;
export type AccountIdentityState = AccountScope & Pick<HomeState, 'profile' | 'household'>;
export type AccountIdentity = {
  mode: 'demo' | 'account' | 'unavailable';
  name: string;
  firstName: string;
  initials: string;
  role: HouseholdMember['role'] | null;
  homeId: string | null;
};

/** Only a synchronized membership belonging to the authenticated person can label their access. */
export function resolveAccountIdentity(state: AccountIdentityState, demoAvailable: boolean): AccountIdentity {
  const userId = state.authenticatedUserId;
  if (!userId || state.accountUserId !== userId) {
    const demo = demoAvailable && !userId && !state.accountUserId;
    return {
      mode: demo ? 'demo' : 'unavailable', name: demo ? 'Demo profile' : 'Account unavailable',
      firstName: demo ? 'Demo' : 'Account', initials: demo ? 'VH' : '?', role: null, homeId: null,
    };
  }
  const homeReady = state.membershipReady && Boolean(state.activeHomeId) && state.accountHomeId === state.activeHomeId;
  const member = homeReady ? state.household.find((candidate) => candidate.userId === userId) : undefined;
  const name = state.profile.name.trim() || member?.name.trim() || 'Your account';
  const words = name.split(/\s+/);
  return {
    mode: 'account', name, firstName: words[0],
    initials: words.slice(0, 2).map((word) => Array.from(word)[0]).join('').toUpperCase(),
    role: member?.role ?? null, homeId: member ? state.activeHomeId : null,
  };
}

/** Delayed reads and sign-out actions must never cross a home, account, or session boundary. */
export function isAccountScopeCurrent(scope: AccountScope, current: AccountScope): boolean {
  return scope.authenticatedUserId === current.authenticatedUserId
    && scope.accountUserId === current.accountUserId
    && scope.activeHomeId === current.activeHomeId
    && scope.accountHomeId === current.accountHomeId
    && scope.sessionEpoch === current.sessionEpoch
    && scope.membershipReady === current.membershipReady;
}
