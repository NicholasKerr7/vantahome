import { BoxGeometry, Group, InstancedBufferGeometry, Mesh, MeshStandardMaterial, ShaderMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { INITIAL_STATE, type LabState } from './contracts';
import { createThreeRain } from './threeRain';
import { WEATHER_GROUPS } from './weatherAnimation';

/** Build borrowed authored meshes separately from the generated water resources. */
function weatherFixture() {
  const weatherModel = new Group();
  for (const group of WEATHER_GROUPS) {
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    mesh.name = group.name;
    weatherModel.add(mesh);
  }
  const water = weatherModel.children.filter(({ name }) => /^lab-weather-(rain|splash|runoff)-/.test(name));
  const wet = weatherModel.getObjectByName('lab-weather-wet') as Mesh<BoxGeometry, MeshStandardMaterial>;
  return { weatherModel, water, wet };
}

/** Exercise complete validated host payloads, changing only the scenario under test. */
function settings(patch: Partial<LabState> = {}): LabState {
  return { ...INITIAL_STATE, view: 'property', weather: 'storm', windSpeed: 48, windDirection: 55, ...patch };
}

/** Inspect the owned GPU pools without replacing Three.js with test doubles. */
function generatedWater(weatherModel: Group) {
  const field = weatherModel.getObjectByName('lab-three-rain-field') as Group;
  const particles = field.children as Mesh<InstancedBufferGeometry, ShaderMaterial>[];
  const wet = weatherModel.getObjectByName('lab-weather-wet') as Mesh<BoxGeometry, ShaderMaterial>;
  return { field, particles, wet, uniforms: particles[0].material.uniforms };
}

describe('Three.js rain resource ownership', () => {
  it('keeps three bounded instanced pools and their GPU allocations stable across weather and frames', () => {
    const fixture = weatherFixture();
    const authoredChildren = [...fixture.weatherModel.children];
    const effects = createThreeRain(fixture.weatherModel);
    const { field, particles, wet, uniforms } = generatedWater(fixture.weatherModel);
    const resources = particles.map(({ geometry, material }) => ({ geometry, material }));
    const wetGeometry = wet.geometry;
    expect(fixture.water).toHaveLength(20);
    expect(particles).toHaveLength(3);
    expect(particles.map(({ geometry }) => geometry.instanceCount)).toEqual([720, 336, 56]);
    for (const particle of particles) {
      expect(particle.geometry).toBeInstanceOf(InstancedBufferGeometry);
      expect(particle.material.uniforms).toBe(uniforms);
      expect(particle.material.depthTest).toBe(true);
      expect(particle.material.depthWrite).toBe(false);
      expect(particle.castShadow).toBe(false);
      expect(particle.receiveShadow).toBe(false);
    }
    expect(wet.material.uniforms).toBe(uniforms);
    for (const weather of ['light', 'heavy', 'storm', 'clear', 'storm'] as const) {
      effects.apply(settings({ weather }));
      for (let frame = 0; frame < 120; frame++) effects.update(frame / 60);
      expect(fixture.weatherModel.children).toEqual([...authoredChildren, field]);
      particles.forEach((particle, index) => {
        expect(particle.geometry).toBe(resources[index].geometry);
        expect(particle.material).toBe(resources[index].material);
      });
      expect(wet.geometry).toBe(wetGeometry);
      expect(fixture.water.every((node) => !node.visible)).toBe(true);
    }
    effects.dispose();
  });

  it('switches weather strength and stops moving water immediately while retaining a static wet coat', () => {
    const fixture = weatherFixture();
    const effects = createThreeRain(fixture.weatherModel);
    const { field, wet, uniforms } = generatedWater(fixture.weatherModel);
    for (const [weather, strength] of [['clear', 0], ['light', 1], ['heavy', 2], ['storm', 3]] as const) {
      effects.apply(settings({ weather }));
      expect(uniforms.uIntensity.value).toBe(strength);
      expect(field.visible).toBe(weather !== 'clear');
    }
    effects.update(5.9);
    effects.apply(settings({ motion: false, night: true }));
    expect(field.visible).toBe(false);
    expect(uniforms.uMotion.value).toBe(0);
    expect(uniforms.uNight.value).toBe(1);
    expect(uniforms.uIntensity.value).toBe(3);
    expect(wet.visible).toBe(true);
    effects.update(15);
    expect(uniforms.uTime.value).toBe(5.9);
    effects.apply(settings({ motion: false, weather: 'clear' }));
    expect(field.visible).toBe(false);
    expect(uniforms.uIntensity.value).toBe(0);
    expect(fixture.water.every((node) => !node.visible)).toBe(true);
    effects.apply(settings({ motion: true }));
    effects.update(16);
    expect(field.visible).toBe(true);
    expect(uniforms.uTime.value).toBe(16);
    effects.dispose();
  });

  it('updates a shared clock and viewport without reallocating or propagating invalid values', () => {
    const fixture = weatherFixture();
    const effects = createThreeRain(fixture.weatherModel);
    const { uniforms } = generatedWater(fixture.weatherModel);
    effects.apply(settings({ windSpeed: 180, windDirection: 90 }));
    expect(uniforms.uWind.value.x).toBeCloseTo(55 / 650);
    expect(uniforms.uWind.value.y).toBeCloseTo(0);
    effects.update(4);
    effects.resize(844);
    effects.update(Number.NaN);
    effects.resize(Number.POSITIVE_INFINITY);
    expect(uniforms.uTime.value).toBe(4);
    expect(uniforms.uViewportHeight.value).toBe(844);
    effects.update(-1);
    effects.resize(0);
    expect(uniforms.uTime.value).toBe(0);
    expect(uniforms.uViewportHeight.value).toBe(1);
    effects.dispose();
  });

  it('restores borrowed visibility and materials exactly and releases only generated allocations once', () => {
    const fixture = weatherFixture();
    fixture.water[0].visible = false;
    const originalVisibility = fixture.water.map(({ visible }) => visible);
    const originalMaterial = fixture.wet.material;
    const originalGeometry = fixture.wet.geometry;
    const releaseBorrowedMaterial = vi.spyOn(originalMaterial, 'dispose');
    const releaseBorrowedGeometry = vi.spyOn(originalGeometry, 'dispose');
    const effects = createThreeRain(fixture.weatherModel);
    const { field, particles, wet, uniforms } = generatedWater(fixture.weatherModel);
    const releases = particles.flatMap(({ geometry, material }) => [vi.spyOn(geometry, 'dispose'), vi.spyOn(material, 'dispose')]);
    releases.push(vi.spyOn(wet.material, 'dispose'));
    effects.apply(settings());
    effects.update(2);
    effects.dispose();
    effects.dispose();
    effects.apply(settings({ weather: 'light', night: true }));
    effects.update(100);
    effects.resize(1);
    expect(fixture.weatherModel.getObjectByName(field.name)).toBeUndefined();
    expect(fixture.wet.material).toBe(originalMaterial);
    expect(fixture.wet.geometry).toBe(originalGeometry);
    expect(fixture.water.map(({ visible }) => visible)).toEqual(originalVisibility);
    releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
    expect(releaseBorrowedMaterial).not.toHaveBeenCalled();
    expect(releaseBorrowedGeometry).not.toHaveBeenCalled();
    expect(uniforms.uTime.value).toBe(2);
    expect(uniforms.uIntensity.value).toBe(3);
    expect(uniforms.uNight.value).toBe(0);
    expect(uniforms.uViewportHeight.value).toBe(720);
  });

  it('fails before hiding authored water or adding resources when the wet surface is missing', () => {
    const fixture = weatherFixture();
    fixture.weatherModel.remove(fixture.wet);
    const originalChildren = [...fixture.weatherModel.children];
    expect(() => createThreeRain(fixture.weatherModel)).toThrow('missing its pavement surface');
    expect(fixture.weatherModel.children).toEqual(originalChildren);
    expect(fixture.water.every((node) => node.visible)).toBe(true);
  });
});
