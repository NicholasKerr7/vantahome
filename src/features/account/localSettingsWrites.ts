import type { AccountScope } from './accountIdentity';

type LocalSettingsScope = Pick<AccountScope, 'authenticatedUserId' | 'accountUserId' | 'sessionEpoch'>;
type WriteState = { pending: number; revisions: Map<string, number> };
const scopes = new Map<string, WriteState>();
let revision = 0;

export type LocalSettingsWrite = {
  isLatest: (field: string) => boolean;
  finish: () => void;
};

/** Personal storage belongs to an account/session even when its home membership is being refreshed. */
export function localSettingsScopeKey(scope: LocalSettingsScope): string {
  return JSON.stringify([scope.authenticatedUserId, scope.accountUserId, scope.sessionEpoch]);
}

/** Pending local saves may settle after navigation, but never mutate another signed-in account. */
export function isLocalSettingsScopeCurrent(scope: LocalSettingsScope, current: LocalSettingsScope): boolean {
  return scope.authenticatedUserId === current.authenticatedUserId
    && scope.accountUserId === current.accountUserId
    && scope.sessionEpoch === current.sessionEpoch;
}

/** Share field ownership across reopened editors, retaining revisions only while writes are pending. */
export function beginLocalSettingsWrite(
  scopeKey: string,
  collection: 'profile' | 'preferences',
  fields: readonly string[],
): LocalSettingsWrite {
  const state = scopes.get(scopeKey) ?? { pending: 0, revisions: new Map<string, number>() };
  scopes.set(scopeKey, state);
  state.pending += 1;
  const request = ++revision;
  fields.forEach(field => state.revisions.set(`${collection}.${field}`, request));
  let finished = false;
  return {
    isLatest: field => state.revisions.get(`${collection}.${field}`) === request,
    finish: () => {
      if (finished) return;
      finished = true;
      state.pending -= 1;
      if (state.pending === 0 && scopes.get(scopeKey) === state) scopes.delete(scopeKey);
    },
  };
}
