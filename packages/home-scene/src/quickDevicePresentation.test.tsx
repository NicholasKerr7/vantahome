import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEVICES, getDevice } from './data';
import { applyDeviceSetting, toggleDeviceState } from './deviceControlActions';
import { primaryDeviceAction, primaryDeviceRange } from './quickDevicePresentation';
import { PrimaryDeviceRange } from './PrimaryDeviceRange';
import { controlPageCapacity } from './useControlPageCapacity';

describe('consistent quick controls across the property', () => {
  it('gives every light, fan, AC and opening a schema-backed primary setting', () => {
    const expected = ['light', 'fan', 'ac', 'blinds', 'gate', 'garage', 'door', 'window', 'speaker', 'tv'];
    for (const device of DEVICES.filter((candidate) => expected.includes(candidate.kind))) {
      const range = primaryDeviceRange(device, { on: device.defaultOn, level: device.defaultLevel });
      expect(range, device.id).not.toBeNull();
      expect(range!.value, device.id).toBeGreaterThanOrEqual(range!.capability.min);
      expect(range!.value, device.id).toBeLessThanOrEqual(range!.capability.max);
    }
  });

  it('does not expose a writable quick range or power switch for monitoring samples', () => {
    for (const device of DEVICES.filter((candidate) => ['energy', 'solar', 'water', 'smoke', 'air', 'gas-meter', 'gas-leak'].includes(candidate.kind))) {
      const state = { on: true, level: device.defaultLevel };
      expect(primaryDeviceRange(device, state), device.id).toBeNull();
      expect(primaryDeviceAction(device, state).isSwitch, device.id).toBe(false);
    }
  });

  it('keeps an off light off while adjusting its remembered brightness', () => {
    const device = DEVICES.find((candidate) => candidate.kind === 'light' && candidate.id !== 'living-light')!;
    const state = applyDeviceSetting(device.id, { on: false, level: 60 }, 'brightness', 32);
    expect(state).toMatchObject({ on: false, level: 32 });
    expect(primaryDeviceRange(device, state)).toMatchObject({ value: 32, text: '32%', hint: 'Value kept while off' });
    expect(toggleDeviceState(device.id, state)).toMatchObject({ on: true, level: 32 });
  });

  it('uses Celsius for every AC without replacing temperature with an animation percentage', () => {
    for (const device of DEVICES.filter((candidate) => candidate.kind === 'ac')) {
      const state = applyDeviceSetting(device.id, { on: false, level: 50 }, 'tempC', 27);
      const range = primaryDeviceRange(device, state)!;
      expect(range).toMatchObject({ value: 27, text: '27°C', label: 'Target temperature' });
      expect(state.on).toBe(false);
    }
  });

  it('updates opening state and volume through their actual settings', () => {
    const blinds = getDevice('master-blinds')!;
    const partial = applyDeviceSetting(blinds.id, { on: false, level: 0 }, 'openPercent', 35);
    expect(partial).toMatchObject({ on: true, level: 35 });
    expect(primaryDeviceAction(blinds, partial)).toMatchObject({ isSwitch: false, label: 'Close blinds' });
    const speaker = DEVICES.find((candidate) => candidate.kind === 'speaker')!;
    const state = applyDeviceSetting(speaker.id, { on: true, level: 50 }, 'volume', 22);
    expect(primaryDeviceRange(speaker, state)).toMatchObject({ value: 22, text: '22%' });
    expect(state.level).toBe(50);
  });

  it('provides consistent range bounds, labels and off-state guidance on both layouts', () => {
    const device = getDevice('master-ac')!;
    for (const location of ['quick', 'dashboard'] as const) {
      const markup = renderToStaticMarkup(<PrimaryDeviceRange device={device} current={{ on: false, level: 50 }} location={location} />);
      expect(markup).toContain('Target temperature');
      expect(markup).toContain('min="15" max="28"');
      expect(markup).toContain(`aria-describedby="${location}-level-master-ac-hint"`);
      expect(markup).toContain('Value kept while off');
    }
  });
});

describe('measured full-control capacity', () => {
  it('keeps a useful page when headers consume a short panel', () => {
    expect(controlPageCapacity(150, true)).toEqual({ fields: 1, actions: 2 });
    expect(controlPageCapacity(250, true)).toEqual({ fields: 2, actions: 6 });
    expect(controlPageCapacity(500, false)).toEqual({ fields: 3, actions: 6 });
  });
});
