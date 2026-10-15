import { afterEach, describe, expect, it } from 'vitest';
import { AUTHORED_DEVICES, DEVICES, ROOMS, getDevice } from './data';
import { buildRuntimeDeviceDefinitions, canPlaceDeviceInRoom, clampDevicePlacement, createDefaultDevicePlacement, getRuntimePlacements, HOUSE_PLACEMENT_EXCLUSION_BOUNDS, MAX_RUNTIME_DEVICES, parseRuntimePlacedDevices, parseSimulationDevicePlacement, replaceRuntimeDevices, SIMULATION_DEVICE_TEMPLATES, type RuntimePlacedDevice } from './devicePlacement';
import { getDeviceFixtureGeometry } from './scene/deviceGeometry';

const id = 'placed-00000000-0000-4000-8000-000000000001';
/** Produce a reproducible legal room fixture without weakening production validation. */
function placed(templateId = 'master-light', modelRoomId = 'living'): RuntimePlacedDevice {
  return { id, name: 'New light', placement: createDefaultDevicePlacement(templateId, modelRoomId)! };
}
afterEach(() => { replaceRuntimeDevices([]); });

describe('bounded simulation device placement', () => {
  it.each(SIMULATION_DEVICE_TEMPLATES)('$id has a complete reusable local shell and a round-trippable pose', (template) => {
    const entry = placed(template.id, template.outdoor ? 'grounds' : 'living');
    expect(parseSimulationDevicePlacement(entry.placement)).toEqual(entry.placement);
    const [device] = buildRuntimeDeviceDefinitions([entry]);
    expect(device.kind).toBe(template.kind);
    expect(device.templateDeviceId).toBe(template.sourceDeviceId);
    expect(getDeviceFixtureGeometry(device)?.parts.some((part) => part.role === 'static')).toBe(true);
    expect(device.defaultOn).toBe(template.kind === 'air');
  });

  it('supports only compatible rooms and never assigns an unknown room to the default room', () => {
    expect(createDefaultDevicePlacement('master-light', 'missing')).toBeNull();
    expect(createDefaultDevicePlacement('master-light', 'grounds')).toBeNull();
    expect(createDefaultDevicePlacement('grounds-light', 'living')).toBeNull();
    expect(createDefaultDevicePlacement('grounds-light', 'utility')).toBeNull();
    expect(createDefaultDevicePlacement('unknown', 'living')).toBeNull();
    for (const room of ROOMS) expect(canPlaceDeviceInRoom('master-light', room.id)).toBe(!room.outdoor);
  });

  it('all indoor templates start with finite room-contained geometry, including narrow bathrooms', () => {
    for (const room of ROOMS.filter((entry) => !entry.outdoor)) {
      for (const template of SIMULATION_DEVICE_TEMPLATES.filter((entry) => !entry.outdoor)) {
        const pose = createDefaultDevicePlacement(template.id, room.id);
        if (!pose) continue; // A ceiling fan may be wider than a narrow bathroom.
        expect(parseSimulationDevicePlacement(pose), `${template.id}/${room.id}`).toEqual(pose);
        const [left, right, back, front] = room.bounds!;
        expect(pose.position[0]).toBeGreaterThan(left);
        expect(pose.position[0]).toBeLessThan(right);
        expect(pose.position[2]).toBeGreaterThan(back);
        expect(pose.position[2]).toBeLessThan(front);
      }
    }
  });

  it('snaps wall equipment inward and clamps its height instead of allowing floating or reversed hardware', () => {
    const base = placed('master-ac').placement;
    const room = ROOMS.find((entry) => entry.id === 'living')!;
    const next = clampDevicePlacement({ ...base, position: [room.bounds![0] - 10, 20, room.center[1]], rotationY: 9 })!;
    expect(next.rotationY).toBe(Math.PI / 2);
    expect(next.position[1]).toBeLessThanOrEqual(2.3);
    expect(parseSimulationDevicePlacement(next)).toEqual(next);
    expect(parseSimulationDevicePlacement({ ...next, rotationY: 0 })).toBeNull();
  });

  it('keeps ceiling fixtures at the authored room ceiling and path lights on the ground', () => {
    const pose = placed('master-light', 'master').placement;
    expect(clampDevicePlacement({ ...pose, position: [pose.position[0], 0, pose.position[2]] })?.position[1]).toBe(pose.position[1]);
    expect(placed('grounds-light', 'grounds').placement.position[1]).toBe(-0.35);
  });

  it('moves outdoor drafts to the nearest clear house edge and rejects an overlapping saved pose', () => {
    const base = placed('grounds-light', 'grounds').placement;
    const inside = { ...base, position: [8, -0.35, -2] as [number, number, number] };
    expect(parseSimulationDevicePlacement(inside)).toBeNull();
    const adjusted = clampDevicePlacement(inside)!;
    expect(adjusted.position[0]).toBe(8);
    expect(adjusted.position[2]).toBeGreaterThan(HOUSE_PLACEMENT_EXCLUSION_BOUNDS[3]);
    expect(parseSimulationDevicePlacement(adjusted)).toEqual(adjusted);
    expect(clampDevicePlacement(adjusted)).toEqual(adjusted);
  });

  it.each([0, Math.PI / 4, Math.PI / 2])('keeps the full rotated bollard clear of each house edge at yaw %s', (rotationY) => {
    const base = placed('grounds-light', 'grounds').placement;
    const [left, right, back, front] = HOUSE_PLACEMENT_EXCLUSION_BOUNDS;
    const source = AUTHORED_DEVICES.find((device) => device.id === 'grounds-light')!;
    const xMargin = Math.abs(Math.cos(rotationY)) * source.dimensions[0] / 2 + Math.abs(Math.sin(rotationY)) * source.dimensions[2] / 2 + 0.04;
    const zMargin = Math.abs(Math.sin(rotationY)) * source.dimensions[0] / 2 + Math.abs(Math.cos(rotationY)) * source.dimensions[2] / 2 + 0.04;
    for (const [x, z] of [[left, -8], [right, -8], [8, back], [8, front]]) {
      const adjusted = clampDevicePlacement({ ...base, position: [x, -0.35, z], rotationY })!;
      const [nextX, , nextZ] = adjusted.position;
      expect(nextX <= left - xMargin + 1e-9 || nextX >= right + xMargin - 1e-9 || nextZ <= back - zMargin + 1e-9 || nextZ >= front + zMargin - 1e-9).toBe(true);
      expect(parseSimulationDevicePlacement(adjusted)).toEqual(adjusted);
    }
  });

  it.each([
    { version: 2 }, { templateId: 'entry-gate' }, { modelRoomId: 'missing' }, { mount: 'floor' },
    { position: [Infinity, 1, 0] }, { position: [0, 0] }, { rotationY: Number.NaN },
    { rotationY: 100 }, { assetUrl: 'https://example.test/arbitrary.glb' }, { dimensions: [100, 100, 100] },
  ])('rejects malformed placement %# rather than repairing untrusted persistence', (patch) => {
    expect(parseSimulationDevicePlacement({ ...placed().placement, ...patch })).toBeNull();
  });

  it('rejects arbitrary identities, duplicate devices, excessive catalogs and executable data fields', () => {
    const entry = placed();
    expect(parseRuntimePlacedDevices([{ ...entry, id: 'entry-gate' }])).toBeNull();
    expect(parseRuntimePlacedDevices([entry, entry])).toBeNull();
    expect(parseRuntimePlacedDevices([{ ...entry, name: 'A'.repeat(81) }])).toBeNull();
    expect(parseRuntimePlacedDevices([{ ...entry, name: 'Bad\nname' }])).toBeNull();
    expect(parseRuntimePlacedDevices([{ ...entry, physicalEntityId: 'switch.real' }])).toBeNull();
    const many = Array.from({ length: MAX_RUNTIME_DEVICES + 1 }, (_, index) => ({ ...entry, id: `placed-00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }));
    expect(parseRuntimePlacedDevices(many)).toBeNull();
  });

  it('replaces the active catalog without duplicating authored fixtures or leaking a previous home', () => {
    const catalogReference = DEVICES;
    const entry = placed();
    expect(replaceRuntimeDevices([entry])).toBe(true);
    expect(DEVICES).toBe(catalogReference);
    expect(DEVICES).toHaveLength(AUTHORED_DEVICES.length + 1);
    expect(getDevice(id)?.name).toBe(entry.name);
    const copy = getRuntimePlacements();
    copy[0].name = 'Changed outside';
    copy[0].placement.position[0] = 1000;
    expect(getRuntimePlacements()).toEqual([entry]);
    expect(replaceRuntimeDevices([{ ...entry, id: 'entry-gate' }])).toBe(false);
    expect(getDevice(id)?.name).toBe(entry.name);
    expect(replaceRuntimeDevices([])).toBe(true);
    expect(getDevice(id)).toBeUndefined();
    expect(DEVICES).toHaveLength(AUTHORED_DEVICES.length);
  });
});
