import { act, renderHook } from '@testing-library/react-native';
import { useHomeStore } from '../../store/useHomeStore';
import { confirmProtectedAccess } from '../../security/biometricConfirmation';
import { setMemberPermissionOverrideRemote } from '../../services/memberPermissions';
import { useMemberPermissionUpdate } from './useMemberPermissionUpdate';

jest.mock('../../services/supabaseClient', () => ({ supabase: {} }));
jest.mock('../../services/memberPermissions', () => ({ setMemberPermissionOverrideRemote: jest.fn() }));
jest.mock('../../security/biometricConfirmation', () => ({ confirmProtectedAccess: jest.fn() }));
const initial = useHomeStore.getState();
const guest = { id: 'guest', userId: 'guest-user', name: 'Guest', role: 'Guest' as const, status: 'home' as const };
/** Hold server or biometric completion to reproduce ordering failures deterministically. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(confirmProtectedAccess).mockResolvedValue(undefined);
  jest.mocked(setMemberPermissionOverrideRemote).mockResolvedValue(undefined);
  useHomeStore.setState({ ...initial, authenticatedUserId: 'owner', accountUserId: 'owner', activeHomeId: 'home', accountHomeId: 'home',
    membershipReady: true, sessionEpoch: 1, activeMemberId: 'owner', memberPermissionOverrides: [],
    household: [{ id: 'owner', userId: 'owner', name: 'Owner', role: 'Owner', status: 'home' }, guest] });
});
afterEach(() => useHomeStore.setState(initial, true));

test('keeps grants unchanged until confirmed, blocking rapid writes even across reopened editors', async () => {
  const pending = deferred();
  jest.mocked(setMemberPermissionOverrideRemote).mockReturnValueOnce(pending.promise);
  const first = renderHook(useMemberPermissionUpdate);
  let write!: Promise<void>;
  await act(async () => { write = first.result.current.updatePermissionOverride(guest, 'light.control', true); });
  expect(useHomeStore.getState().memberPermissionOverrides).toEqual([]);
  expect(first.result.current.permissionPending(guest.id, 'light.control')).toBe(true);
  first.unmount();
  const next = renderHook(useMemberPermissionUpdate);
  await act(async () => { await next.result.current.updatePermissionOverride(guest, 'light.control', false); });
  expect(setMemberPermissionOverrideRemote).toHaveBeenCalledTimes(1);
  await act(async () => { pending.reject(new Error('Connection lost')); await write; });
  await act(async () => { await next.result.current.updatePermissionOverride(guest, 'light.control', false); });
  expect(useHomeStore.getState().memberPermissionOverrides).toEqual([{ memberId: 'guest', permission: 'light.control', allowed: false }]);
});

test('failed writes retain the last confirmed choice and expose retry text', async () => {
  useHomeStore.setState({ memberPermissionOverrides: [{ memberId: 'guest', permission: 'light.control', allowed: false }] });
  jest.mocked(setMemberPermissionOverrideRemote).mockRejectedValueOnce(new Error('Offline'));
  const { result } = renderHook(useMemberPermissionUpdate);
  await act(async () => { await result.current.updatePermissionOverride(guest, 'light.control', true); });
  expect(useHomeStore.getState().memberPermissionOverrides[0].allowed).toBe(false);
  expect(result.current.permissionError).toBe('Permission not changed. Offline');
  await act(async () => { await result.current.updatePermissionOverride(guest, 'light.control', null); });
  expect(result.current.permissionError).toBeNull();
  expect(useHomeStore.getState().memberPermissionOverrides).toEqual([]);
});

test('a stale target role and a revoked actor cannot use a rendered permission handler', async () => {
  const pending = deferred();
  jest.mocked(confirmProtectedAccess).mockReturnValueOnce(pending.promise);
  const { result } = renderHook(useMemberPermissionUpdate);
  let write!: Promise<void>;
  act(() => { write = result.current.updatePermissionOverride(guest, 'light.control', true); });
  act(() => { useHomeStore.setState({ household: useHomeStore.getState().household.map(member => member.id === guest.id ? { ...member, role: 'Owner' } : member) }); });
  await act(async () => { pending.resolve(); await write; });
  expect(setMemberPermissionOverrideRemote).not.toHaveBeenCalled();
});

test('a completion from an earlier session never changes the new account', async () => {
  const pending = deferred();
  jest.mocked(setMemberPermissionOverrideRemote).mockReturnValueOnce(pending.promise);
  const { result } = renderHook(useMemberPermissionUpdate);
  let write!: Promise<void>;
  await act(async () => { write = result.current.updatePermissionOverride(guest, 'light.control', true); });
  act(() => { useHomeStore.setState({ sessionEpoch: 2 }); });
  await act(async () => { pending.resolve(); await write; });
  expect(useHomeStore.getState().memberPermissionOverrides).toEqual([]);
  expect(result.current.permissionError).toBeNull();
});
