import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useHomeStore } from '../../store/useHomeStore';
import { useProfileWorkspace } from './useProfileWorkspace';
import { discardPreparedPortrait, prepareProfilePortrait } from './profilePortrait';

jest.mock('../../services/supabaseClient', () => ({ supabase: null }));
jest.mock('../../config/runtimeMode', () => ({ runtimePolicy: { allowUnauthenticatedDemo: true } }));
jest.mock('../../security/biometricConfirmation', () => ({ confirmProtectedAccess: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('./profilePortrait', () => ({ prepareProfilePortrait: jest.fn(), discardPreparedPortrait: jest.fn() }));

const initial = useHomeStore.getState();
const selected = { canceled: false as const, assets: [{ uri: 'file:///picker/guest.jpg', width: 512, height: 512 }] };
const savedPhoto = 'vantahome-portrait:11111111-1111-4111-8111-111111111111.jpg';

/** Control delayed selection/copy completion without invoking the native photo library. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({ status: 'granted' } as never);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(selected);
  jest.mocked(prepareProfilePortrait).mockResolvedValue(savedPhoto);
  useHomeStore.setState({ ...initial, authenticatedUserId: null, accountUserId: null, activeHomeId: null, accountHomeId: null,
    sessionEpoch: 1, membershipReady: false, activeMemberId: 'demo-owner',
    household: [{ id: 'demo-owner', name: 'Demo owner', role: 'Owner', status: 'home' }],
  });
});
afterEach(() => { useHomeStore.setState(initial, true); jest.restoreAllMocks(); });

/** Fill the public invitation draft while preserving its explicit simulation context. */
function setup() {
  const hook = renderHook(() => useProfileWorkspace({ goBack: jest.fn() }));
  act(() => {
    hook.result.current.setNewMemberName('Demo guest');
    hook.result.current.setNewMemberEmail('guest@example.test');
    hook.result.current.setNewMemberRole('Member');
  });
  return hook;
}

test('prepares a durable photo only when the demo member is saved', async () => {
  const { result } = setup();
  await act(async () => { await result.current.pickHouseholdAvatar(); });
  expect(result.current.newMemberAvatar).toBe(selected.assets[0].uri);
  expect(prepareProfilePortrait).not.toHaveBeenCalled();
  await act(async () => { await result.current.handleAddMember(); });
  expect(prepareProfilePortrait).toHaveBeenCalledWith(selected.assets[0]);
  expect(useHomeStore.getState().household.find(member => member.name === 'Demo guest')?.avatarUri).toBe(savedPhoto);
  expect(result.current.newMemberAvatar).toBe('');
  expect(Alert.alert).toHaveBeenCalledWith('Invite added locally', expect.any(String));
});

test('removed selections never create orphaned durable photos', async () => {
  const { result } = setup();
  await act(async () => { await result.current.pickHouseholdAvatar(); });
  act(() => { result.current.setNewMemberAvatar(''); });
  await act(async () => { await result.current.handleAddMember(); });
  expect(prepareProfilePortrait).not.toHaveBeenCalled();
  expect(useHomeStore.getState().household.find(member => member.name === 'Demo guest')?.avatarUri).toBe('');
});

test('a late picker cannot attach a previous session photo to another account', async () => {
  const pending = deferred<typeof selected>();
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockReturnValueOnce(pending.promise);
  const { result } = setup();
  let picking!: Promise<void>;
  await act(async () => { picking = result.current.pickHouseholdAvatar(); });
  act(() => { useHomeStore.setState({ sessionEpoch: 2 }); });
  await act(async () => { pending.resolve(selected); await picking; });
  expect(result.current.newMemberAvatar).toBe('');
  expect(prepareProfilePortrait).not.toHaveBeenCalled();
});

test('duplicate confirmation taps produce one save, and a changed session discards its prepared file', async () => {
  const pending = deferred<string>();
  jest.mocked(prepareProfilePortrait).mockReturnValueOnce(pending.promise);
  const { result } = setup();
  await act(async () => { await result.current.pickHouseholdAvatar(); });
  let first!: ReturnType<typeof result.current.handleAddMember>;
  let second!: ReturnType<typeof result.current.handleAddMember>;
  await act(async () => { first = result.current.handleAddMember(); second = result.current.handleAddMember(); });
  expect(prepareProfilePortrait).toHaveBeenCalledTimes(1);
  act(() => { useHomeStore.setState({ sessionEpoch: 2 }); });
  await act(async () => { pending.resolve(savedPhoto); await first; await second; });
  expect(useHomeStore.getState().household).toHaveLength(1);
  expect(discardPreparedPortrait).toHaveBeenCalledWith(savedPhoto);
  expect(result.current.inviteLoading).toBe(false);
});

test('storage failure rolls back the local member and removes the unreferenced prepared photo', async () => {
  const original = useHomeStore.getState().addHouseholdMember;
  useHomeStore.setState({ addHouseholdMember: async member => {
    await original(member);
    throw new Error('Device storage unavailable');
  } });
  const { result } = setup();
  await act(async () => { await result.current.pickHouseholdAvatar(); });
  await act(async () => { await result.current.handleAddMember(); });
  expect(useHomeStore.getState().household).toHaveLength(1);
  expect(discardPreparedPortrait).toHaveBeenCalledWith(savedPhoto);
  expect(Alert.alert).toHaveBeenCalledWith('Invitation not saved', 'Device storage unavailable');
  expect(Alert.alert).not.toHaveBeenCalledWith('Invite added locally', expect.any(String));
});
