import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, Scene } from 'three';
import { INITIAL_STATE, type LabState } from './contracts';
import { createStormEffects } from './stormEffects';
import { ORIGINAL_WEATHER_FOLIAGE_NAMES, WEATHER_GROUPS } from './weatherAnimation';

/** Build real Three.js resources without requiring a WebGL context in unit tests. */
function testScene() {
  const scene = new Scene();
  const landscape = new Group();
  const exterior = new Group();
  const weatherModel = new Group();
  const pavement = new MeshStandardMaterial({ name: 'Site Paving', color: '#c5c1aa', roughness: 0.8 });
  const grass = new MeshStandardMaterial({ name: 'Site Lawn', color: '#3f715b', roughness: 0.9 });
  const roof = new MeshStandardMaterial({ name: 'Clay', color: '#8c6f58', roughness: 0.85 });
  const indoor = new MeshStandardMaterial({ name: 'Furniture_clay', color: '#b48c77', roughness: 0.7 });
  landscape.add(new Mesh(new BoxGeometry(), pavement), new Mesh(new BoxGeometry(), grass));
  const roofMesh = new Mesh(new BoxGeometry(), roof);
  roofMesh.name = 'roof--clay';
  exterior.add(roofMesh, new Mesh(new BoxGeometry(), indoor));
  for (const name of ORIGINAL_WEATHER_FOLIAGE_NAMES) {
    const original = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    original.name = name.replaceAll(' ', '_');
    landscape.add(original);
  }
  for (const group of WEATHER_GROUPS) {
    const node = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    node.name = group.name;
    weatherModel.add(node);
  }
  const ambient = new HemisphereLight();
  const sun = new DirectionalLight();
  scene.add(landscape, exterior, weatherModel, ambient, sun);
  return { scene, landscape, exterior, weatherModel, ambient, sun, pavement, grass, roof, indoor };
}

/** Match the host's simulation payload while allowing one scenario to change its weather. */
function settings(patch: Partial<LabState> = {}): LabState {
  return { ...INITIAL_STATE, view: 'property', weather: 'storm', windSpeed: 48, windDirection: 55, ...patch };
}

describe('property weather resource ownership', () => {
  it('wets only exposed roof and paving and restores dry material values exactly', () => {
    const fixture = testScene();
    const originalRoof = fixture.roof.color.clone();
    const originalPavement = fixture.pavement.color.clone();
    const effects = createStormEffects(fixture);
    effects.apply(settings());
    expect(fixture.roof.roughness).toBeCloseTo(0.2);
    expect(fixture.pavement.roughness).toBeCloseTo(0.2);
    expect(fixture.roof.color.r).toBeLessThan(originalRoof.r);
    expect(fixture.grass.roughness).toBe(0.9);
    expect(fixture.indoor.roughness).toBe(0.7);
    effects.apply(settings({ weather: 'clear' }));
    expect(fixture.roof.roughness).toBe(0.85);
    expect(fixture.pavement.roughness).toBe(0.8);
    expect(fixture.roof.color).toEqual(originalRoof);
    expect(fixture.pavement.color).toEqual(originalPavement);
    effects.dispose();
  });

  it('retains replacement plants and static wetness while reduced motion removes precipitation and flashes', () => {
    const fixture = testScene();
    const effects = createStormEffects(fixture);
    effects.apply(settings({ motion: false }));
    for (const group of WEATHER_GROUPS) {
      const node = fixture.weatherModel.getObjectByName(group.name)!;
      if (group.kind === 'plant' || group.kind === 'wet') expect(node.visible).toBe(true);
      else expect(node.visible).toBe(false);
    }
    expect(fixture.pavement.roughness).toBeCloseTo(0.2);
    const flash = fixture.scene.getObjectByName('lab-weather-sky-flash') as DirectionalLight;
    effects.update(0.08);
    expect(flash.intensity).toBe(0);
    effects.dispose();
  });

  it('keeps a fixed weather pool, restores hidden source foliage, and disposes its one temporary light', () => {
    const fixture = testScene();
    const originalCount = fixture.scene.children.length;
    const effects = createStormEffects(fixture);
    const flash = fixture.scene.getObjectByName('lab-weather-sky-flash') as DirectionalLight;
    const release = vi.spyOn(flash, 'dispose');
    effects.apply(settings());
    const initialPositions = fixture.weatherModel.children.map((node) => node.position.clone());
    for (let index = 0; index < 180; index += 1) effects.update(0.08);
    expect(fixture.weatherModel.children.length).toBe(WEATHER_GROUPS.length);
    expect(fixture.scene.children.length).toBe(originalCount + 2);
    expect(fixture.weatherModel.children.some((node, index) => !node.position.equals(initialPositions[index]))).toBe(true);
    for (const name of ORIGINAL_WEATHER_FOLIAGE_NAMES) {
      expect(fixture.landscape.getObjectByName(name.replaceAll(' ', '_'))?.visible).toBe(false);
    }
    effects.dispose();
    effects.dispose();
    expect(fixture.scene.children.length).toBe(originalCount);
    expect(release).toHaveBeenCalledTimes(1);
    for (const name of ORIGINAL_WEATHER_FOLIAGE_NAMES) {
      expect(fixture.landscape.getObjectByName(name.replaceAll(' ', '_'))?.visible).toBe(true);
    }
  });

  it('does not hide live foliage or allocate lights when packaged weather nodes are missing', () => {
    const fixture = testScene();
    const originalCount = fixture.scene.children.length;
    fixture.weatherModel.clear();
    expect(() => createStormEffects(fixture)).toThrow('weather model is missing');
    expect(fixture.scene.children.length).toBe(originalCount);
    for (const name of ORIGINAL_WEATHER_FOLIAGE_NAMES) {
      expect(fixture.landscape.getObjectByName(name.replaceAll(' ', '_'))?.visible).toBe(true);
    }
  });
});
