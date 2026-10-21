import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cameraControllerActionId, CAMERA_SENSITIVITY_BOUNDS, getCameraConsolePresentation, type CameraControllerKey } from './cameraController';
import { DEVICES, getDevice } from './data';
import { deviceStatus, getCapabilities, getControlPages } from './deviceCapabilities';
import { applyDeviceSetting, runDeviceActionState, toggleDeviceState } from './deviceControlActions';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultSimulationSnapshot, parseStoredSimulationSnapshotMessage, SIMULATION_CHANNEL } from './simulationBridgeProtocol';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, parseStoredState, STORAGE_VERSION, useHomeStore } from './state';

const camera = getDevice('entry-camera')!;
const cameraIds = DEVICES.filter(({ kind }) => kind === 'camera').map(({ id }) => id);
const preferences = {
  recording: true, nightVision: false, motionAlerts: false,
  micMuted: true, twoWayAudio: false, motionSensitivity: 8,
};
const events = [
  ['snapshot', 'snapshot', 'Simulated snapshot'],
  ['knownVisitor', 'known-visitor', 'Known visitor preview'],
  ['unknownVisitor', 'unknown-visitor', 'Unknown visitor preview'],
] as const satisfies readonly (readonly [CameraControllerKey, string, string])[];

/** Keep access changes isolated from neighboring controller suites. */
function resetStore(): void {
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
}

/** Retain the selected camera's accepted settings and local event in both persisted formats. */
function expectRetained(id: string, state: DeviceState): void {
  const snapshot = createDefaultSimulationSnapshot();
  snapshot.deviceStates[id] = state;
  const restoredNative = parseStoredSimulationSnapshotMessage({
    channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot,
  });
  const browser = createDefaultState();
  browser.deviceStates[id] = state;
  const restoredBrowser = parseStoredState(JSON.stringify({ version: STORAGE_VERSION, state: browser }));
  expect(restoredNative?.state.deviceStates[id]).toEqual(state);
  expect(restoredBrowser.deviceStates[id]).toEqual(state);
}

describe('shared camera console presentation', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('supports only cameras and preserves the catalog defaults as preferences', () => {
    expect(getCameraConsolePresentation(getDevice('living-light')!, { on: true, level: 50 })).toBeNull();
    expect(getCameraConsolePresentation(camera, { on: true, level: 60 })).toEqual({
      armed: true, status: 'Armed preview', recording: false, nightVision: true,
      motionAlerts: true, micMuted: false, twoWayAudio: true, motionSensitivity: 6,
      previewEvent: { kind: 'none', label: 'No preview events' },
    });
    expect(CAMERA_SENSITIVITY_BOUNDS).toEqual({ min: 1, max: 10, step: 1 });
  });

  it('restores an untouched camera without inventing an event or persisting derived defaults', () => {
    const initial = createDefaultState().deviceStates[camera.id];
    expect(initial.settings).toBeUndefined();
    expectRetained(camera.id, initial);
    const snapshot = createDefaultSimulationSnapshot();
    const restored = parseStoredSimulationSnapshotMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'snapshot', state: snapshot });
    expect(getCameraConsolePresentation(camera, restored!.state.deviceStates[camera.id])).toEqual(getCameraConsolePresentation(camera, initial));
    expect(getCameraConsolePresentation(camera, initial)?.previewEvent).toEqual({ kind: 'none', label: 'No preview events' });
    expect(initial.settings).toBeUndefined();
  });

  it.each([true, false])('uses accepted arming=%s rather than contradictory duplicate settings or old commands', (armed) => {
    const state = { on: armed, level: 60, settings: { ...preferences, armed: !armed, cameraPreviewEvent: 'Known visitor preview', lastAction: 'camera-snapshot' } };
    const before = structuredClone(state);
    expect(getCameraConsolePresentation(camera, state)).toEqual({
      ...preferences, armed, status: armed ? 'Armed preview' : 'Disarmed preview',
      previewEvent: { kind: 'known-visitor', label: 'Known visitor preview' },
    });
    expect(deviceStatus(camera, state)).toBe(armed ? 'Armed' : 'Disarmed');
    expect(state).toEqual(before);
  });

  it('validates malformed preferences without coercing strings into enabled controls', () => {
    const presentation = getCameraConsolePresentation(camera, { on: false, level: 60, settings: {
      recording: 'yes', nightVision: 1, motionAlerts: 'false', micMuted: 1, twoWayAudio: 'off', motionSensitivity: Number.NaN,
    } });
    expect(presentation).toMatchObject({ armed: false, recording: false, nightVision: true, motionAlerts: true, micMuted: false, twoWayAudio: true, motionSensitivity: 6 });
  });

  it.each([[0, 1], [11, 10], [7.6, 8], [Infinity, 6], ['5', 6]] as const)('normalizes sensitivity %s with existing bounded schema', (input, expected) => {
    expect(getCameraConsolePresentation(camera, { on: true, level: 60, settings: { motionSensitivity: input } })?.motionSensitivity).toBe(expected);
  });

  it.each(['https://private.invalid/frame', '<img src=x>', '', 1, false])('does not turn malformed event %s into a new observation or no-event claim', (event) => {
    const presentation = getCameraConsolePresentation(camera, { on: true, level: 60, settings: { cameraPreviewEvent: event } });
    expect(presentation?.previewEvent).toEqual({ kind: 'unavailable', label: 'Preview event unavailable' });
    if (typeof event === 'string' && event.length > 0) expect(JSON.stringify(presentation)).not.toContain(event);
  });

  it('retains every existing More control and saved-only label without adding PTZ, feed or transport actions', () => {
    const capabilities = getCapabilities('camera');
    const actionIds = capabilities.filter((item) => item.type === 'action').map(({ id }) => id);
    expect(actionIds.sort()).toEqual(events.map(([key]) => cameraControllerActionId(key)).sort());
    for (const field of Object.keys(preferences)) {
      const capability = capabilities.find((item) => 'field' in item && item.field === field);
      expect(capability).toBeDefined();
      // Sensitivity is also configuration-only; no detection engine consumes any of these values.
      expect(capability?.configurationOnly).toBe(true);
    }
    const pages = getControlPages('camera').flatMap(({ capabilities: controls }) => controls.map(({ id }) => id));
    expect(pages.slice().sort()).toEqual(capabilities.map(({ id }) => id).sort());
    expect(new Set(pages).size).toBe(pages.length);
    expect(capabilities.some(({ id }) => /stream|capture|ptz|zoom|pan|tilt|signal|battery/i.test(id))).toBe(false);
  });

  describe.each(cameraIds)('%s selected camera', (id) => {
    it('keeps preferences through disarm/rearm and keeps arming unchanged during preference edits', () => {
      let state: DeviceState = { on: false, level: 60 };
      for (const [field, value] of Object.entries(preferences)) {
        state = applyDeviceSetting(id, state, field, value);
        expect(state.on).toBe(false);
      }
      state = toggleDeviceState(id, state);
      expect(state).toMatchObject({ on: true, settings: { ...preferences, armed: true } });
      state = toggleDeviceState(id, state);
      expect(state).toMatchObject({ on: false, settings: { ...preferences, armed: false } });
      expectRetained(id, state);
    });

    it.each(events)('persists %s as a local event only and preserves disarmed state and preferences', (key, kind, label) => {
      const original = { on: false, level: 60, settings: preferences };
      const accepted = runDeviceActionState(id, original, cameraControllerActionId(key));
      expect(accepted).toEqual({ ...original, settings: { ...preferences, cameraPreviewEvent: label, lastAction: cameraControllerActionId(key) } });
      const edited = applyDeviceSetting(id, accepted, 'motionAlerts', true);
      expect(edited.settings?.lastAction).toBeUndefined();
      expect(getCameraConsolePresentation(getDevice(id)!, edited)).toMatchObject({ armed: false, previewEvent: { kind, label } });
      expectRetained(id, edited);
      expect(Object.keys(edited.settings!).some((field) => /url|timestamp|image|capture|recordingStart/i.test(field))).toBe(false);
      expect(original).toEqual({ on: false, level: 60, settings: preferences });
    });

    it('changes only this camera and cannot open the entry gate or write another camera', () => {
      const before = useHomeStore.getState().deviceStates;
      const send = useHomeStore.getState().runDeviceAction;
      for (const [key] of events) send(id, cameraControllerActionId(key));
      const after = useHomeStore.getState().deviceStates;
      expect(after[id].settings?.cameraPreviewEvent).toBe('Unknown visitor preview');
      for (const otherId of Object.keys(before)) if (otherId !== id) expect(after[otherId]).toEqual(before[otherId]);
      const selected = after[id];
      send(id, 'gate-command-open');
      expect(useHomeStore.getState().deviceStates[id]).toBe(selected);
    });

    it('rechecks view-only and revoked access for cached commands, arming and preferences', () => {
      const definition = getDevice(id)!;
      const send = useHomeStore.getState().runDeviceAction;
      const toggle = useHomeStore.getState().toggleDevice;
      const setSetting = useHomeStore.getState().setDeviceSetting;
      const before = useHomeStore.getState().deviceStates[id];
      useHomeStore.setState({ access: { ...EMPTY_SCENE_ACCESS, roomIds: [definition.roomId], deviceIds: [id] } });
      for (const [key] of events) send(id, cameraControllerActionId(key));
      toggle(id);
      for (const [field, value] of Object.entries(preferences)) setSetting(id, field, value);
      expect(useHomeStore.getState().deviceStates[id]).toBe(before);
      useHomeStore.setState({ access: FULL_SCENE_ACCESS });
      send(id, cameraControllerActionId('snapshot'));
      const accepted = useHomeStore.getState().deviceStates[id];
      useHomeStore.setState({ access: EMPTY_SCENE_ACCESS });
      send(id, cameraControllerActionId('unknownVisitor'));
      toggle(id);
      setSetting(id, 'armed', !accepted.on);
      expect(useHomeStore.getState().deviceStates[id]).toBe(accepted);
    });
  });
});
