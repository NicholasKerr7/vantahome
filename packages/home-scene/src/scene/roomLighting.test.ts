import { describe, expect, it } from 'vitest';
import { DEVICES } from '../data';
import { createDefaultSimulationSnapshot, mergeSimulationChanges } from '../simulationBridgeProtocol';
import { roomFillLights } from './roomLighting';
import { UPPER_ELEVATION } from './types';

describe('device-controlled room illumination', () => {
  it('removes all interior fill when a bulk lights-off command is applied, at day and night', () => {
    const initial = createDefaultSimulationSnapshot();
    const changes = Object.fromEntries(DEVICES.filter((device) => device.kind === 'light')
      .map((device) => [device.id, { ...initial.deviceStates[device.id], on: false }]));
    const { deviceStates } = mergeSimulationChanges(initial, { deviceStates: changes });
    for (const night of [false, true]) {
      const lights = roomFillLights({ deviceStates, view: 'exterior', floor: 'ground', night });
      expect(lights).toHaveLength(6);
      expect(lights.every((light) => light.intensity === 0)).toBe(true);
    }
  });

  it('tracks living-room power, brightness and color without changing another room', () => {
    const { deviceStates } = createDefaultSimulationSnapshot();
    deviceStates['living-light'] = { on: true, level: 50, settings: { color: '#123456', lightColorMode: 'color' } };
    const options = { deviceStates, view: 'ground', floor: 'ground', night: false } as const;
    const on = roomFillLights(options);
    expect(on.find((light) => light.id === 'living-light')).toMatchObject({ intensity: 3.5, color: '#123456' });
    deviceStates['living-light'] = { ...deviceStates['living-light'], on: false };
    const off = roomFillLights(options);
    expect(off.find((light) => light.id === 'living-light')?.intensity).toBe(0);
    expect(off.filter((light) => light.id !== 'living-light')).toEqual(on.filter((light) => light.id !== 'living-light'));
  });

  it('keeps upper-floor emitters aligned in both floor-plan and immersive views', () => {
    const { deviceStates } = createDefaultSimulationSnapshot();
    const upper = roomFillLights({ deviceStates, view: 'upper', floor: 'upper', night: true });
    const full = roomFillLights({ deviceStates, view: 'immersive', floor: 'upper', night: true });
    expect(upper.map((light) => light.id)).toEqual(['family-light', 'master-light', 'gym-light']);
    for (const light of upper) {
      expect(full.find((candidate) => candidate.id === light.id)?.position[1]).toBeCloseTo(light.position[1] + UPPER_ELEVATION);
    }
  });

  it('treats missing light state as off instead of leaving decorative illumination on', () => {
    expect(roomFillLights({ deviceStates: {}, view: 'exterior', floor: 'ground', night: true })
      .every((light) => light.intensity === 0)).toBe(true);
  });
});
