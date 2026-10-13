import { act, renderHook } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useHomeStore } from '../../store/useHomeStore';
import { useProfileDraft } from './useProfileDraft';
import { discardPreparedPortrait, prepareProfilePortrait } from './profilePortrait';
import { useAccountPreferences } from '../account/useAccountPreferences';

jest.mock('../../services/supabaseClient', () => ({ supabase: {} }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('./profilePortrait', () => ({ prepareProfilePortrait: jest.fn(), discardPreparedPortrait: jest.fn() }));

const seed = useHomeStore.getState();
const selected = { canceled: false as const, assets: [{ uri: 'file:///cache/chosen.jpg', width: 512, height: 512 }] };
const savedPhoto = 'vantahome-portrait:11111111-1111-4111-8111-111111111111.jpg';

/** Hold native picker/copy completion to exercise account and unmount races. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({ status: 'granted' } as never);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(selected);
  jest.mocked(prepareProfilePortrait).mockResolvedValue(savedPhoto);
  useHomeStore.setState({ ...seed, authenticatedUserId: 'alice', accountUserId: 'alice',
    activeHomeId: 'home', accountHomeId: 'home', membershipReady: true, sessionEpoch: 1,
    profile: { name: 'Alice', email: 'login@example.test', avatarUri: 'file:///old.jpg', tempUnit: 'C', timeFormat: '12h' } });
});
afterEach(() => jest.restoreAllMocks());

test('saves edited local fields without overwriting a newer preference or verified login email', async () => {
  const onSaved = jest.fn();
  const { result } = renderHook(() => useProfileDraft(onSaved));
  act(() => { result.current.setName('Alice Updated'); result.current.setEmail('different@example.test'); });
  act(() => { useHomeStore.getState().setProfile({ tempUnit: 'F', timeFormat: '24h', email: 'verified@example.test' }); });
  await act(async () => { await result.current.onSave(); });
  expect(useHomeStore.getState().profile).toMatchObject({ name: 'Alice Updated', tempUnit: 'F', timeFormat: '24h', email: 'verified@example.test' });
  expect(onSaved).toHaveBeenCalledTimes(1);
});

test('publishes a durable selected portrait only after preparation succeeds', async () => {
  const onSaved = jest.fn();
  const { result } = renderHook(() => useProfileDraft(onSaved));
  await act(async () => { await result.current.pickAvatar(); });
  expect(useHomeStore.getState().profile.avatarUri).toBe('file:///old.jpg');
  await act(async () => { await result.current.onSave(); });
  expect(prepareProfilePortrait).toHaveBeenCalledWith(selected.assets[0]);
  expect(useHomeStore.getState().profile.avatarUri).toBe(savedPhoto);
  expect(onSaved).toHaveBeenCalledTimes(1);
});

test('a failed portrait copy keeps the saved photo and the editor open with feedback', async () => {
  const onSaved = jest.fn();
  jest.mocked(prepareProfilePortrait).mockRejectedValueOnce(new Error('Storage full'));
  const { result } = renderHook(() => useProfileDraft(onSaved));
  await act(async () => { await result.current.pickAvatar(); });
  await act(async () => { await result.current.onSave(); });
  expect(useHomeStore.getState().profile.avatarUri).toBe('file:///old.jpg');
  expect(result.current.profileFeedback).toBe('Profile not saved. Storage full');
  expect(onSaved).not.toHaveBeenCalled();
});

test('a picker finishing after an account switch cannot disclose its selection to the next user', async () => {
  const pending = deferred<typeof selected>();
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useProfileDraft(jest.fn()));
  let selection!: Promise<void>;
  await act(async () => { selection = result.current.pickAvatar(); });
  act(() => { useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 2,
    profile: { name: 'Bob', avatarUri: '' } }); });
  await act(async () => { pending.resolve(selected); await selection; });
  expect(result.current.name).toBe('Bob');
  expect(result.current.avatarUri).toBe('');
  expect(prepareProfilePortrait).not.toHaveBeenCalled();
});

test('a delayed save discards its new file after an account switch without touching the new profile', async () => {
  const pending = deferred<string>();
  jest.mocked(prepareProfilePortrait).mockReturnValueOnce(pending.promise);
  const onSaved = jest.fn();
  const { result } = renderHook(() => useProfileDraft(onSaved));
  await act(async () => { await result.current.pickAvatar(); });
  let saving!: Promise<void>;
  act(() => { saving = result.current.onSave(); });
  act(() => { useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 2,
    profile: { name: 'Bob', avatarUri: '' } }); });
  await act(async () => { pending.resolve(savedPhoto); await saving; });
  expect(useHomeStore.getState().profile).toEqual({ name: 'Bob', avatarUri: '' });
  expect(discardPreparedPortrait).toHaveBeenCalledWith(savedPhoto);
  expect(onSaved).not.toHaveBeenCalled();
});

test('unmounted editor callbacks cannot save or open a picker', async () => {
  const onSaved = jest.fn();
  const { result, unmount } = renderHook(() => useProfileDraft(onSaved));
  const old = result.current;
  unmount();
  await old.pickAvatar();
  await old.onSave();
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

test('removing a selected photo clears the pending asset instead of copying it on save', async () => {
  const { result } = renderHook(() => useProfileDraft(jest.fn()));
  await act(async () => { await result.current.pickAvatar(); });
  act(() => { result.current.setAvatarUri(''); });
  await act(async () => { await result.current.onSave(); });
  expect(useHomeStore.getState().profile.avatarUri).toBe('');
  expect(prepareProfilePortrait).not.toHaveBeenCalled();
});

test('denied photo access keeps the current portrait and reports recovery', async () => {
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValueOnce({ status: 'denied' } as never);
  const { result } = renderHook(() => useProfileDraft(jest.fn()));
  await act(async () => { await result.current.pickAvatar(); });
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  expect(result.current.avatarUri).toBe('file:///old.jpg');
  expect(result.current.profileFeedback).toContain('Settings');
});

test('waits for durable storage and keeps the editor open with its draft after a write failure', async () => {
  const pending = deferred<void>();
  const original = useHomeStore.getState().setProfile;
  const save = jest.fn(original).mockImplementationOnce(patch => {
    void original(patch);
    return pending.promise.then(() => { throw new Error('Device storage unavailable'); });
  });
  useHomeStore.setState({ setProfile: save });
  const onSaved = jest.fn();
  const { result } = renderHook(() => useProfileDraft(onSaved));
  act(() => { result.current.setName('New draft name'); });
  let saving!: Promise<void>;
  act(() => { saving = result.current.onSave(); });
  expect(onSaved).not.toHaveBeenCalled();
  expect(result.current.profileBusy).toBe(true);
  await act(async () => { pending.resolve(); await saving; });
  expect(useHomeStore.getState().profile.name).toBe('Alice');
  expect(result.current.name).toBe('New draft name');
  expect(onSaved).not.toHaveBeenCalled();
  expect(result.current.profileFeedback).toBe('Profile not saved. Device storage unavailable');
});

test('an account switch while storage completes cannot navigate the new session away', async () => {
  const pending = deferred<void>();
  const original = useHomeStore.getState().setProfile;
  useHomeStore.setState({ setProfile: patch => { void original(patch); return pending.promise; } });
  const onSaved = jest.fn();
  const { result } = renderHook(() => useProfileDraft(onSaved));
  act(() => { result.current.setName('Alice update'); });
  let saving!: Promise<void>;
  act(() => { saving = result.current.onSave(); });
  act(() => { useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 2,
    profile: { name: 'Bob' } }); });
  await act(async () => { pending.resolve(); await saving; });
  expect(onSaved).not.toHaveBeenCalled();
  expect(useHomeStore.getState().profile).toEqual({ name: 'Bob' });
});

test('a failed save restores its name after the editor closes without late alerts or navigation', async () => {
  const pending = deferred<void>();
  const original = useHomeStore.getState().setProfile;
  useHomeStore.setState({ setProfile: jest.fn(original).mockImplementationOnce(async patch => {
    await original(patch);
    await pending.promise;
    throw new Error('Storage unavailable');
  }) });
  const onSaved = jest.fn();
  const { result, unmount } = renderHook(() => useProfileDraft(onSaved));
  act(() => { result.current.setName('Unsaved name'); });
  let saving!: Promise<void>;
  act(() => { saving = result.current.onSave(); });
  unmount();
  await act(async () => { pending.resolve(); await saving; });
  expect(useHomeStore.getState().profile.name).toBe('Alice');
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

test('a later preferences editor owns its successfully saved value when an older profile save fails', async () => {
  const pending = deferred<void>();
  const original = useHomeStore.getState().setProfile;
  useHomeStore.setState({ setProfile: jest.fn(original).mockImplementationOnce(async patch => {
    await original(patch);
    await pending.promise;
    throw new Error('Earlier write failed');
  }) });
  const editor = renderHook(() => useProfileDraft(jest.fn()));
  act(() => { editor.result.current.setTempUnit('F'); });
  let saving!: Promise<void>;
  act(() => { saving = editor.result.current.onSave(); });
  editor.unmount();
  const preferences = renderHook(() => useAccountPreferences());
  await act(async () => { await preferences.result.current.setDisplayPreferences({ tempUnit: 'C' }); });
  await act(async () => { await preferences.result.current.setDisplayPreferences({ tempUnit: 'F' }); });
  await act(async () => { pending.resolve(); await saving; });
  expect(useHomeStore.getState().profile.tempUnit).toBe('F');
  expect(preferences.result.current.preferenceError).toBeNull();
});

test('a failed portrait save restores the earlier photo after unmount and discards only its unused new file', async () => {
  const pending = deferred<void>();
  const original = useHomeStore.getState().setProfile;
  useHomeStore.setState({ setProfile: jest.fn(original).mockImplementationOnce(async patch => {
    await original(patch);
    await pending.promise;
    throw new Error('Storage unavailable');
  }) });
  const { result, unmount } = renderHook(() => useProfileDraft(jest.fn()));
  await act(async () => { await result.current.pickAvatar(); });
  let saving!: Promise<void>;
  await act(async () => { saving = result.current.onSave(); });
  expect(useHomeStore.getState().profile.avatarUri).toBe(savedPhoto);
  unmount();
  await act(async () => { pending.resolve(); await saving; });
  expect(useHomeStore.getState().profile.avatarUri).toBe('file:///old.jpg');
  expect(discardPreparedPortrait).toHaveBeenCalledTimes(1);
  expect(discardPreparedPortrait).toHaveBeenCalledWith(savedPhoto);
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('a late failed portrait write does not delete a published photo after switching accounts', async () => {
  const pending = deferred<void>();
  const original = useHomeStore.getState().setProfile;
  useHomeStore.setState({ setProfile: jest.fn(original).mockImplementationOnce(async patch => {
    await original(patch);
    await pending.promise;
    throw new Error('Earlier account storage failed');
  }) });
  const { result } = renderHook(() => useProfileDraft(jest.fn()));
  await act(async () => { await result.current.pickAvatar(); });
  let saving!: Promise<void>;
  await act(async () => { saving = result.current.onSave(); });
  expect(useHomeStore.getState().profile.avatarUri).toBe(savedPhoto);
  act(() => { useHomeStore.setState({ authenticatedUserId: 'bob', accountUserId: 'bob', sessionEpoch: 2,
    profile: { name: 'Bob', avatarUri: 'file:///bob.jpg' } }); });
  await act(async () => { pending.resolve(); await saving; });
  expect(useHomeStore.getState().profile).toEqual({ name: 'Bob', avatarUri: 'file:///bob.jpg' });
  expect(discardPreparedPortrait).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

test('a delayed successful photo save never deletes a portrait another current household member uses', async () => {
  const original = useHomeStore.getState().profile.avatarUri;
  useHomeStore.setState({ household: [{ id: 'other', userId: 'other', name: 'Other member',
    role: 'Member', status: 'home', avatarUri: original }] });
  const { result } = renderHook(() => useProfileDraft(jest.fn()));
  await act(async () => { await result.current.pickAvatar(); });
  await act(async () => { await result.current.onSave(); });
  expect(discardPreparedPortrait).not.toHaveBeenCalled();
  expect(useHomeStore.getState().profile.avatarUri).toBe(savedPhoto);
});

test('a cleanup warning rebases the saved draft so retry does not recopy or overwrite newer fields', async () => {
  jest.mocked(discardPreparedPortrait).mockRejectedValueOnce(new Error('Old photo locked'));
  const onSaved = jest.fn();
  const { result } = renderHook(() => useProfileDraft(onSaved));
  await act(async () => { await result.current.pickAvatar(); });
  act(() => { result.current.setName('Saved name'); });
  await act(async () => { await result.current.onSave(); });
  expect(result.current.profileFeedback).toContain('Profile saved.');
  expect(onSaved).not.toHaveBeenCalled();
  await act(async () => { await useHomeStore.getState().setProfile({ name: 'Newer name' }); });
  await act(async () => { await result.current.onSave(); });
  expect(prepareProfilePortrait).toHaveBeenCalledTimes(1);
  expect(useHomeStore.getState().profile.name).toBe('Newer name');
  expect(onSaved).toHaveBeenCalledTimes(1);
});

test('web picker failures expose rendered feedback and a new account never sees it', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockRejectedValueOnce(new Error('Photo selection failed'));
  const { result } = renderHook(() => useProfileDraft(jest.fn()));
  await act(async () => { await result.current.pickAvatar(); });
  expect(result.current.profileFeedback).toBe('Photo unavailable. Photo selection failed');
  expect(Alert.alert).not.toHaveBeenCalled();
  act(() => { useHomeStore.setState({ sessionEpoch: 2 }); });
  expect(result.current.profileFeedback).toBeNull();
});
