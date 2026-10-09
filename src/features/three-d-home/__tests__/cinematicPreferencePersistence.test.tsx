import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { CINEMATIC_HOST_PREFERENCE_KEY, CinematicPreferencePersistence } from '../cinematicPreferencePersistence';
import { useHomeChromePreferences } from '../useHomeChromePreferences';

/** Drain chained persistence work without sleeps or real disk access. */
async function settle(): Promise<void> { for (let index = 0; index < 12; index += 1) await Promise.resolve(); }

/** Expose only the stable preference snapshot so mount/hydration behavior can be tested. */
function PreferenceProbe({ persistence }: { persistence: CinematicPreferencePersistence }) {
  const state = useHomeChromePreferences(persistence);
  return <Text>{`${state.ready}:${state.idleEnabled}:${state.preferenceError}`}</Text>;
}

test('new storage defaults to the intended on preference and a stored off choice survives remount and cold restart', async () => {
  const stored = new Map<string, string>();
  const storage = { getItem: jest.fn(async (key: string) => stored.get(key) ?? null), setItem: jest.fn(async (key: string, value: string) => { stored.set(key, value); }) };
  const first = new CinematicPreferencePersistence(storage);
  const screen = render(<PreferenceProbe persistence={first} />);
  await act(settle);
  expect(screen.getByText('true:true:false')).toBeTruthy();
  act(() => first.save(false));
  await act(settle);
  screen.unmount();
  const reopened = render(<PreferenceProbe persistence={first} />);
  expect(reopened.getByText('true:false:false')).toBeTruthy();
  reopened.unmount();
  const cold = new CinematicPreferencePersistence(storage);
  await cold.load();
  expect(cold.getSnapshot()).toEqual({ ready: true, idleEnabled: false, preferenceError: false });
  expect(storage.setItem).toHaveBeenCalledWith(CINEMATIC_HOST_PREFERENCE_KEY, '{"version":1,"idleEnabled":false}');
});

test.each(['malformed', 'read-failure'])('fails off with a visible preference error after %s', async (failure) => {
  const storage = { getItem: jest.fn(() => failure === 'malformed' ? Promise.resolve('{"idleEnabled":true,"token":"x"}') : Promise.reject(new Error('Unavailable'))), setItem: jest.fn() };
  const persistence = new CinematicPreferencePersistence(storage);
  await persistence.load();
  expect(persistence.getSnapshot()).toEqual({ ready: true, idleEnabled: false, preferenceError: true });
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('retains a session choice on write failure and reports recovery only after a later successful write', async () => {
  const storage = { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockRejectedValueOnce(new Error('Full')).mockResolvedValue(undefined) };
  const persistence = new CinematicPreferencePersistence(storage);
  await persistence.load(); persistence.save(false); await settle();
  expect(persistence.getSnapshot()).toEqual({ ready: true, idleEnabled: false, preferenceError: true });
  persistence.save(true); await settle();
  expect(persistence.getSnapshot()).toEqual({ ready: true, idleEnabled: true, preferenceError: false });
});

test('serializes rapid writes and finishes the latest accepted choice after subscribers leave', async () => {
  let finishWrite = () => {};
  const storage = { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finishWrite = resolve; })).mockResolvedValue(undefined) };
  const persistence = new CinematicPreferencePersistence(storage);
  const unsubscribe = persistence.subscribe(jest.fn());
  await persistence.load(); persistence.save(false); await settle();
  persistence.save(true); persistence.save(false); unsubscribe();
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  finishWrite(); await settle();
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(storage.setItem).toHaveBeenLastCalledWith(CINEMATIC_HOST_PREFERENCE_KEY, '{"version":1,"idleEnabled":false}');
  expect(persistence.getSnapshot()).toEqual({ ready: true, idleEnabled: false, preferenceError: false });
});

test('never lets late hydration overwrite a newer explicit local choice', async () => {
  let finishRead = (_value: string | null) => {};
  const storage = { getItem: jest.fn(() => new Promise<string | null>((resolve) => { finishRead = resolve; })), setItem: jest.fn().mockResolvedValue(undefined) };
  const persistence = new CinematicPreferencePersistence(storage);
  const loading = persistence.load(); await settle();
  persistence.save(true);
  finishRead('{"version":1,"idleEnabled":false}'); await loading; await settle();
  expect(persistence.getSnapshot()).toEqual({ ready: true, idleEnabled: true, preferenceError: false });
  expect(storage.setItem).toHaveBeenLastCalledWith(CINEMATIC_HOST_PREFERENCE_KEY, '{"version":1,"idleEnabled":true}');
});
