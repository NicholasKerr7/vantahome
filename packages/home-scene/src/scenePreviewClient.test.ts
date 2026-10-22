import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSimulationSnapshot } from './simulationBridgeProtocol';
import { createScenePreviewClient, scenePreviewDisplayStates, type ScenePreviewSource } from './scenePreviewClient';
import { scenePreviewCommandMessage, type ScenePreviewPayload } from './scenePreviewProtocol';
import { useScenePreviewStore } from './scenePreviewStore';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import { useHomeStore } from './state';
import { getDevice } from './data';
import { readDeviceSetting } from './deviceCapabilities';

/** Model the authoritative store as read-only input and make every external update explicit. */
function fixture() {
  let current: ScenePreviewSource = { ...createDefaultSimulationSnapshot(), access: FULL_SCENE_ACCESS,
    roomId: 'living', floor: 'ground', view: 'ground' };
  let available = true;
  const listeners = new Set<() => void>();
  const send = vi.fn();
  const client = createScenePreviewClient({ getState: () => current,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    available: () => available, send });
  return { client, send, state: () => current, listeners,
    update(next: Partial<ScenePreviewSource>) { current = { ...current, ...next }; listeners.forEach((listener) => listener()); },
    suspend() { available = false; client.refresh(); },
    resume() { available = true; },
  };
}

/** Construct the same explicit before/after payload the host sends after validating a draft. */
function proposal(state: ScenePreviewSource, values: ScenePreviewPayload['actions'][number]['values'] = { isOn: true, brightness: 20 }): ScenePreviewPayload {
  const device = getDevice('living-light')!;
  return { title: 'Living room evening', expiresAt: Date.now() + 30_000,
    actions: [{ deviceId: device.id, values, baseline: Object.fromEntries(Object.keys(values).map((field) => [field, readDeviceSetting(device, state.deviceStates[device.id], field)])) }] };
}

afterEach(() => { useScenePreviewStore.setState({ active: null, comparison: 'proposed' }); vi.useRealTimers(); });

describe('isolated 3D scene preview', () => {
  it('derives proposed and current rendering without modifying any canonical object or navigation', () => {
    const test = fixture();
    const source = test.state();
    const before = JSON.stringify(source);
    Object.values(source.deviceStates).forEach((value) => { if (value.settings) Object.freeze(value.settings); Object.freeze(value); });
    Object.freeze(source.deviceStates);
    test.client.receive(scenePreviewCommandMessage(1, proposal(source)));
    expect(test.send).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1, status: 'active' }));
    const active = useScenePreviewStore.getState().active;
    const proposed = scenePreviewDisplayStates(source, active, 'proposed');
    expect(proposed['living-light']).toMatchObject({ on: true, level: 20 });
    expect(proposed['family-tv']).toBe(source.deviceStates['family-tv']);
    expect(proposed['living-light']).not.toBe(source.deviceStates['living-light']);
    test.client.compare('current');
    expect(scenePreviewDisplayStates(source, active, 'current')).toBe(source.deviceStates);
    test.client.compare('proposed'); test.client.close();
    expect(JSON.stringify(source)).toBe(before);
    expect(test.state()).toBe(source);
    expect(useScenePreviewStore.getState().active).toBeNull();
    test.client.dispose();
    expect(test.listeners.size).toBe(0);
  });

  it('never calls a canonical setter or its persistence/bridge subscribers while previewing or comparing', () => {
    const source = useHomeStore.getState();
    const subscriber = vi.fn();
    const unsubscribe = useHomeStore.subscribe(subscriber);
    const client = createScenePreviewClient({ getState: useHomeStore.getState, subscribe: useHomeStore.subscribe,
      available: () => true, send: vi.fn() });
    client.receive(scenePreviewCommandMessage(1, proposal(source)));
    expect(useScenePreviewStore.getState().active).not.toBeNull();
    source.toggleDevice('living-light'); source.setDeviceLevel('living-light', 91);
    source.setDeviceSetting('living-light', 'brightness', 55); source.runDeviceAction('entry-gate', 'gate-open');
    source.activatePreset('movie'); source.setNight(true); source.setLightingMode('night'); source.reset();
    source.setRoom('family'); source.setView('exterior'); source.setFloor('upper');
    source.selectDevice('family-tv'); source.selectHotspotDevice('family-tv');
    client.compare('current'); client.compare('proposed'); client.close();
    expect(useHomeStore.getState()).toBe(source);
    expect(subscriber).not.toHaveBeenCalled();
    unsubscribe(); client.dispose();
  });

  it('rejects sensitive devices, denied control, mismatching baseline and stale proposal timestamps', () => {
    const test = fixture();
    const valid = proposal(test.state());
    test.client.receive(scenePreviewCommandMessage(1, { ...valid, actions: [{ deviceId: 'entry-gate', values: { openPercent: 100 }, baseline: { openPercent: 0 } }] }));
    expect(test.send).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1, status: 'invalid' }));
    test.update({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } });
    test.client.receive(scenePreviewCommandMessage(2, valid));
    expect(test.send).toHaveBeenLastCalledWith(expect.objectContaining({ id: 2, status: 'invalid' }));
    test.update({ access: FULL_SCENE_ACCESS });
    test.client.receive(scenePreviewCommandMessage(3, { ...valid, actions: [{ ...valid.actions[0], baseline: { isOn: false, brightness: 99 } }] }));
    expect(test.send).toHaveBeenLastCalledWith(expect.objectContaining({ id: 3, status: 'stale' }));
    test.client.receive(scenePreviewCommandMessage(4, { ...valid, expiresAt: Date.now() - 1 }));
    expect(test.send).toHaveBeenLastCalledWith(expect.objectContaining({ id: 4, status: 'expired' }));
    test.client.receive(scenePreviewCommandMessage(5, { ...valid, expiresAt: Date.now() + 60_001 }));
    expect(test.send).toHaveBeenLastCalledWith(expect.objectContaining({ id: 5, status: 'invalid' }));
    expect(useScenePreviewStore.getState().active).toBeNull(); test.client.dispose();
  });

  it.each(['access', 'room', 'affected-value', 'affected-preference'] as const)('clears immediately on %s changes while unrelated values remain authoritative', (change) => {
    const test = fixture(); test.client.receive(scenePreviewCommandMessage(1, proposal(test.state())));
    const states = test.state().deviceStates;
    test.update({ deviceStates: { ...states, 'family-tv': { ...states['family-tv'], on: !states['family-tv'].on } } });
    expect(useScenePreviewStore.getState().active).not.toBeNull();
    if (change === 'access') test.update({ access: { ...FULL_SCENE_ACCESS, propertyOverview: false } });
    else if (change === 'room') test.update({ roomId: 'family' });
    else test.update({ deviceStates: { ...states, 'living-light': change === 'affected-value'
      ? { ...states['living-light'], level: 93 }
      : { ...states['living-light'], settings: { ...states['living-light'].settings, lightEffect: 'pulse' } } } });
    expect(useScenePreviewStore.getState().active).toBeNull();
    expect(test.send).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'stale' })); test.client.dispose();
  });

  it('rechecks current access synchronously when deriving a frame, before subscribers run', () => {
    const test = fixture(); test.client.receive(scenePreviewCommandMessage(1, proposal(test.state())));
    const state = { ...test.state(), access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] } };
    expect(scenePreviewDisplayStates(state, useScenePreviewStore.getState().active, 'proposed')).toBe(state.deviceStates);
    test.client.dispose();
  });

  it('expires through one timer and clears on suspension without replaying rejected requests', () => {
    vi.useFakeTimers(); const test = fixture(); const payload = proposal(test.state());
    test.client.receive(scenePreviewCommandMessage(1, payload));
    vi.advanceTimersByTime(30_000);
    expect(useScenePreviewStore.getState().active).toBeNull();
    expect(test.send).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1, status: 'expired' }));
    const next = proposal(test.state()); test.client.receive(scenePreviewCommandMessage(2, next));
    test.suspend(); expect(useScenePreviewStore.getState().active).toBeNull();
    test.client.receive(scenePreviewCommandMessage(3, next));
    expect(test.send).toHaveBeenLastCalledWith(expect.objectContaining({ id: 3, status: 'invalid' }));
    test.resume(); test.client.receive(scenePreviewCommandMessage(3, next));
    expect(useScenePreviewStore.getState().active).toBeNull();
    test.client.receive(scenePreviewCommandMessage(4, next));
    test.client.receive(scenePreviewCommandMessage(5, null));
    expect(useScenePreviewStore.getState().active).toBeNull();
    expect(test.send).toHaveBeenLastCalledWith(expect.objectContaining({ id: 5, status: 'closed' }));
    expect(vi.getTimerCount()).toBe(0); test.client.dispose();
  });
});
