import { hydrateHomeAccount, setAuthTaskBlockingHome, useHomeStore } from '../store/useHomeStore';
import { beginMembershipMutation, captureMembershipRead, isMembershipReadCurrent } from './membershipRevision';

beforeEach(async () => { await hydrateHomeAccount('revision-user'); });

test('a completed credential task still invalidates a read from before the task', () => {
  const before = captureMembershipRead();
  setAuthTaskBlockingHome(true);
  setAuthTaskBlockingHome(false);
  expect(isMembershipReadCurrent(before)).toBe(false);
  expect(isMembershipReadCurrent(captureMembershipRead())).toBe(true);
});

test('rejects reads captured before or during a mutation even if policy has not published yet', () => {
  const before = captureMembershipRead();
  const finish = beginMembershipMutation();
  const during = captureMembershipRead();
  expect(isMembershipReadCurrent(before)).toBe(false);
  expect(isMembershipReadCurrent(during)).toBe(false);
  finish();
  expect(isMembershipReadCurrent(before)).toBe(false);
  expect(isMembershipReadCurrent(during)).toBe(false);
  expect(isMembershipReadCurrent(captureMembershipRead())).toBe(true);
});

test('holds the fence until every overlapping mutation completes', () => {
  const first = beginMembershipMutation();
  const second = beginMembershipMutation();
  first(); first();
  expect(isMembershipReadCurrent(captureMembershipRead())).toBe(false);
  second();
  expect(isMembershipReadCurrent(captureMembershipRead())).toBe(true);
});

test.each(['next-user', 'revision-user'])('a previous request finishing cannot invalidate a newer login for %s', async userId => {
  const finish = beginMembershipMutation();
  await hydrateHomeAccount(null);
  await hydrateHomeAccount(userId);
  const newLoginRead = captureMembershipRead();
  expect(isMembershipReadCurrent(newLoginRead)).toBe(true);
  finish();
  expect(isMembershipReadCurrent(newLoginRead)).toBe(true);
});

test('ignores presence changes but rejects a changed action policy', () => {
  useHomeStore.setState({ household: [{ id: 'revision-user', name: 'Owner', role: 'Owner', status: 'away' }] });
  const read = captureMembershipRead();
  useHomeStore.getState().setHouseholdPresence('revision-user', 'home');
  expect(isMembershipReadCurrent(read)).toBe(true);
  useHomeStore.setState({ memberPermissionOverrides: [{ memberId: 'guest', permission: 'light.control', allowed: false }] });
  expect(isMembershipReadCurrent(read)).toBe(false);
});
