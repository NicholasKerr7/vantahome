import { createStore } from 'zustand/vanilla';
import { useHomeStore, type HomeState } from '../../../store/useHomeStore';
import { createDefaultSimulationSnapshot, mergeSimulationChanges, parseSimulationRequest, type SimulationSnapshotMessage } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { SimulationControlClient } from '../simulationControlClient';
import { SimulationPersistence } from '../simulationPersistence';
import { SimulationSession } from '../simulationSession';

/** Drain the hydration, ordered transport and coalesced disk-save queues. */
async function settle(): Promise<void> { for (let index = 0; index < 24; index++) await Promise.resolve(); }

test('rebases rapid edits over older acknowledgements and rejects pre-hydration input', () => {
  let deliver!: (message: SimulationSnapshotMessage) => void;
  const transport = { handleMessage: jest.fn((_input: unknown) => true), dispose: jest.fn() };
  const client = new SimulationControlClient((receive) => { deliver = receive; return transport; });
  client.connect();
  client.setLevel('master-blinds', 33);
  expect(transport.handleMessage).toHaveBeenCalledTimes(1);
  const state = createDefaultSimulationSnapshot();
  const envelope = { channel: 'vantahome-simulation', version: 1, type: 'snapshot' } as const;
  deliver({ ...envelope, state });
  client.setLevel('master-blinds', 33);
  client.setLevel('master-blinds', 81);
  const first = parseSimulationRequest(transport.handleMessage.mock.calls[1][0]);
  const second = parseSimulationRequest(transport.handleMessage.mock.calls[2][0]);
  if (first?.type !== 'patch' || second?.type !== 'patch') throw new Error('Expected valid control patches');
  const earlier = mergeSimulationChanges(state, first.changes);
  deliver({ ...envelope, state: earlier, acknowledgedRequestId: first.requestId });
  expect(client.getSnapshot().state.deviceStates['master-blinds'].level).toBe(81);
  client.dispose();
  expect(transport.dispose).not.toHaveBeenCalled();
  deliver({ ...envelope, state: mergeSimulationChanges(earlier, second.changes), acknowledgedRequestId: second.requestId });
  expect(transport.dispose).toHaveBeenCalledTimes(1);
});

test('keeps extra controls and a last-moment edit when the native inspector closes and reopens', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const storage = { getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined) };
  const persistence = new SimulationPersistence(storage);
  const factory = (deliver: (message: SimulationSnapshotMessage) => void, status: ConstructorParameters<typeof SimulationSession>[1]) => new SimulationSession(deliver, status, { store, persistence, mode: 'production' });
  const client = new SimulationControlClient(factory);
  client.connect();
  await settle();
  client.setSetting('master-light', 'brightness', 27);
  client.setSetting('master-light', 'color', '#A0E9FF');
  client.setSetting('entry-gate', 'autoOpenEnabled', true);
  client.setSetting('entry-gate', 'scheduleHour', 19);
  client.setLevel('entry-gate', 76);
  client.dispose();
  await settle();
  const reopened = new SimulationControlClient(factory);
  reopened.connect();
  await settle();
  expect(reopened.getSnapshot().state.deviceStates['master-light']).toMatchObject({ level: 27, settings: { color: '#A0E9FF' } });
  expect(reopened.getSnapshot().state.deviceStates['entry-gate']).toMatchObject({ level: 76, settings: { autoOpenEnabled: true, scheduleHour: 19 } });
  expect(store.getState().devices).toEqual([]);
  expect(storage.setItem).toHaveBeenCalled();
  reopened.dispose();
});

test('disables controls immediately when account identity changes', async () => {
  const store = createStore<HomeState>(() => ({ ...useHomeStore.getState(), devices: [] }));
  const persistence = new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined });
  const client = new SimulationControlClient((deliver, status) => new SimulationSession(deliver, status, { store, persistence, mode: 'production' }));
  client.connect();
  await settle();
  store.setState({ accountUserId: 'another-account' });
  const previous = client.getSnapshot().state;
  client.toggle('master-light');
  expect(client.getSnapshot()).toMatchObject({ ready: false, status: 'disconnected', state: previous });
  client.dispose();
});

test('can reconnect after the setup/cleanup cycle used by React StrictMode', async () => {
  const client = new SimulationControlClient();
  client.connect();
  client.dispose();
  client.connect();
  await settle();
  expect(client.getSnapshot().ready).toBe(true);
  client.dispose();
});
