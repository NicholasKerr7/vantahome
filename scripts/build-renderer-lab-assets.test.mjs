import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repository = new URL('../', import.meta.url);

/** Inspect both chunks without loading a renderer or fetching external resources. */
async function readGlb(name) {
  const bytes = await readFile(new URL(`assets/renderer-lab/${name}`, repository));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binaryStart = 20 + jsonLength + 8;
  return { document, binary: bytes.subarray(binaryStart) };
}

/** Compare exported floats while accepting harmless binary rounding. */
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} differs from ${expected}`);
}

test('fixture export aligns live parts with the existing furnished upper-floor model', async () => {
  const { document } = await readGlb('fixtures.glb');
  const manifest = JSON.parse(await readFile(new URL('packages/home-scene/src/house-manifest.json', repository), 'utf8'));
  const nodes = new Map(document.nodes.map((node) => [node.name, node]));
  for (const id of ['master-light', 'master-bedside-left', 'master-bedside-right']) {
    const device = manifest.devices.find((entry) => entry.id === id);
    const node = nodes.get(`lab-light-${id}`);
    assert.ok(node, `${id} must retain a named emissive control target`);
    close(node.translation[0], device.position[0]);
    close(node.translation[2], device.position[2]);
    const mesh = document.meshes[node.mesh];
    const material = document.materials[mesh.primitives[0].material];
    assert.equal(material.name, `lab-light-${id}`);
    assert.ok(material.emissiveFactor.some((value) => value > 0));
  }
  assert.equal(document.nodes.length, 25, 'static fixture shells must not be duplicated');
  assert.equal(document.images, undefined, 'fixtures must not introduce remote textures');
});

test('blinds retain a top anchor and all twenty individually named moving slats', async () => {
  const { document } = await readGlb('fixtures.glb');
  const nodes = new Map(document.nodes.map((node) => [node.name, node]));
  const fabric = nodes.get('lab-blind-fabric');
  assert.deepEqual(fabric.translation, [8.139, 2.1, -16.49]);
  assert.equal(fabric.children.length, 21);
  for (let index = 0; index < 20; index++) {
    const slat = nodes.get(`lab-blind-slat-${String(index).padStart(2, '0')}`);
    assert.ok(slat);
    close(slat.translation?.[1] ?? 0, -index * 0.062);
    close(slat.rotation[0], Math.sin(Math.PI / 4));
    close(slat.rotation[3], Math.cos(Math.PI / 4));
  }
  close(nodes.get('lab-blind-bottom').translation[1], -1.223);
});

test('solar export contains only four diffusers aligned to the inward-facing lamp heads', async () => {
  const { document } = await readGlb('solar.glb');
  const manifest = JSON.parse(await readFile(new URL('packages/home-scene/src/house-manifest.json', repository), 'utf8'));
  const library = JSON.parse(await readFile(new URL('packages/home-scene/src/device-geometry.json', repository), 'utf8'));
  assert.equal(document.nodes.length, 4, 'existing poles and housings must not be duplicated');
  assert.equal(document.meshes.length, 4);
  const nodes = new Map(document.nodes.map((node) => [node.name, node]));
  for (const device of manifest.devices.filter(({ model }) => model === 'solar-streetlight')) {
    const node = nodes.get(`lab-light-${device.id}`);
    assert.ok(node, `${device.id} must retain its own emissive diffuser`);
    const part = library.devices[device.id].parts.find(({ role }) => role === 'glow');
    const angle = device.rotation[1];
    close(node.translation[0], device.position[0] + part.position[2] * Math.sin(angle));
    close(node.translation[1], device.position[1] + part.position[1]);
    close(node.translation[2], device.position[2] + part.position[2] * Math.cos(angle));
    close(node.rotation[0], 0);
    close(node.rotation[1], Math.sin(angle / 2));
    close(node.rotation[2], 0);
    close(node.rotation[3], Math.cos(angle / 2));
    const primitive = document.meshes[node.mesh].primitives[0];
    const position = document.accessors[primitive.attributes.POSITION];
    for (let axis = 0; axis < 3; axis++) close(position.max[axis] - position.min[axis], part.size[axis]);
    assert.ok(document.materials[primitive.material].emissiveFactor.some((value) => value > 0));
  }
  assert.equal(document.images, undefined, 'solar lights must not introduce remote textures');
});

test('rain stays a single lightweight draw primitive with repeatable vertical cells', async () => {
  const { document, binary } = await readGlb('rain.glb');
  assert.equal(document.nodes.length, 1);
  assert.equal(document.nodes[0].name, 'lab-rain');
  assert.equal(document.meshes.length, 1);
  assert.equal(document.meshes[0].primitives.length, 1);
  const primitive = document.meshes[0].primitives[0];
  assert.equal(document.accessors[primitive.indices].count, 180 * 36);
  const positions = document.accessors[primitive.attributes.POSITION];
  const view = document.bufferViews[positions.bufferView];
  const offset = (view.byteOffset ?? 0) + (positions.byteOffset ?? 0);
  const stride = view.byteStride ?? 12;
  for (let vertex = 0; vertex < positions.count; vertex += 48) {
    const lower = offset + vertex * stride;
    const upper = lower + 24 * stride;
    close(binary.readFloatLE(upper), binary.readFloatLE(lower));
    close(binary.readFloatLE(upper + 4) - binary.readFloatLE(lower + 4), 12);
    close(binary.readFloatLE(upper + 8), binary.readFloatLE(lower + 8));
    const x = binary.readFloatLE(lower), z = binary.readFloatLE(lower + 8);
    assert.ok(x < -1.4 || x > 18 || z < -17.6 || z > 1.4, 'rain must not fall through the house');
  }
  assert.equal(document.materials[0].alphaMode, 'BLEND');
  assert.equal(document.materials[0].pbrMetallicRoughness.baseColorFactor[3], 0.32);
});
