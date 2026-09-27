import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import manifest from '../house-manifest.json';
import library from '../device-geometry.json';
import { modelsForView } from './models';
import { SOLAR_LIGHT_CONE, SOLAR_LIGHT_RADIUS, SOLAR_LIGHT_RIG } from './solarLighting';
import { createSolarLights, setSolarNight } from './solarLights';

describe('renderer comparison solar lights', () => {
  it('places all four emitters directly below their catalog diffusers and aims them inward', () => {
    const devices = manifest.devices.filter((device) => device.model === 'solar-streetlight');
    expect(SOLAR_LIGHT_RIG).toHaveLength(devices.length);
    for (const rig of SOLAR_LIGHT_RIG) {
      const device = devices.find(({ id }) => id === rig.id)!;
      const geometry = library.devices[rig.id as keyof typeof library.devices];
      const glow = geometry.parts.find(({ role }) => role === 'glow')!;
      const angle = device.rotation[1];
      expect(rig.position[0]).toBeCloseTo(device.position[0] + glow.position[2] * Math.sin(angle), 6);
      expect(rig.position[1]).toBeCloseTo(device.position[1] + glow.position[1] - 0.01, 6);
      expect(rig.position[2]).toBeCloseTo(device.position[2] + glow.position[2] * Math.cos(angle), 6);
      expect(Math.hypot(...rig.direction)).toBeCloseTo(1, 8);
      expect(rig.direction[1]).toBeLessThan(-0.98);
      const horizontalAim = Math.hypot(rig.target[0] - rig.position[0], rig.target[2] - rig.position[2]);
      expect(horizontalAim).toBeCloseTo(0.5, 8);
      expect(rig.target[1]).toBeCloseTo(device.position[1] + 0.02, 8);
    }
  });

  it('automatically lights four warm pools at night and removes emission in daylight without shadow maps', () => {
    const model = new Group();
    const geometry = new BoxGeometry(0.225, 0.012, 0.64);
    for (const rig of SOLAR_LIGHT_RIG) {
      const fixture = new Mesh(geometry, new MeshStandardMaterial({ emissive: '#ffe2ad' }));
      fixture.name = `lab-light-${rig.id}`;
      model.add(fixture);
    }
    const lamps = createSolarLights(model);
    expect(lamps).toHaveLength(4);
    setSolarNight(lamps, true);
    for (const [index, { light, material }] of lamps.entries()) {
      expect(light.position.toArray()).toEqual(SOLAR_LIGHT_RIG[index].position);
      expect(light.target.position.toArray()).toEqual(SOLAR_LIGHT_RIG[index].target);
      expect(light.target.parent).toBe(model);
      expect(light.intensity).toBe(64);
      expect(light.angle).toBe(SOLAR_LIGHT_CONE[1]);
      expect(light.distance).toBe(SOLAR_LIGHT_RADIUS);
      expect(light.castShadow).toBe(false);
      expect(material.emissiveIntensity).toBeGreaterThan(0);
    }
    setSolarNight(lamps, false);
    for (const { light, material } of lamps) {
      expect(light.intensity).toBe(0);
      expect(material.emissiveIntensity).toBe(0);
      light.dispose();
      material.dispose();
    }
    geometry.dispose();
  });

  it('loads the solar asset only in the property comparison and rejects a missing diffuser', () => {
    expect(modelsForView('property')).toEqual(['exterior', 'landscape', 'gate', 'solar', 'rain']);
    expect(modelsForView('bedroom')).toEqual(['upper', 'fixtures']);
    expect(() => createSolarLights(new Group())).toThrow('grounds-solar-nw');
  });
});
