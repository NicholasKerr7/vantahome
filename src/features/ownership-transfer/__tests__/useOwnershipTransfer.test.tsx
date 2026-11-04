import { act, renderHook, cleanup } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useHomeStore } from '../../../store/useHomeStore';
import { useOwnershipTransfer } from '../useOwnershipTransfer';
import { readTransfer, changeTransfer, type TransferSnapshot } from '../ownershipTransferService';

jest.mock('../../../services/supabaseClient', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000030' }));
jest.mock('../ownershipTransferService', () => ({
  ...jest.requireActual('../ownershipTransferService'),
  readTransfer: jest.fn(), changeTransfer: jest.fn(), refreshTransferMembership: jest.fn(),
}));

const initial = useHomeStore.getState();
const originalAppState = AppState.currentState;
const owner = '00000000-0000-4000-8000-000000000001';
const recipient = '00000000-0000-4000-8000-000000000002';
const home = '00000000-0000-4000-8000-000000000010';
const offerId = '00000000-0000-4000-8000-000000000020';
const directory: TransferSnapshot = { offer: null, candidates: [{ id: recipient, name: 'person@example.invalid', homeName: 'Test home', role: 'Member' }] };
const listeners = new Set<() => void>();

/** Resolve asynchronous reads without leaving a pending test act scope. */
async function settle() { await act(async () => { await Promise.resolve(); }); }

/** Publish the same lifecycle event the native subscription receives. */
function visibility(state: AppStateStatus) {
  AppState.currentState = state;
  listeners.forEach((listener) => listener());
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, callback) => {
    const update = () => callback(AppState.currentState);
    listeners.add(update);
    return { remove: () => { listeners.delete(update); } };
  });
  useHomeStore.setState({ authenticatedUserId: owner, accountUserId: owner, activeMemberId: owner,
    accountHomeId: home, activeHomeId: home, sessionEpoch: 99, membershipReady: true, authTaskBlockingHome: false,
    household: [{ id: owner, userId: owner, name: 'Owner', role: 'Owner', status: 'home' },
      { id: recipient, userId: recipient, name: 'Member', role: 'Member', status: 'away' }] });
  jest.mocked(readTransfer).mockResolvedValue(directory);
  jest.mocked(changeTransfer).mockResolvedValue();
});
afterEach(() => {
  cleanup(); useHomeStore.setState(initial, true); AppState.currentState = originalAppState;
  jest.restoreAllMocks(); jest.clearAllTimers(); jest.useRealTimers(); listeners.clear();
});

test('double tapping sends one reviewed offer and leaves membership role untouched', async () => {
  let finish!: () => void;
  jest.mocked(changeTransfer).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const result = renderHook(() => useOwnershipTransfer(true)); await settle();
  let first!: Promise<void>;
  act(() => { first = result.result.current.send(recipient); void result.result.current.send(recipient); });
  expect(changeTransfer).toHaveBeenCalledTimes(1);
  expect(result.result.current.busy).toBe(true);
  expect(useHomeStore.getState().household[0].role).toBe('Owner');
  await act(async () => { finish(); await first; });
  expect(result.result.current.notice).toContain('Offer sent');
});

test('a held selection cannot send after membership role changes or navigation blur', async () => {
  const screen = renderHook<ReturnType<typeof useOwnershipTransfer>, { focused: boolean }>(({ focused }) => useOwnershipTransfer(focused), { initialProps: { focused: true } }); await settle();
  const held = screen.result.current.send;
  act(() => { useHomeStore.setState({ household: [useHomeStore.getState().household[0]] }); });
  await act(async () => { await held(recipient); });
  expect(changeTransfer).not.toHaveBeenCalled();
  await settle();
  const next = screen.result.current.send;
  screen.rerender({ focused: false });
  await act(async () => { await next(recipient); });
  expect(changeTransfer).not.toHaveBeenCalled();
  expect(screen.result.current.candidates).toEqual([]);
});

test('background clears a review and discards an in-flight private directory', async () => {
  let finish!: (data: TransferSnapshot) => void;
  jest.mocked(readTransfer).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const screen = renderHook(() => useOwnershipTransfer(true)); await settle();
  act(() => visibility('background'));
  await act(async () => { finish(directory); });
  expect(screen.result.current.candidates).toEqual([]);
  expect(screen.result.current.scopeKey).toBeNull();
  act(() => visibility('active')); await settle();
  expect(readTransfer).toHaveBeenCalledTimes(2);
});

test('an ambiguous write clears actions until a new server read is explicitly requested', async () => {
  jest.mocked(changeTransfer).mockRejectedValueOnce(new Error('Unconfirmed delivery'));
  const screen = renderHook(() => useOwnershipTransfer(true)); await settle();
  await act(async () => { await screen.result.current.send(recipient); });
  expect(screen.result.current.error).toBe('Unconfirmed delivery');
  expect(screen.result.current.candidates).toEqual([]);
  await act(async () => { await screen.result.current.send(recipient); });
  expect(changeTransfer).toHaveBeenCalledTimes(1);
  await act(async () => { await screen.result.current.refresh(); });
  expect(screen.result.current.candidates).toEqual(directory.candidates);
});

test('expiry refreshes the offer without a store event and blocks its old acceptance callback', async () => {
  useHomeStore.setState({ authenticatedUserId: recipient, accountUserId: recipient, activeMemberId: recipient });
  jest.mocked(readTransfer).mockResolvedValueOnce({ candidates: [], offer: { id: offerId, homeName: 'Test home',
    fromName: 'The current Owner', toName: 'person@example.invalid', expiresAt: new Date(Date.now() + 500).toISOString(), direction: 'incoming' } })
    .mockResolvedValue({ candidates: [], offer: null });
  const screen = renderHook(() => useOwnershipTransfer(true)); await settle();
  const held = screen.result.current.respond;
  await act(async () => { jest.advanceTimersByTime(501); });
  await act(async () => { await held(offerId, 'accept'); });
  expect(changeTransfer).not.toHaveBeenCalled();
  expect(screen.result.current.offer).toBeNull();
});
