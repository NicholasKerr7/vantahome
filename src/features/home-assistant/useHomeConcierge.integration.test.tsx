import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { useHomeStore } from '../../store/useHomeStore';
import { virtualSceneHome } from '../scenes/sceneTestFixtures';
import { createDefaultSimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { conciergeAvailability, requestConcierge } from './conciergeService';
import { useHomeConcierge } from './useHomeConcierge';
import { useSimulationControls } from '../three-d-home/useSimulationControls';

// Exercise the actual simulation hook, client, session and persistence together;
// only the external cloud boundary and native storage adapter are substituted.
jest.mock('./conciergeService', () => ({
  ...jest.requireActual('./conciergeService'), conciergeAvailability: jest.fn(), requestConcierge: jest.fn(),
}));

const original = useHomeStore.getState();
let sequence = 0;

/** Drain the asynchronous storage, session handshake and React notification work. */
async function settle(): Promise<void> {
  await act(async () => { for (let index = 0; index < 32; index += 1) await Promise.resolve(); });
}

/** Give each test its own persisted scope without reaching into persistence internals. */
function prepareOwner(realtimeEnabled = false): void {
  const homeId = `assistant-integration-home-${++sequence}`;
  useHomeStore.setState(virtualSceneHome({
    activeHomeId: homeId, accountHomeId: homeId,
    realtime: { enabled: realtimeEnabled, useMqtt: false, wsUrl: '' },
  }), true);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.mocked(conciergeAvailability).mockResolvedValue(true);
  prepareOwner();
});

afterEach(() => {
  useHomeStore.setState(original, true);
  jest.restoreAllMocks();
});

test('hydrates an Owner home through the real simulation bridge before checking cloud availability', async () => {
  const { result, unmount } = renderHook(useHomeConcierge);
  expect(result.current.context.available).toBe(false);
  await settle();
  expect(result.current.context.available).toBe(true);
  expect(result.current.context.brief.deviceCount).toBeGreaterThan(0);
  expect(result.current.canAsk).toBe(true);
  expect(conciergeAvailability).toHaveBeenCalledTimes(1);
  expect(requestConcierge).not.toHaveBeenCalled();
  unmount();
});

test('reopens a hydrated simulation under StrictMode without losing its control subscription', async () => {
  const first = renderHook(useHomeConcierge, { wrapper: React.StrictMode });
  await settle();
  expect(first.result.current.canAsk).toBe(true);
  first.unmount();
  const second = renderHook(useHomeConcierge, { wrapper: React.StrictMode });
  await settle();
  expect(second.result.current.canAsk).toBe(true);
  second.unmount();
});

test('accepts the authenticated account transport default when no hub endpoint is configured', async () => {
  prepareOwner(true);
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  expect(result.current.context.reason).toBeNull();
  expect(result.current.canAsk).toBe(true);
  expect(conciergeAvailability).toHaveBeenCalledTimes(1);
  unmount();
});

test('Check connection rehydrates a failed saved simulation without replacing its device settings', async () => {
  const saved = createDefaultSimulationSnapshot();
  saved.deviceStates['living-light'] = { ...saved.deviceStates['living-light'], on: true, level: 37 };
  const read = jest.spyOn(AsyncStorage, 'getItem')
    .mockRejectedValueOnce(new Error('Temporary storage read failure'))
    .mockResolvedValue(JSON.stringify({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state: saved }));
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  expect(result.current.context.available).toBe(false);
  expect(conciergeAvailability).not.toHaveBeenCalled();

  act(() => { result.current.retryAvailability(); });
  await settle();

  expect(read).toHaveBeenCalledTimes(2);
  expect(result.current.canAsk).toBe(true);
  expect(result.current.context.devices.find((device) => device.id === 'registry-device:living-light')?.values)
    .toMatchObject({ isOn: true, brightness: 37 });
  expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(expect.stringMatching(/^vantahome-3d-simulation:/), expect.anything());
  expect(requestConcierge).not.toHaveBeenCalled();
  unmount();
});

test('keeps malformed saved controls closed across retries without overwriting them or contacting AI', async () => {
  const read = jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue('{ unread saved controls');
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  expect(result.current.context.available).toBe(false);

  act(() => { result.current.retryAvailability(); });
  await settle();

  expect(read).toHaveBeenCalledTimes(2);
  expect(result.current.canAsk).toBe(false);
  expect(conciergeAvailability).not.toHaveBeenCalled();
  expect(requestConcierge).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(expect.stringMatching(/^vantahome-3d-simulation:/), expect.anything());
  unmount();
});

test('discards a late storage retry after switching households and uses only the new saved scope', async () => {
  const oldSaved = createDefaultSimulationSnapshot();
  oldSaved.deviceStates['living-light'] = { ...oldSaved.deviceStates['living-light'], on: true, level: 37 };
  const nextSaved = createDefaultSimulationSnapshot();
  nextSaved.deviceStates['living-light'] = { ...nextSaved.deviceStates['living-light'], on: true, level: 81 };
  let finishOldRead!: (raw: string) => void;
  const pendingOldRead = new Promise<string>((resolve) => { finishOldRead = resolve; });
  jest.spyOn(AsyncStorage, 'getItem')
    .mockRejectedValueOnce(new Error('Temporary storage read failure'))
    .mockReturnValueOnce(pendingOldRead)
    .mockResolvedValue(JSON.stringify({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state: nextSaved }));
  const { result, unmount } = renderHook(useHomeConcierge);
  await settle();
  act(() => { result.current.retryAvailability(); });
  await settle();
  expect(result.current.canAsk).toBe(false);

  act(() => { prepareOwner(); });
  await settle();
  const currentHomeId = useHomeStore.getState().activeHomeId;
  expect(result.current.canAsk).toBe(true);
  await act(async () => {
    finishOldRead(JSON.stringify({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state: oldSaved }));
  });
  await settle();

  expect(result.current.context.devices.find((device) => device.id === 'registry-device:living-light')?.values)
    .toMatchObject({ isOn: true, brightness: 81 });
  expect(conciergeAvailability).toHaveBeenCalledTimes(1);
  expect(jest.mocked(conciergeAvailability).mock.calls[0][0].homeId).toBe(currentHomeId);
  expect(requestConcierge).not.toHaveBeenCalled();
  unmount();
});

test('a scoped preview uses real hydrated controls without writing a scene or changing the saved simulation', async () => {
  const { result, unmount } = renderHook(() => ({
    assistant: useHomeConcierge({ roomId: 'registry-room:living' }), controls: useSimulationControls(),
  }));
  await settle();
  act(() => { result.current.controls.client.setSetting('living-light', 'brightness', 37); });
  await settle();
  jest.mocked(requestConcierge).mockResolvedValue({ title: 'A calm room', answer: 'Review a brightness change.',
    deviceIds: ['registry-device:living-light'], scene: { name: 'Calm room', explanation: 'A softer setting.',
      actions: [{ deviceId: 'registry-device:living-light', values: { brightness: 25 } }] } });
  await act(async () => { await result.current.assistant.ask('Draft only Living room brightness at 25%'); });
  const before = JSON.stringify(result.current.controls.client.getSnapshot());
  jest.mocked(AsyncStorage.setItem).mockClear();
  const preview = result.current.assistant.preparePreview()!;
  expect(preview.context.devices.every((device) => device.roomId === 'registry-room:living')).toBe(true);
  expect(preview.snapshot.state.deviceStates['living-light'].level).toBe(37);
  preview.snapshot.state.deviceStates['living-light'].level = 25;
  await settle();
  expect(JSON.stringify(result.current.controls.client.getSnapshot())).toBe(before);
  expect(useHomeStore.getState().scenes).toEqual([]);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  unmount();
});
