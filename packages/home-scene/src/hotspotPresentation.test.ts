import { describe, expect, it } from 'vitest';
import { DEVICES, getDevice, type DeviceDefinition } from './data';
import { DEVICE_KINDS, type DeviceKind } from './deviceCapabilities';
import { applyDeviceSetting, toggleDeviceState } from './deviceControlActions';
import { applyFireCommand } from './fireSafetySimulation';
import { applyGasCommand } from './gasSimulation';
import { hotspotPresentation } from './hotspotPresentation';

const OPENING_KINDS: readonly DeviceKind[] = ['blinds', 'gate', 'garage', 'window', 'door'];
const MONITOR_KINDS: readonly DeviceKind[] = ['energy', 'water', 'air', 'smoke', 'solar', 'gas-meter', 'gas-leak'];

/** Exercise each semantic case using a real catalog instance rather than synthetic metadata. */
function deviceOfKind(kind: DeviceKind): DeviceDefinition {
  const device = DEVICES.find((candidate) => candidate.kind === kind);
  if (!device) throw new Error(`Missing catalog device for ${kind}`);
  return device;
}

describe('hotspot state across the complete house catalog', () => {
  it('audits all 92 devices and every supported kind', () => {
    expect(DEVICES).toHaveLength(92);
    expect(new Set(DEVICES.map((device) => device.kind))).toEqual(new Set(DEVICE_KINDS));
  });

  it.each(DEVICES)('$id distinguishes inactive, active and monitoring states', (device) => {
    const opening = OPENING_KINDS.includes(device.kind);
    const monitoring = MONITOR_KINDS.includes(device.kind);
    // Remembered brightness, speed and temperature must never illuminate an off device.
    const inactive = { on: false, level: opening ? 0 : 72 };
    const active = { on: true, level: opening ? 37 : 72 };
    expect(hotspotPresentation(device, inactive)).toMatchObject({ active: false, monitoring, tone: 'normal' });
    expect(hotspotPresentation(device, active)).toMatchObject({ active: !monitoring, monitoring, tone: 'normal' });
    expect(hotspotPresentation(device, inactive).stateLabel).not.toBe('');
    expect(hotspotPresentation(device, active).stateLabel).not.toBe('');
  });

  it.each(OPENING_KINDS)('%s follows its opening even when a power flag is stale', (kind) => {
    const device = deviceOfKind(kind);
    expect(hotspotPresentation(device, { on: true, level: 0 }).active).toBe(false);
    expect(hotspotPresentation(device, { on: false, level: 37 }).active).toBe(true);
  });

  it('keeps the TV dark after powering off with a remembered volume', () => {
    const device = deviceOfKind('tv');
    const current = { on: true, level: 82, settings: { volume: 82, playbackState: 'playing' } };
    const off = toggleDeviceState(device.id, current);
    expect(off).toMatchObject({ on: false, level: 82, settings: { volume: 82, playbackState: 'paused' } });
    expect(hotspotPresentation(device, off)).toMatchObject({ active: false, monitoring: false, stateLabel: 'Off' });
    expect(hotspotPresentation(device, toggleDeviceState(device.id, off))).toMatchObject({ active: true, stateLabel: 'On' });
  });

  it('tracks camera arming through the existing scene control semantics', () => {
    const device = deviceOfKind('camera');
    const armed = applyDeviceSetting(device.id, { on: false, level: 50 }, 'armed', true);
    expect(hotspotPresentation(device, armed)).toMatchObject({ active: true, stateLabel: 'Armed' });
    expect(hotspotPresentation(device, toggleDeviceState(device.id, armed))).toMatchObject({ active: false, stateLabel: 'Disarmed' });
  });

  it.each(MONITOR_KINDS)('%s sample actions remain monitoring instead of switching on', (kind) => {
    const device = deviceOfKind(kind);
    const checked = toggleDeviceState(device.id, { on: true, level: device.defaultLevel });
    expect(hotspotPresentation(device, checked)).toMatchObject({ active: false, monitoring: true, tone: 'normal' });
  });

  it('retains the entrance gate safety summary alongside its opening state', () => {
    const device = getDevice('entry-gate')!;
    const stopped = { on: true, level: 37, settings: { gateSensorFault: true } };
    expect(hotspotPresentation(device, stopped)).toMatchObject({ active: true, stateLabel: 'Sensor fault · movement blocked' });
  });
});

describe('hotspot safety signals', () => {
  it.each(['test-alarm', 'simulate-co'] as const)('keeps %s visibly in alarm after silence and acknowledgment', (command) => {
    const device = deviceOfKind('smoke');
    const alarm = applyFireCommand({ on: true, level: 0 }, command);
    const acknowledged = applyFireCommand(applyFireCommand(alarm, 'silence'), 'acknowledge');
    expect(hotspotPresentation(device, alarm)).toMatchObject({ active: false, monitoring: true, tone: 'alarm', stateLabel: 'Alarm simulation active' });
    expect(hotspotPresentation(device, acknowledged).tone).toBe('alarm');
    const clear = applyFireCommand(acknowledged, 'clear-alarm');
    expect(hotspotPresentation(device, clear)).toMatchObject({ active: false, tone: 'warning', stateLabel: 'Simulation clear · reset pending' });
    expect(hotspotPresentation(device, applyFireCommand(clear, 'reset')).tone).toBe('normal');
  });

  it('keeps a silenced gas leak in alarm until its sample is cleared', () => {
    const device = deviceOfKind('gas-leak');
    const alarm = applyGasCommand('gas-leak', { on: true, level: 0 }, 'simulate-leak');
    const silenced = applyGasCommand('gas-leak', alarm, 'silence');
    expect(hotspotPresentation(device, silenced)).toMatchObject({ active: false, monitoring: true, tone: 'alarm', stateLabel: 'Leak preview · sound silenced' });
    expect(hotspotPresentation(device, applyGasCommand('gas-leak', silenced, 'clear-leak')).tone).toBe('normal');
  });

  it('preserves meter warning, closed-valve and interlock signals without a power glow', () => {
    const device = deviceOfKind('gas-meter');
    expect(hotspotPresentation(device, { on: true, level: 70, settings: { gasRemainingKg: 1 } })).toMatchObject({ active: false, monitoring: true, tone: 'warning' });
    expect(hotspotPresentation(device, { on: true, level: 70, settings: { gasValveOpen: false } })).toMatchObject({ active: false, monitoring: true, tone: 'closed' });
    expect(hotspotPresentation(device, { on: false, level: 70, settings: { gasValveOpen: false, gasLeakInterlock: true } })).toMatchObject({ active: false, monitoring: true, tone: 'alarm' });
  });
});
