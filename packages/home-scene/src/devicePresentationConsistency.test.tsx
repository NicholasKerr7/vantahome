// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICES, getDevice, type DeviceDefinition } from './data';
import { DashboardInspector } from './DashboardInspector';
import { DashboardLibrary } from './DashboardLibrary';
import { DeviceControlSheet } from './DeviceControlSheet';
import { QuickDeviceControls } from './QuickDeviceControls';
import { deviceCardReading } from './dashboardCardPresentation';
import type { LiveEnvironment } from './environment/useLiveEnvironment';
import { PROPERTY_LOCATION } from './environment/types';
import { applyFireCommand } from './fireSafetySimulation';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, useHomeStore } from './state';

vi.mock('./state', async (importOriginal) => {
  const original = await importOriginal<typeof import('./state')>();
  /** Server rendering must read the audit's current device snapshot rather than the store's initial snapshot. */
  const readCurrent = <T,>(selector: (state: ReturnType<typeof original.useHomeStore.getState>) => T) => selector(original.useHomeStore.getState());
  return { ...original, useHomeStore: Object.assign(readCurrent, original.useHomeStore) };
});

const environment: LiveEnvironment = {
  localTime: '10:42 AM', localDate: '2026-10-09', weather: null, status: 'unavailable', error: null,
  isNight: false, daylight: 1, sunAltitudeDeg: 42, now: 0, location: PROPERTY_LOCATION,
  timeZone: PROPERTY_LOCATION.timeZone, clockSource: 'solar-calculation', refresh: () => undefined,
};
const monitors = new Set(['energy', 'water', 'air', 'smoke', 'solar', 'gas-meter', 'gas-leak']);
const openings = new Set(['blinds', 'gate', 'garage', 'window', 'door']);

/** Render all four user-facing surfaces from the same permission-scoped simulation snapshot. */
function deviceSurfaces(device: DeviceDefinition, current: DeviceState): HTMLDivElement {
  useHomeStore.setState({
    ...createDefaultState(), roomId: device.roomId, selectedDevice: device.id,
    deviceStates: { ...useHomeStore.getState().deviceStates, [device.id]: current },
    access: { fullHome: false, roomIds: [device.roomId], deviceIds: [device.id], controllableDeviceIds: [device.id] },
  });
  const result = document.createElement('div');
  result.innerHTML = renderToStaticMarkup(<>
    <DashboardInspector onFullControls={() => undefined} onBrowseDevices={() => undefined} />
    <QuickDeviceControls deviceId={device.id} onClose={() => undefined} onFullControls={() => undefined} />
    <DeviceControlSheet deviceId={device.id} onClose={() => undefined} />
    <DashboardLibrary view="devices" environment={environment} onEnvironment={() => undefined} reducedMotion systemReducedMotion onClose={() => undefined} onDevice={() => undefined} />
  </>);
  return result;
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
});
afterEach(() => {
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  vi.unstubAllGlobals();
});

describe('dashboard device presentation across the whole catalog', () => {
  it.each(DEVICES)('$id keeps power, opening position and monitoring consistent in every control surface', (device) => {
    for (const on of [false, true]) {
      const root = deviceSurfaces(device, { on, level: openings.has(device.kind) ? on ? 40 : 0 : 65 });
      const surfaces = root.querySelectorAll<HTMLElement>('[data-device-active]');
      expect(surfaces).toHaveLength(5); // Selected summary, room tile, quick controls, full controls and library card.
      for (const surface of surfaces) {
        expect(surface.dataset.deviceActive).toBe(String(on && !monitors.has(device.kind)));
        expect(surface.dataset.deviceMonitoring).toBe(String(monitors.has(device.kind)));
        expect(surface.dataset.deviceTone).toBe('normal');
      }
      if (monitors.has(device.kind)) {
        expect(root.querySelector('.quick-device-toggle[role="switch"]')).toBeNull();
        expect(root.querySelector('.device-sheet-primary[role="switch"]')).toBeNull();
      }
      if (device.kind === 'light' || device.kind === 'tv') {
        expect(root.querySelector('.device-sheet-primary')?.getAttribute('aria-checked')).toBe(String(on));
      }
    }
  });

  it('keeps smoke/CO alarms visible after silence or acknowledgment, until an explicit clear and reset', () => {
    const device = DEVICES.find((candidate) => candidate.kind === 'smoke')!;
    const initial = { on: true, level: device.defaultLevel };
    for (const command of ['test-alarm', 'simulate-co'] as const) {
      const alarm = applyFireCommand(initial, command);
      const acknowledged = applyFireCommand(applyFireCommand(alarm, 'silence'), 'acknowledge');
      for (const state of [alarm, acknowledged]) {
        const root = deviceSurfaces(device, state);
        expect(root.querySelectorAll('[data-device-tone="alarm"]')).toHaveLength(5);
        expect(root.querySelectorAll('[data-device-active="true"]')).toHaveLength(0);
      }
      const cleared = applyFireCommand(acknowledged, 'clear-alarm');
      expect(deviceCardReading(device, cleared).value).toBe('Reset pending');
      expect(deviceSurfaces(device, cleared).querySelectorAll('[data-device-tone="warning"]')).toHaveLength(5);
      const reset = applyFireCommand(cleared, 'reset');
      expect(deviceCardReading(device, reset).value).toBe('Clear');
      expect(deviceSurfaces(device, reset).querySelectorAll('[data-device-tone="normal"]')).toHaveLength(5);
    }
  });

  it('takes cover illumination from the actual position rather than a stale power flag', () => {
    const device = getDevice('master-blinds')!;
    expect(deviceSurfaces(device, { on: true, level: 0 }).querySelectorAll('[data-device-active="false"]')).toHaveLength(5);
    expect(deviceSurfaces(device, { on: false, level: 35 }).querySelectorAll('[data-device-active="true"]')).toHaveLength(5);
  });
});
