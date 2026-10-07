import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from '../sceneAccess';
import { createDefaultState } from '../state';
import { scopeSceneDeviceStates, requiresRoomIsolation } from './scenePresentationAccess';
import { prepareExteriorOverview, disposeExteriorOverview } from './roomPrivacy';
import { roomFillLights } from './roomLighting';
import { getExteriorPrivacyDistance, getLandscapeCamera } from './siteGeometry';

const overview = { ...EMPTY_SCENE_ACCESS, propertyOverview: true, roomIds: ['master'], deviceIds: ['master-light'] };

describe('shared property presentation privacy', () => {
  it('isolates assigned interiors while allowing the exterior shell and explicitly shared floor layouts', () => {
    expect(requiresRoomIsolation(overview, 'exterior')).toBe(false);
    expect(requiresRoomIsolation(overview, 'upper')).toBe(true);
    expect(requiresRoomIsolation(overview, 'immersive')).toBe(true);
    expect(requiresRoomIsolation({ ...overview, interiorLayout: true }, 'upper')).toBe(false);
    expect(requiresRoomIsolation(FULL_SCENE_ACCESS, 'upper')).toBe(false);
    expect(requiresRoomIsolation(EMPTY_SCENE_ACCESS, 'exterior')).toBe(true);
  });

  it('removes all hidden readings and settings before animated fixtures, lighting, and gate consumers', () => {
    const states = createDefaultState().deviceStates;
    for (const id of ['entry-gate', 'laundry-washer', 'living-light', 'master-blinds']) {
      states[id] = { on: true, level: 100, settings: { openPercent: 100, brightness: 100 } };
    }
    states['master-light'] = { on: true, level: 75 };
    const visible = scopeSceneDeviceStates(states, overview);
    for (const id of ['entry-gate', 'laundry-washer', 'living-light', 'master-blinds']) {
      expect(visible[id]).toEqual({ on: false, level: 0 });
    }
    expect(visible['master-light']).toEqual(states['master-light']);
    expect(states['entry-gate'].level).toBe(100);
    const fills = roomFillLights({ deviceStates: visible, view: 'exterior', floor: 'ground', night: true });
    expect(fills.find((fill) => fill.id === 'living-light')?.intensity).toBe(0);
    expect(fills.find((fill) => fill.id === 'master-light')?.intensity).toBeGreaterThan(0);
  });

  it('conceals furnished interior batches and uses opaque glazing without changing the cached owner asset', () => {
    const source = new Group();
    const geometry = new BoxGeometry(1, 1, 1);
    const glass = new MeshStandardMaterial({ transparent: true, opacity: 0.3 });
    for (const name of ['ground--glass', 'upper--furniture-oak', 'ground--luxury-device-screen', 'washer-drum', 'roof--chalk']) {
      const mesh = new Mesh(geometry, glass); mesh.name = name; source.add(mesh);
    }
    const copy = prepareExteriorOverview(source);
    expect(copy.getObjectByName('upper--furniture-oak')?.visible).toBe(false);
    expect(copy.getObjectByName('ground--luxury-device-screen')?.visible).toBe(false);
    expect(copy.getObjectByName('washer-drum')?.visible).toBe(false);
    expect(copy.getObjectByName('roof--chalk')?.visible).toBe(true);
    const window = copy.getObjectByName('ground--glass') as Mesh;
    expect(window.material).toMatchObject({ transparent: false, opacity: 1 });
    expect(window.material).not.toBe(glass);
    expect(source.getObjectByName('upper--furniture-oak')?.visible).toBe(true);
    expect(glass.opacity).toBe(0.3);
    disposeExteriorOverview(copy); geometry.dispose(); glass.dispose();
  });

  it.each([375 / 812, 430 / 932, 768 / 1024, 1024 / 768])('keeps the fitted exterior camera outside the house at aspect %s', (aspect) => {
    const { position, target } = getLandscapeCamera(aspect);
    const distance = Math.hypot(...position.map((value, axis) => value - target[axis]!));
    expect(getExteriorPrivacyDistance(target)).toBeLessThan(distance);
    expect(getExteriorPrivacyDistance(target)).toBeGreaterThan(10);
  });
});
