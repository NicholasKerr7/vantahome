import { isAccountScopeCurrent, resolveAccountIdentity, type AccountIdentityState } from '../accountIdentity';

const account: AccountIdentityState = {
  authenticatedUserId: 'alice', accountUserId: 'alice', activeHomeId: 'home-a', accountHomeId: 'home-a', sessionEpoch: 3, membershipReady: true,
  profile: { name: 'Alice Smith', email: 'mutable@example.com', homeName: 'Local home label' },
  household: [
    { id: 'alice', userId: 'alice', name: 'Alice', role: 'Guest', status: 'home' },
    { id: 'bob', userId: 'bob', name: 'Bob', role: 'Owner', status: 'home' },
  ],
};

test('labels the authenticated person rather than another selected household member', () => {
  expect(resolveAccountIdentity({ ...account, ...{ activeMemberId: 'bob' } }, false)).toEqual({
    mode: 'account', name: 'Alice Smith', firstName: 'Alice', initials: 'AS', role: 'Guest', homeId: 'home-a',
  });
});

test.each([
  { membershipReady: false },
  { accountHomeId: 'old-home' },
  { household: [{ id: 'alice', name: 'Imposter', role: 'Owner' as const, status: 'home' as const }] },
])('does not claim a role or home without verified matching membership: %p', (patch) => {
  expect(resolveAccountIdentity({ ...account, ...patch }, false)).toMatchObject({ role: null, homeId: null });
});

test('does not leak a prior account display name during account hydration', () => {
  expect(resolveAccountIdentity({ ...account, authenticatedUserId: 'bob' }, true)).toMatchObject({
    mode: 'unavailable', name: 'Account unavailable', role: null, homeId: null,
  });
});

test('demo identity does not claim seeded owner identity or household access', () => {
  const result = resolveAccountIdentity({ ...account, authenticatedUserId: null, accountUserId: null }, true);
  expect(result).toMatchObject({ mode: 'demo', name: 'Demo profile', role: null, homeId: null });
  expect(resolveAccountIdentity({ ...account, authenticatedUserId: null, accountUserId: null }, false).mode).toBe('unavailable');
});

test('invalidates account work after any membership, home or session boundary changes', () => {
  expect(isAccountScopeCurrent(account, { ...account })).toBe(true);
  for (const patch of [{ sessionEpoch: 4 }, { authenticatedUserId: 'bob' }, { activeHomeId: 'home-b' }, { membershipReady: false }]) {
    expect(isAccountScopeCurrent(account, { ...account, ...patch })).toBe(false);
  }
});
