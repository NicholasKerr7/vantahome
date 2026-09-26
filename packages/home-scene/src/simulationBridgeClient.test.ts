import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSimulationBridgeClient, SIMULATION_HYDRATION_TIMEOUT_MS } from './simulationBridgeClient';
import {
  createDefaultSimulationSnapshot, mergeSimulationChanges, SIMULATION_CHANNEL,
  type SimulationChanges, type SimulationRequest, type SimulationSnapshot,
} from './simulationBridgeProtocol';

/** Model synchronous Zustand notifications while keeping bridge race tests independent of the DOM. */
function createHarness() {
  let state = createDefaultSimulationSnapshot();
  const listeners = new Set<(next: SimulationSnapshot, previous: SimulationSnapshot) => void>();
  const send = vi.fn<(message: SimulationRequest) => void>();
  const hydrated = vi.fn();
  const syncError = vi.fn();
  function applySnapshot(next: SimulationSnapshot): void {
    const previous = state;
    state = next;
    for (const listener of listeners) listener(state, previous);
  }
  const client = createSimulationBridgeClient({
    store: { applySnapshot, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } },
    send, onHydrated: hydrated, onSyncError: syncError,
  });
  return {
    client, send, hydrated, syncError, state: () => state,
    edit(changes: SimulationChanges): void { applySnapshot(mergeSimulationChanges(state, changes)); },
    snapshot(next: SimulationSnapshot, acknowledgedRequestId?: number): void {
      client.receive({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: next, ...(acknowledgedRequestId === undefined ? {} : { acknowledgedRequestId }) });
    },
    patches(): Extract<SimulationRequest, { type: 'patch' }>[] {
      return send.mock.calls.map(([message]) => message).filter((message) => message.type === 'patch');
    },
  };
}

afterEach(() => { vi.useRealTimers(); });

describe('scene simulation synchronization', () => {
  it('requests hydration without posting defaults or echoing the restored host state', () => {
    const harness = createHarness();
    expect(harness.send).toHaveBeenCalledTimes(1);
    expect(harness.send).toHaveBeenCalledWith({ channel: SIMULATION_CHANNEL, version: 1, type: 'request' });
    const saved = mergeSimulationChanges(createDefaultSimulationSnapshot(), { motionDisabled: true, lightingMode: 'night', night: true });
    harness.snapshot(saved);
    expect(harness.state()).toEqual(saved);
    expect(harness.hydrated).toHaveBeenCalledTimes(1);
    expect(harness.send).toHaveBeenCalledTimes(1);
  });

  it('preserves only deliberate early edits while restoring every other saved field', () => {
    const harness = createHarness();
    harness.edit({ deviceStates: { 'living-light': { on: false, level: 21 } } });
    expect(harness.patches()).toHaveLength(0);
    const saved = mergeSimulationChanges(createDefaultSimulationSnapshot(), { motionDisabled: true });
    harness.snapshot(saved);
    expect(harness.state().deviceStates['living-light']).toEqual({ on: false, level: 21 });
    expect(harness.state().motionDisabled).toBe(true);
    expect(harness.patches()).toHaveLength(1);
    expect(harness.patches()[0].changes).toEqual({ deviceStates: { 'living-light': { on: false, level: 21 } } });
  });

  it('sends rapid edits immediately and prevents delayed acknowledgements reverting the latest value', () => {
    const harness = createHarness();
    const original = createDefaultSimulationSnapshot();
    harness.snapshot(original);
    harness.edit({ deviceStates: { 'living-light': { on: true, level: 20 } } });
    harness.edit({ deviceStates: { 'living-light': { on: true, level: 40 } } });
    harness.edit({ deviceStates: { 'living-light': { on: true, level: 70 } }, motionDisabled: true });
    const patches = harness.patches();
    expect(patches).toHaveLength(3);
    const firstHostState = mergeSimulationChanges(original, patches[0].changes);
    harness.snapshot(firstHostState, patches[0].requestId);
    expect(harness.state().deviceStates['living-light'].level).toBe(70);
    expect(harness.state().motionDisabled).toBe(true);
    const latest = mergeSimulationChanges(firstHostState, patches[2].changes);
    harness.snapshot(latest, patches[2].requestId);
    harness.snapshot(firstHostState, patches[1].requestId);
    expect(harness.state()).toEqual(latest);
    expect(harness.patches()).toHaveLength(3);
  });

  it('overlays pending edits on independent dashboard updates and accepts acknowledged changes', () => {
    const harness = createHarness();
    const original = createDefaultSimulationSnapshot();
    harness.snapshot(original);
    harness.edit({ deviceStates: { 'living-light': { on: false, level: 20 } } });
    const hostUpdate = mergeSimulationChanges(original, { deviceStates: { 'master-blinds': { on: true, level: 100 } } });
    harness.snapshot(hostUpdate);
    expect(harness.state().deviceStates['living-light'].on).toBe(false);
    expect(harness.state().deviceStates['master-blinds'].level).toBe(100);
    harness.snapshot(mergeSimulationChanges(hostUpdate, harness.patches()[0].changes), harness.patches()[0].requestId);
    harness.snapshot(mergeSimulationChanges(hostUpdate, { deviceStates: { 'living-light': { on: true, level: 80 } } }));
    expect(harness.state().deviceStates['living-light'].level).toBe(80);
  });

  it('ignores malformed or invented acknowledgements and tears down subscriptions', () => {
    const harness = createHarness();
    harness.client.receive({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: {} });
    expect(harness.hydrated).not.toHaveBeenCalled();
    harness.snapshot(createDefaultSimulationSnapshot(), 999999);
    expect(harness.hydrated).not.toHaveBeenCalled();
    harness.snapshot(createDefaultSimulationSnapshot());
    harness.client.dispose();
    harness.edit({ motionDisabled: true });
    harness.snapshot(createDefaultSimulationSnapshot());
    expect(harness.state().motionDisabled).toBe(true);
    expect(harness.patches()).toHaveLength(0);
  });

  it('retries a missed handshake twice, reports timeout once and stops polling', () => {
    vi.useFakeTimers();
    const harness = createHarness();
    vi.advanceTimersByTime(SIMULATION_HYDRATION_TIMEOUT_MS);
    expect(harness.send).toHaveBeenCalledTimes(3);
    expect(harness.syncError).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(harness.send).toHaveBeenCalledTimes(3);
    expect(harness.syncError).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    harness.client.dispose();
  });

  it('clears handshake timers after hydration or unmount and recovers from a late response', () => {
    vi.useFakeTimers();
    const early = createHarness();
    early.snapshot(createDefaultSimulationSnapshot());
    expect(vi.getTimerCount()).toBe(0);
    const closed = createHarness();
    closed.client.dispose();
    expect(vi.getTimerCount()).toBe(0);
    const late = createHarness();
    late.edit({ motionDisabled: true });
    vi.advanceTimersByTime(SIMULATION_HYDRATION_TIMEOUT_MS);
    expect(late.syncError).toHaveBeenCalledTimes(1);
    late.snapshot(createDefaultSimulationSnapshot());
    expect(late.hydrated).toHaveBeenCalledTimes(1);
    expect(late.state().motionDisabled).toBe(true);
    expect(late.patches()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    early.client.dispose();
    late.client.dispose();
  });


  it('keeps controls usable and reports a transport exception after hydration', () => {
    const harness = createHarness();
    harness.snapshot(createDefaultSimulationSnapshot());
    harness.send.mockImplementationOnce(() => { throw new Error('Native host disconnected'); });
    expect(() => harness.edit({ motionDisabled: true })).not.toThrow();
    expect(harness.state().motionDisabled).toBe(true);
    expect(harness.syncError).toHaveBeenCalledTimes(1);
    harness.client.dispose();
  });

});
