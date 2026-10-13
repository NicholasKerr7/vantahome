import { act, renderHook } from '@testing-library/react-native';
import { useHomeStore, type HomeState } from '../../../store/useHomeStore';
import { useAccountPreferences } from '../useAccountPreferences';

jest.mock('../../../services/supabaseClient', () => ({ supabase: {} }));
const seed = useHomeStore.getState();

/** Hold a storage result after the synchronous visible update to reproduce persistence races. */
function pendingWrite() {
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((_resolve, rejectWrite) => { reject = rejectWrite; });
  return { promise, reject };
}

beforeEach(() => {
  useHomeStore.setState({ ...seed, authenticatedUserId: 'alice', accountUserId: 'alice',
    activeHomeId: 'home', accountHomeId: 'home', membershipReady: true, sessionEpoch: 1,
    profile: { name: 'Alice', tempUnit: 'C', timeFormat: '12h' }, preferences: { haptics: true, notifications: true } });
});
afterEach(() => useHomeStore.setState(seed, true));

test('a rejected display write restores only its edited field and reports a visible error', async () => {
  const pending = pendingWrite();
  const original = useHomeStore.getState().setProfile;
  const write = jest.fn(original).mockImplementationOnce(async patch => {
    await original(patch);
    await pending.promise;
  });
  useHomeStore.setState({ setProfile: write });
  const { result } = renderHook(() => useAccountPreferences());
  let saving!: Promise<void>;
  act(() => { saving = result.current.setDisplayPreferences({ tempUnit: 'F' }); });
  await act(async () => { await original({ name: 'Updated name', timeFormat: '24h' }); });
  await act(async () => { pending.reject(new Error('Storage unavailable')); await saving; });
  expect(useHomeStore.getState().profile).toMatchObject({ name: 'Updated name', tempUnit: 'C', timeFormat: '24h' });
  expect(result.current.preferenceError).toBe('This personal preference could not be saved. Please try again.');
});

test('a rejected comfort write restores haptics without undoing a newer notification choice', async () => {
  const pending = pendingWrite();
  const original = useHomeStore.getState().setPreferences;
  useHomeStore.setState({ setPreferences: jest.fn(original).mockImplementationOnce(async patch => {
    await original(patch);
    await pending.promise;
  }) });
  const { result } = renderHook(() => useAccountPreferences());
  let saving!: Promise<void>;
  act(() => { saving = result.current.setComfortPreferences({ haptics: false }); });
  await act(async () => { await result.current.setComfortPreferences({ notifications: false }); });
  await act(async () => { pending.reject(new Error('Storage unavailable')); await saving; });
  expect(useHomeStore.getState().preferences).toEqual({ haptics: true, notifications: false });
  expect(result.current.preferenceError).toBeTruthy();
});

test('an older failed write cannot undo a newer successful choice with the same value', async () => {
  const pending = pendingWrite();
  const original = useHomeStore.getState().setProfile;
  useHomeStore.setState({ setProfile: jest.fn(original).mockImplementationOnce(async patch => {
    await original(patch);
    await pending.promise;
  }) });
  const { result } = renderHook(() => useAccountPreferences());
  let saving!: Promise<void>;
  act(() => { saving = result.current.setDisplayPreferences({ tempUnit: 'F' }); });
  await act(async () => { await result.current.setDisplayPreferences({ tempUnit: 'C' }); });
  await act(async () => { await result.current.setDisplayPreferences({ tempUnit: 'F' }); });
  await act(async () => { pending.reject(new Error('Old write failed')); await saving; });
  expect(useHomeStore.getState().profile.tempUnit).toBe('F');
  expect(result.current.preferenceError).toBeNull();
});

test('a delayed failure cannot roll back or report an error in a different account', async () => {
  const pending = pendingWrite();
  const original = useHomeStore.getState().setProfile;
  useHomeStore.setState({ setProfile: jest.fn(original).mockImplementationOnce(async patch => {
    await original(patch);
    await pending.promise;
  }) });
  const { result } = renderHook(() => useAccountPreferences());
  let saving!: Promise<void>;
  act(() => { saving = result.current.setDisplayPreferences({ tempUnit: 'F' }); });
  act(() => { useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 2,
    profile: { name: 'Bob', tempUnit: 'F' } }); });
  await act(async () => { pending.reject(new Error('Alice storage failed')); await saving; });
  expect(useHomeStore.getState().profile).toEqual({ name: 'Bob', tempUnit: 'F' });
  expect(result.current.preferenceError).toBeNull();
});

test('a closed preferences sheet still restores a failed write for the same account', async () => {
  const pending = pendingWrite();
  const original = useHomeStore.getState().setPreferences;
  const write = jest.fn(original).mockImplementationOnce(async patch => {
    await original(patch);
    await pending.promise;
  });
  useHomeStore.setState({ setPreferences: write });
  const { result, unmount } = renderHook(() => useAccountPreferences());
  let saving!: Promise<void>;
  act(() => { saving = result.current.setComfortPreferences({ haptics: false }); });
  unmount();
  await act(async () => { pending.reject(new Error('Storage unavailable')); await saving; });
  expect(write).toHaveBeenCalledTimes(2);
  expect(useHomeStore.getState().preferences.haptics).toBe(true);
});

test('an old closed sheet cannot undo a newer choice from a reopened preferences sheet', async () => {
  const pending = pendingWrite();
  const original = useHomeStore.getState().setPreferences;
  const write = jest.fn(original).mockImplementationOnce(async patch => {
    await original(patch);
    await pending.promise;
  });
  useHomeStore.setState({ setPreferences: write });
  const first = renderHook(() => useAccountPreferences());
  let saving!: Promise<void>;
  act(() => { saving = first.result.current.setComfortPreferences({ haptics: false }); });
  first.unmount();
  // Home refreshes do not change ownership of these account-local preferences.
  act(() => { useHomeStore.setState({ activeHomeId: 'another-home', accountHomeId: 'another-home' }); });
  const reopened = renderHook(() => useAccountPreferences());
  await act(async () => { await reopened.result.current.setComfortPreferences({ haptics: true }); });
  await act(async () => { await reopened.result.current.setComfortPreferences({ haptics: false }); });
  await act(async () => { pending.reject(new Error('Earlier storage write failed')); await saving; });
  expect(useHomeStore.getState().preferences.haptics).toBe(false);
  expect(write).toHaveBeenCalledTimes(3);
  expect(reopened.result.current.preferenceError).toBeNull();
});

test('a failed rollback remains recoverable without rejecting the UI callback', async () => {
  const original = useHomeStore.getState().setPreferences;
  const write = jest.fn(async (patch: Partial<HomeState['preferences']>) => {
    await original(patch);
    throw new Error('Storage remains unavailable');
  });
  useHomeStore.setState({ setPreferences: write });
  const { result } = renderHook(() => useAccountPreferences());
  await act(async () => { await expect(result.current.setComfortPreferences({ notifications: false })).resolves.toBeUndefined(); });
  expect(useHomeStore.getState().preferences.notifications).toBe(true);
  expect(result.current.preferenceError).toBeTruthy();
});
