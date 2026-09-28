import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { SimulationPersistence } from '../simulationPersistence';

/** Drain persistence microtasks without relying on wall-clock delays. */
async function settle(): Promise<void> { for (let index = 0; index < 12; index += 1) await Promise.resolve(); }

test('adds gas devices on upgrade without resetting the previous 90-device simulation', async () => {
  const legacy = createDefaultSimulationSnapshot();
  delete legacy.deviceStates['utility-gas-meter'];
  delete legacy.deviceStates['kitchen-gas-leak'];
  legacy.deviceStates['master-bedside-left'] = { on: false, level: 23, settings: { color: '#FF9AA2', lightColorMode: 'color' } };
  legacy.deviceStates['master-blinds'] = { on: true, level: 37 };
  legacy.lightingMode = 'night';
  legacy.night = true;
  const storage = { getItem: jest.fn().mockResolvedValue(JSON.stringify({ channel: 'vantahome-simulation', version: 1, type: 'snapshot', state: legacy })), setItem: jest.fn() };
  const persistence = new SimulationPersistence(storage);
  const status = jest.fn();
  persistence.subscribe('demo', status);
  const restored = await persistence.load('demo');
  expect(restored.deviceStates['master-bedside-left']).toEqual(legacy.deviceStates['master-bedside-left']);
  expect(restored.deviceStates['master-blinds']).toEqual(legacy.deviceStates['master-blinds']);
  expect(restored.lightingMode).toBe('night');
  expect(restored.deviceStates['utility-gas-meter'].on).toBe(true);
  expect(restored.deviceStates['kitchen-gas-leak'].on).toBe(true);
  expect(Object.keys(restored.deviceStates)).toHaveLength(92);
  expect(status).toHaveBeenLastCalledWith('saved');
});

test('validates stored snapshots and exposes corrupt or unavailable storage', async () => {
  const storage = { getItem: jest.fn().mockResolvedValue('{"token":"private"}'), setItem: jest.fn() };
  const persistence = new SimulationPersistence(storage);
  const statuses = jest.fn();
  persistence.subscribe('demo', statuses);
  expect(await persistence.load('demo')).toEqual(createDefaultSimulationSnapshot());
  expect(statuses).toHaveBeenLastCalledWith('error');
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('serializes writes, coalesces newer changes, and retains them across immediate reopen', async () => {
  let finishFirstWrite: () => void = () => undefined;
  const storage = {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirstWrite = resolve; })).mockResolvedValue(undefined),
  };
  const persistence = new SimulationPersistence(storage);
  const original = await persistence.load('demo');
  persistence.save('demo', { ...original, night: true });
  await settle();
  persistence.save('demo', { ...original, motionDisabled: true });
  persistence.save('demo', { ...original, motionDisabled: true, lightingMode: 'night', night: true });
  const reopened = await persistence.load('demo');
  expect(reopened.motionDisabled).toBe(true);
  expect(reopened.lightingMode).toBe('night');
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  finishFirstWrite();
  await settle();
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(JSON.parse(storage.setItem.mock.calls[1][1]).state).toEqual(reopened);
});

test('restores after a cold restart and keeps account previews separate from the demo', async () => {
  const saved = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (key: string) => saved.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { saved.set(key, value); }),
  };
  const first = new SimulationPersistence(storage);
  const state = await first.load('demo');
  first.save('demo', { ...state, motionDisabled: true });
  await settle();
  const restarted = new SimulationPersistence(storage);
  expect((await restarted.load('demo')).motionDisabled).toBe(true);
  expect((await restarted.load('preview:account-a')).motionDisabled).toBe(false);
});

test('retains in-memory edits after a failed write and reports recovery on the next edit', async () => {
  const storage = { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockRejectedValueOnce(new Error('Full')).mockResolvedValue(undefined) };
  const persistence = new SimulationPersistence(storage);
  const statuses = jest.fn();
  persistence.subscribe('demo', statuses);
  const state = await persistence.load('demo');
  persistence.save('demo', { ...state, motionDisabled: true });
  await settle();
  expect(statuses).toHaveBeenLastCalledWith('error');
  expect((await persistence.load('demo')).motionDisabled).toBe(true);
  persistence.save('demo', { ...state, motionDisabled: true, night: true });
  await settle();
  expect(statuses).toHaveBeenLastCalledWith('saved');
});
