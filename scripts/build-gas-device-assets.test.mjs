import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Box3, Raycaster, Vector3 } from 'three';
import { GAS_ASSET_DEVICES, appendGasFixtures, createGasFixtureScene, exportGasFixtureScene, hash, originalAsset, readGlb, writeGlb } from './build-gas-device-assets.mjs';
import { loadGeometryModel } from './renderer-lab-weather-assets.mjs';

const repository = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('packages/home-scene/src/house-manifest.json', repository)));
const library = JSON.parse(await readFile(new URL('packages/home-scene/src/device-geometry.json', repository)));

/** Open the exact runtime bytes consumed by both the browser and Filament. */
async function asset(name) {
  return readGlb(await readFile(new URL(`packages/home-scene/public/models/${name}.glb`, repository)));
}

/** Read tightly packed float positions from a generated, embedded geometry accessor. */
function positions(model, index) {
  const accessor = model.json.accessors[index];
  const view = model.json.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType, 5126);
  assert.equal(accessor.type, 'VEC3');
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return Array.from({ length: accessor.count }, (_, vertex) => [0, 1, 2].map((axis) => model.binary.readFloatLE(start + vertex * (view.byteStride ?? 12) + axis * 4)));
}

test('gas devices have distinct logical rooms, useful readouts and bounded compact geometry', () => {
  const meter = manifest.devices.find((device) => device.id === 'utility-gas-meter');
  const detector = manifest.devices.find((device) => device.id === 'kitchen-gas-leak');
  assert.equal(meter.kind, 'gas-meter');
  assert.equal(meter.roomId, 'grounds');
  assert.equal(detector.kind, 'gas-leak');
  assert.equal(detector.roomId, 'kitchen');
  for (const device of [meter, detector]) {
    assert.equal(device.mount, 'wall');
    const parts = library.devices[device.id].parts;
    assert.equal(parts.filter((part) => part.role === 'display').length, 2);
    assert.ok(parts.some((part) => part.role === 'display' && part.name === 'status indicator'));
    assert.ok(parts.every((part) => part.position.concat(part.size, part.rotation).every(Number.isFinite)));
    assert.ok(!parts.some((part) => /tank|storage|cylinder vessel/i.test(part.name)));
  }
  for (const id of ['utility-generator', 'utility-battery']) {
    const other = manifest.devices.find((device) => device.id === id);
    assert.ok(Math.hypot(meter.position[0] - other.position[0], meter.position[2] - other.position[2]) > 20);
  }
  const bounds = new Box3().setFromObject(createGasFixtureScene([detector.id], manifest, library));
  assert.ok(bounds.min.y >= 0.21 && bounds.max.y <= 0.41, 'LPG monitor is low on the kitchen return');
  assert.ok(bounds.min.x >= 14.99 && bounds.max.x <= 15.21);
  assert.ok(bounds.max.z < -10.586, 'Detector stays in front of the surveyed wall face');
});

test('rejects a fresh Blender baseline that already contains gas fixtures instead of duplicating them', async () => {
  const baseline = originalAsset(await asset('ground'));
  baseline.json.materials.push({ name: 'Gas fixture ivory' });
  const supplement = await exportGasFixtureScene(['kitchen-gas-leak'], manifest, library);
  assert.throws(() => appendGasFixtures(baseline, supplement, ['kitchen-gas-leak']), /already includes gas fixtures/);
});

for (const [name, ids] of Object.entries(GAS_ASSET_DEVICES)) {
  test(`${name} keeps original material, accessor, index and texture bytes and is repeatable`, async () => {
    const actual = await asset(name);
    const baseline = originalAsset(actual);
    const metadata = actual.json.extras.vantaGasFixtures;
    assert.equal(hash(baseline.binary), metadata.binaryHash);
    assert.equal(hash(JSON.stringify(baseline.json)), metadata.jsonHash);
    for (const table of ['materials', 'accessors', 'bufferViews', 'meshes', 'nodes']) {
      assert.deepEqual(actual.json[table].slice(0, metadata.counts[table]), baseline.json[table]);
    }
    assert.deepEqual(actual.json.images, baseline.json.images);
    assert.deepEqual(actual.json.textures, baseline.json.textures);
    const rebuilt = appendGasFixtures(actual, await exportGasFixtureScene(ids, manifest, library), ids);
    assert.deepEqual(writeGlb(rebuilt), writeGlb(actual));
    assert.deepEqual(metadata.ids, ids);
    assert.ok(actual.binary.length - baseline.binary.length < 128 * 1024);
  });

  test(`${name} embeds correctly indexed finite geometry with authored normals and anchors`, async () => {
    const model = await asset(name);
    const metadata = model.json.extras.vantaGasFixtures;
    let triangles = 0;
    const addedMeshes = model.json.meshes.slice(metadata.counts.meshes);
    assert.ok(addedMeshes.length <= 5, 'Material batching keeps mobile draw calls bounded');
    for (const mesh of addedMeshes) for (const primitive of mesh.primitives) {
      assert.ok(primitive.material >= metadata.counts.materials);
      const points = positions(model, primitive.attributes.POSITION);
      const accessor = model.json.accessors[primitive.attributes.POSITION];
      assert.ok(points.every((point) => point.every(Number.isFinite)));
      points.forEach((point) => point.forEach((value, axis) => {
        assert.ok(value >= accessor.min[axis] - 1e-6 && value <= accessor.max[axis] + 1e-6);
      }));
      assert.ok(positions(model, primitive.attributes.NORMAL).every((normal) => Math.abs(Math.hypot(...normal) - 1) < 1e-5));
      assert.ok(primitive.attributes.TEXCOORD_0 !== undefined);
      triangles += (primitive.indices === undefined ? points.length : model.json.accessors[primitive.indices].count) / 3;
    }
    assert.ok(triangles > 100 && triangles <= 1250);
    for (const id of ids) {
      const device = manifest.devices.find((item) => item.id === id);
      const root = model.json.nodes.find((node) => node.name === `gas-fixture-${id}`);
      assert.deepEqual(root.translation, device.position);
      assert.equal(root.extras.deviceId, id);
      assert.ok(root.children.length > 0);
    }
  });
}

test('both fixtures sit on surveyed solid wall faces and the detector has a clear kitchen approach', async () => {
  const scene = await loadGeometryModel(new URL('packages/home-scene/public/models/exterior.glb', repository).pathname);
  const meshes = [];
  scene.traverse((object) => { if (object.isMesh && !object.userData.gasFixture) meshes.push(object); });
  const cast = (origin, direction, distance) => new Raycaster(new Vector3(...origin), new Vector3(...direction), 0, distance).intersectObjects(meshes, false);
  const meterWall = cast([18, 0.8, -13.35], [-1, 0, 0], 2)[0];
  assert.equal(meterWall.object.name, 'ground--ivory');
  assert.ok(Math.abs(meterWall.point.x - 16.682) < 1e-4);
  const detectorWall = cast([15.1, 0.32, -11.5], [0, 0, 1], 1.1)[0];
  assert.equal(detectorWall.object.name, 'ground--ivory');
  assert.ok(Math.abs(detectorWall.point.z + 10.586) < 1e-4);
  assert.equal(cast([15.1, 0.32, -10.68], [0, 0, -1], 2.8).length, 0);
  scene.traverse((object) => { if (object.isMesh) { object.geometry.dispose(); object.material.dispose(); } });
});
