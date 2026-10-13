import { createStore } from 'zustand/vanilla';
import { useHomeStore, type HomeState } from '../../../store/useHomeStore';
import { createSimulationBridgeClient } from '../../../../packages/home-scene/src/simulationBridgeClient';
import { applyDeviceSetting } from '../../../../packages/home-scene/src/deviceControlActions';
import {
  createDefaultSimulationSnapshot, mergeSimulationChanges,
  type SimulationSnapshot, type SimulationSnapshotMessage,
} from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { SimulationControlClient } from '../simulationControlClient';
import { SimulationPersistence } from '../simulationPersistence';
import { SimulationSession } from '../simulationSession';

/** Drain host processing and disk writes without delivering queued transport messages. */
async function settle(): Promise<void> { for (let index = 0; index < 24; index++) await Promise.resolve(); }

/** Use the actual producer, session and persistence while controlling delay in both directions. */
function setup() {
  const store = createStore<HomeState>(() => ({
    ...useHomeStore.getState(), accountUserId: null, authenticatedUserId: null,
    accountHomeId: null, activeHomeId: null, sessionEpoch: 0,
    realtime: { enabled: false, useMqtt: false, wsUrl: '' },
    household: [{ id: 'owner', name: 'Demo', role: 'Owner', status: 'home', avatarColor: '#000000' }],
    activeMemberId: 'owner', devices: [],
  }));
  const storage = { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) };
  const persistence = new SimulationPersistence(storage);
  const cleanups: (() => void)[] = [];

  /** Connect a real renderer store without mocking its optimistic synchronization logic. */
  function renderer() {
    let state = createDefaultSimulationSnapshot();
    const requests: unknown[] = [];
    const replies: SimulationSnapshotMessage[] = [];
    const listeners = new Set<(next: SimulationSnapshot, previous: SimulationSnapshot) => void>();
    const session = new SimulationSession((message) => replies.push(message), () => undefined, { store, persistence, mode: 'demo' });
    /** Match Zustand's synchronous state publication inside asynchronous iframe transport. */
    function applySnapshot(next: SimulationSnapshot): void {
      const previous = state; state = next;
      for (const listener of listeners) listener(next, previous);
    }
    const client = createSimulationBridgeClient({
      store: { applySnapshot, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } },
      send: (message) => { requests.push(message); }, onHydrated: () => undefined, onSyncError: () => undefined,
    });
    const close = () => { client.dispose(); session.dispose(); };
    cleanups.push(close);
    return {
      state: () => state, close,
      send: () => requests.splice(0).forEach((message) => session.handleMessage(message)),
      receive: () => replies.splice(0).forEach(client.receive),
      edit: (field: string, value: number | string) => applySnapshot(mergeSimulationChanges(state, {
        deviceStates: { 'living-light': applyDeviceSetting('living-light', state.deviceStates['living-light'], field, value) },
      })),
    };
  }

  /** Delay native control acknowledgements too, so both senders edit genuinely stale views. */
  function native() {
    const replies: SimulationSnapshotMessage[] = [];
    let receive!: (message: SimulationSnapshotMessage) => void;
    const client = new SimulationControlClient((deliver, status) => {
      receive = deliver;
      return new SimulationSession((message) => replies.push(message), status, { store, persistence, mode: 'demo' });
    });
    client.connect();
    cleanups.push(() => client.dispose());
    return { client, receive: () => replies.splice(0).forEach(receive) };
  }
  return { persistence, storage, renderer, native, dispose: () => cleanups.forEach((close) => close()) };
}

test('a renderer-only color edit preserves a newer host power-off while WebView replies are delayed', async () => {
  const fixture = setup();
  const renderer = fixture.renderer();
  try {
    renderer.send(); await settle(); renderer.receive();
    renderer.edit('brightness', 44); renderer.send(); await settle();
    await fixture.persistence.update('demo', (state) => mergeSimulationChanges(state, {
      deviceStates: { 'living-light': { ...state.deviceStates['living-light'], on: false } },
    }));
    renderer.edit('color', '#A0E9FF'); renderer.send(); await settle(); renderer.receive();
    expect((await fixture.persistence.load('demo')).deviceStates['living-light']).toMatchObject({
      on: false, level: 44, settings: { color: '#A0E9FF' },
    });
    expect(renderer.state().deviceStates['living-light']).toEqual((await fixture.persistence.load('demo')).deviceStates['living-light']);
  } finally { fixture.dispose(); }
});

test('bidirectional rapid edits rebase pending fields and reconnect to the same canonical result', async () => {
  const fixture = setup();
  const renderer = fixture.renderer();
  const native = fixture.native();
  try {
    renderer.send(); await settle(); renderer.receive(); native.receive();
    // The renderer has pending brightness edits; native power-off arrives first.
    renderer.edit('brightness', 24); renderer.edit('brightness', 44); renderer.edit('brightness', 70);
    native.client.toggle('living-light'); await settle(); renderer.receive();
    expect(renderer.state().deviceStates['living-light']).toMatchObject({ on: false, level: 70 });
    renderer.send(); await settle();
    // Native still has its original brightness, but changes only its color.
    native.client.setSetting('living-light', 'color', '#A0E9FF'); await settle();
    renderer.receive(); native.receive();
    const expected = { on: false, level: 70, settings: { color: '#A0E9FF' } };
    expect((await fixture.persistence.load('demo')).deviceStates['living-light']).toMatchObject(expected);
    expect(renderer.state().deviceStates['living-light']).toMatchObject(expected);
    expect(native.client.getSnapshot().state.deviceStates['living-light']).toMatchObject(expected);
    renderer.close(); native.client.dispose();
    const reopenedRenderer = fixture.renderer(); const reopenedNative = fixture.native();
    reopenedRenderer.send(); await settle(); reopenedRenderer.receive(); reopenedNative.receive();
    expect(reopenedRenderer.state().deviceStates['living-light']).toMatchObject(expected);
    expect(reopenedNative.client.getSnapshot().state.deviceStates['living-light']).toMatchObject(expected);
    // Persisted bytes use the same canonical state, including unrelated settings.
    expect(fixture.storage.setItem).toHaveBeenCalled();
  } finally { fixture.dispose(); }
});
