import { useHomeStore } from '../store/useHomeStore';

let revision = 0;
const pendingScopes = new Map<string, number>();

/** Old-account requests must not block verification for a later login. */
function scopeKey(): string {
  const state = useHomeStore.getState();
  return JSON.stringify([state.authenticatedUserId, state.sessionEpoch]);
}

/** Capture the authoritative scope and policy objects before a membership read. */
export function captureMembershipRead() {
  const state = useHomeStore.getState();
  return {
    revision, pendingMutations: pendingScopes.get(scopeKey()) ?? 0,
    userId: state.authenticatedUserId, sessionEpoch: state.sessionEpoch,
    authTaskVersion: state.authTaskVersion,
    homeId: state.activeHomeId, accountHomeId: state.accountHomeId,
    // Presence, names and portraits do not change authority or invalidate a read.
    policy: JSON.stringify([
      state.household.map(({ id, userId, role, accessExpiresAt, shareInteriorLayout }) =>
        ({ id, userId, role, accessExpiresAt, shareInteriorLayout })),
      state.roomMembers, state.memberPermissionOverrides,
    ]),
  };
}

export type MembershipRead = ReturnType<typeof captureMembershipRead>;

/** A read cannot undo a later selection, local policy publication, or remote mutation. */
export function isMembershipReadCurrent(read: MembershipRead): boolean {
  const current = captureMembershipRead();
  return read.pendingMutations === 0 && current.pendingMutations === 0
    && read.revision === current.revision && read.userId === current.userId
    && read.sessionEpoch === current.sessionEpoch && read.homeId === current.homeId
    && read.authTaskVersion === current.authTaskVersion
    && read.accountHomeId === current.accountHomeId && read.policy === current.policy;
}

/** Fence reads for the entire remote write, including uncertain or rejected outcomes. */
export function beginMembershipMutation(): () => void {
  revision += 1;
  const key = scopeKey();
  pendingScopes.set(key, (pendingScopes.get(key) ?? 0) + 1);
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    const remaining = (pendingScopes.get(key) ?? 1) - 1;
    if (remaining) pendingScopes.set(key, remaining);
    else pendingScopes.delete(key);
    // A finished request owns only its captured login. A later account/session
    // may already be verifying access and must not lose that fresh response.
    if (key === scopeKey()) revision += 1;
  };
}

/** Run one mutation while blocking membership snapshots captured before or during it. */
export async function withMembershipMutation<T>(mutate: () => Promise<T>): Promise<T> {
  const finish = beginMembershipMutation();
  try { return await mutate(); }
  finally { finish(); }
}
