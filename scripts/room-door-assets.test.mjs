import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Raycaster, Vector3 } from 'three';
import { originalAsset, readGlb } from './build-gas-device-assets.mjs';
import { loadGeometryModel } from './renderer-lab-weather-assets.mjs';
import { repairNortheastDoorway } from './repair-room-doorway.mjs';

const root = new URL('../', import.meta.url);
const doors = JSON.parse(await readFile(new URL('packages/home-scene/src/room-doors.json', root)));

/** Read original embedded positions without lossy decompression or re-export. */
function positions(asset, index) {
  const accessor = asset.json.accessors[index], view = asset.json.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType, 5126);
  return Array.from({ length: accessor.count }, (_, i) => [0, 1, 2].map((axis) => asset.binary.readFloatLE((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * (view.byteStride ?? 12) + axis * 4)));
}

test('the hidden teak batches contain exactly the measured architectural doors and no furnishings', async () => {
  const asset = readGlb(await readFile(new URL('packages/home-scene/public/models/exterior.glb', root)));
  const covered = new Set();
  for (const floor of ['ground', 'upper']) {
    const node = asset.json.nodes.find((node) => node.name === `${floor}--teak`);
    const expected = doors.filter((door) => door.floor === floor);
    assert.equal(node.extras.sourceObjectCount, expected.length);
    for (const primitive of asset.json.meshes[node.mesh].primitives) {
      assert.equal(asset.json.materials[primitive.material].name, 'Teak');
      for (const point of positions(asset, primitive.attributes.POSITION)) {
        const door = expected.find((door) => point.every((value, axis) => value >= door.sourceBounds[0][axis] - 0.0001 && value <= door.sourceBounds[1][axis] + 0.0001));
        assert.ok(door, `Unexpected teak geometry: ${point}`);
        covered.add(door.id);
      }
    }
  }
  assert.equal(covered.size, 27);
});

for (const name of ['ground', 'exterior']) test(`${name}: repaired northeast doorway is clear and rebuilding remains lossless`, async () => {
  const bytes = await readFile(new URL(`packages/home-scene/public/models/${name}.glb`, root));
  const asset = originalAsset(readGlb(bytes));
  const before = Buffer.from(asset.binary);
  assert.equal(repairNortheastDoorway(asset), 0);
  assert.deepEqual(asset.binary, before);
  const scene = await loadGeometryModel(new URL(`packages/home-scene/public/models/${name}.glb`, root));
  scene.updateMatrixWorld(true);
  const wall = scene.getObjectByName('ground--ivory');
  for (const x of [9.7, 10.02, 10.34]) {
    const ray = new Raycaster(new Vector3(x, name === 'ground' ? 0.4 : 1, -11.25), new Vector3(0, 0, -1), 0, 0.65);
    assert.equal(ray.intersectObject(wall).length, 0, `A wall still blocks D07 at x=${x}`);
  }
});
