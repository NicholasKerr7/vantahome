import { act, renderHook } from '@testing-library/react-native';
import { useHomeStore } from '../../../store/useHomeStore';
import { useAccountSecurityRoute } from '../useAccountSecurityRoute';

beforeEach(() => {
  useHomeStore.setState({ authenticatedUserId: 'alice', accountUserId: 'alice', sessionEpoch: 1,
    activeHomeId: null, accountHomeId: null, membershipReady: false });
});

test('keeps account navigation independent of membership while ignoring stale credential-setup callbacks', () => {
  const screen = renderHook(({ credentialSetup }: { credentialSetup: boolean }) => useAccountSecurityRoute({ userId: 'alice', ready: true, credentialSetup }),
    { initialProps: { credentialSetup: false } });
  const oldOpen = screen.result.current.open;
  act(() => oldOpen());
  expect(screen.result.current.isOpen).toBe(true);
  screen.rerender({ credentialSetup: true });
  expect(screen.result.current.isOpen).toBe(false);
  act(() => oldOpen());
  screen.rerender({ credentialSetup: false });
  expect(screen.result.current.isOpen).toBe(false);
});

test('a stale opening cannot target a new login or resurrect on returning to the original account', () => {
  const screen = renderHook(({ userId }: { userId: string }) => useAccountSecurityRoute({ userId, ready: true, credentialSetup: false }),
    { initialProps: { userId: 'alice' } });
  const oldOpen = screen.result.current.open;
  act(() => { useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 2 }); });
  screen.rerender({ userId: 'bob' });
  act(() => oldOpen());
  expect(screen.result.current.isOpen).toBe(false);
  act(() => screen.result.current.open());
  expect(screen.result.current.isOpen).toBe(true);
  act(() => { useHomeStore.setState({ authenticatedUserId: 'alice', accountUserId: 'alice', sessionEpoch: 3 }); });
  screen.rerender({ userId: 'alice' });
  expect(screen.result.current.isOpen).toBe(false);
});

test.each([{ ready: false, credentialSetup: false }, { ready: true, credentialSetup: true }])('requires prepared account outside credential setup %j', (state) => {
  const screen = renderHook(() => useAccountSecurityRoute({ userId: 'alice', ...state }));
  act(() => screen.result.current.open());
  expect(screen.result.current.eligible).toBe(false);
  expect(screen.result.current.isOpen).toBe(false);
});
