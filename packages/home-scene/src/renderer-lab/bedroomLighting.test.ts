import { readFileSync } from 'node:fs';
import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import {
  BEDROOM_DIFFUSER_OFFSET, BEDROOM_LIGHT_COLOR, BEDROOM_LIGHT_INTENSITY,
  BEDROOM_LIGHT_LINEAR_COLOR, BEDROOM_LIGHT_RADIUS, BEDROOM_LIGHT_RIG,
} from './bedroomLighting';

interface FixtureDocument {
  nodes: { name: string; translation: number[]; mesh: number }[];
  meshes: { primitives: { attributes: { POSITION: number } }[] }[];
  accessors: { min: number[]; max: number[] }[];
}

/** Inspect the committed GLB JSON directly, without an image decoder or graphics context. */
function fixtureDocument(): FixtureDocument {
  const bytes = readFileSync(new URL('../../../../assets/renderer-lab/fixtures.glb', import.meta.url));
  expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength)) as FixtureDocument;
}

describe('shared bedroom light rig', () => {
  it('aligns all three emitters below their actual exported diffusers', () => {
    const document = fixtureDocument();
    const nodes = document.nodes.filter(({ name }) => name.startsWith('lab-light-'));
    expect(BEDROOM_LIGHT_RIG).toHaveLength(nodes.length);
    expect(new Set(BEDROOM_LIGHT_RIG.map(({ id }) => id)).size).toBe(3);
    for (const light of BEDROOM_LIGHT_RIG) {
      const fixture = nodes.find(({ name }) => name === `lab-light-${light.id}`)!;
      expect(fixture).toBeDefined();
      expect(light.position[0]).toBeCloseTo(fixture.translation[0], 5);
      expect(light.position[1]).toBeCloseTo(fixture.translation[1] - BEDROOM_DIFFUSER_OFFSET, 5);
      expect(light.position[2]).toBeCloseTo(fixture.translation[2], 5);
      const primitive = document.meshes[fixture.mesh].primitives[0];
      const bounds = document.accessors[primitive.attributes.POSITION];
      expect(light.position[1]).toBeLessThan(fixture.translation[1] + bounds.min[1]);
    }
  });

  it('preserves the Three.js light color, intensity, and falloff while sharing its linear color with native', () => {
    expect(BEDROOM_LIGHT_INTENSITY).toBe(18);
    expect(BEDROOM_LIGHT_RADIUS).toBe(7);
    expect(BEDROOM_LIGHT_COLOR).toBe('#ffe2b8');
    const linear = new Color(BEDROOM_LIGHT_COLOR).toArray();
    for (let channel = 0; channel < 3; channel++) {
      expect(BEDROOM_LIGHT_LINEAR_COLOR[channel]).toBeCloseTo(linear[channel], 10);
    }
  });
});
