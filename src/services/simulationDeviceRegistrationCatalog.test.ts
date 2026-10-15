import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AUTHORED_DEVICES, ROOMS } from '../../packages/home-scene/src/data';
import {
  SIMULATION_DEVICE_TEMPLATES, buildRuntimeDeviceDefinitions, createDefaultDevicePlacement,
  HOUSE_PLACEMENT_EXCLUSION_BOUNDS,
} from '../../packages/home-scene/src/devicePlacement';

const migration = readFileSync(resolve(__dirname, '../../supabase/migrations/025_simulation_device_registration.sql'), 'utf8');
const groundsMigration = readFileSync(resolve(__dirname, '../../supabase/migrations/026_simulation_grounds_placement.sql'), 'utf8');

test('database templates use the exact supported kinds, mounts and standalone fixture footprints', () => {
  const fixtures = JSON.parse(migration.match(/\$templates\$([\s\S]*?)\$templates\$/)![1]) as Array<{ id: string }>;
  const expected = SIMULATION_DEVICE_TEMPLATES.map((template) => {
    const placement = createDefaultDevicePlacement(template.id, template.outdoor ? 'grounds' : 'living')!;
    const definition = buildRuntimeDeviceDefinitions([{ id: 'placed-12500000-0000-4000-8000-000000000001', name: 'Fixture', placement }])[0];
    return { id: template.id, kind: template.kind, mount: template.mount, dimensions: definition.dimensions };
  });
  expect(fixtures.sort((a, b) => a.id.localeCompare(b.id))).toEqual(expected.sort((a, b) => a.id.localeCompare(b.id)));
});

test('database room bounds and ceiling anchors match the authored property used by the editor', () => {
  const rooms = JSON.parse(migration.match(/\$placement_rooms\$([\s\S]*?)\$placement_rooms\$/)![1]);
  expect(rooms).toEqual(ROOMS.map((room) => {
    const ceiling = AUTHORED_DEVICES.find((device) => device.roomId === room.id && device.mount === 'ceiling');
    return { id: room.id, outdoor: room.outdoor, bounds: room.bounds,
      ceiling: ceiling ? ceiling.position[1] + ceiling.dimensions[1] : 2.7 };
  }));
});

test('additive database guard uses the same conservative house exclusion as the placement editor', () => {
  expect(JSON.parse(groundsMigration.match(/\$house_exclusion\$([\s\S]*?)\$house_exclusion\$/)![1]))
    .toEqual(HOUSE_PLACEMENT_EXCLUSION_BOUNDS);
});
