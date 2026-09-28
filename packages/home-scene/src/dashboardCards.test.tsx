import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEVICES, ROOMS, getDevice } from './data';
import { DashboardInspector } from './DashboardInspector';
import { DashboardLibrary } from './DashboardLibrary';
import { deviceCardReading, libraryCardPageSize } from './dashboardCardPresentation';
import type { LiveEnvironment } from './environment/useLiveEnvironment';
import { PROPERTY_LOCATION } from './environment/types';

const environment: LiveEnvironment = { localTime: '10:42 AM', localDate: '2026-09-28', weather: null, status: 'unavailable', error: null,
  isNight: false, daylight: 1, sunAltitudeDeg: 42, now: 0, location: PROPERTY_LOCATION, timeZone: PROPERTY_LOCATION.timeZone,
  clockSource: 'solar-calculation', refresh: () => undefined };

describe('selected device reading', () => {
  it('shows brightness only while a light is on', () => {
    const light = getDevice('living-light')!;
    expect(deviceCardReading(light, { on: true, level: 37 })).toEqual({ value: '37%', caption: 'Brightness · On' });
    expect(deviceCardReading(light, { on: false, level: 37 })).toEqual({ value: 'Off', caption: 'Device state' });
  });

  it('keeps a cover position and AC target distinct from measured temperature', () => {
    const cover = DEVICES.find((device) => device.kind === 'blinds')!;
    const ac = DEVICES.find((device) => device.kind === 'ac')!;
    expect(deviceCardReading(cover, { on: true, level: 45 })).toEqual({ value: '45%', caption: 'Opening position · 45% open' });
    expect(deviceCardReading(ac, { on: false, level: 50, settings: { tempC: 22 } })).toEqual({ value: '22°C', caption: 'Target temperature · Off' });
  });

  it('labels sensor state as a simulation sample', () => {
    const smoke = DEVICES.find((device) => device.kind === 'smoke')!;
    expect(deviceCardReading(smoke, { on: true, level: 0 })).toEqual({ value: 'Monitoring sample', caption: 'Simulation sample' });
  });

  it('keeps a gas preview clearly simulated and its valve state visible', () => {
    const meter = DEVICES.find((device) => device.kind === 'gas-meter')!;
    const detector = DEVICES.find((device) => device.kind === 'gas-leak')!;
    expect(deviceCardReading(meter, { on: true, level: 0, settings: { gasRemainingKg: 6.5, gasValveOpen: false } })).toEqual({ value: '6.5 kg', caption: 'Sample · valve closed' });
    expect(deviceCardReading(meter, { on: true, level: 0, settings: { gasLeakInterlock: true, gasValveOpen: false } })).toEqual({ value: 'Leak', caption: 'Sample · valve closed' });
    expect(deviceCardReading(detector, { on: true, level: 0, settings: { gasLeakDetected: true } })).toEqual({ value: 'Leak', caption: 'Simulation sample' });
  });
});

describe('bounded card composition', () => {
  it.each([[448, 2], [520, 2], [521, 4], [900, 4]])('uses %s viewport height for %s cards', (height, expected) => {
    expect(libraryCardPageSize(height)).toBe(expected);
  });

  it('separates the selected state/action card from two paged room tiles', () => {
    const markup = renderToStaticMarkup(<DashboardInspector onFullControls={() => undefined} onBrowseDevices={() => undefined} />);
    expect(markup).toContain('device-focus-reading');
    expect(markup).toContain('device-focus-details');
    expect(markup).toContain('Full controls');
    expect(markup).toContain('role="switch"');
    expect(markup.match(/dashboard-device-row dashboard-device-card/g)).toHaveLength(2);
    expect(markup).toContain('Next devices');
  });

  it('shows exact room inventory counts and four distinct room cards', () => {
    const markup = renderToStaticMarkup(<DashboardLibrary view="rooms" environment={environment} onEnvironment={() => undefined} onClose={() => undefined} onDevice={() => undefined} reducedMotion={false} systemReducedMotion={false} />);
    expect(markup.match(/data-library-room=/g)).toHaveLength(4);
    for (const room of ROOMS.slice(0, 4)) {
      const count = DEVICES.filter((device) => device.roomId === room.id).length;
      expect(markup).toContain(`${count} ${count === 1 ? 'device' : 'devices'}`);
    }
    expect(markup).toContain('Explore');
  });

  it('makes a device card open full controls with room and state in its accessible label', () => {
    const markup = renderToStaticMarkup(<DashboardLibrary view="devices" environment={environment} onEnvironment={() => undefined} onClose={() => undefined} onDevice={() => undefined} reducedMotion={false} systemReducedMotion={false} />);
    expect(markup.match(/data-library-device=/g)).toHaveLength(4);
    expect(markup.match(/Open full controls/g)).toHaveLength(4);
    expect(markup).toContain('library-card-state');
    expect(markup).toContain('Living room');
  });
});
