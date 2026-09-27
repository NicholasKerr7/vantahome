import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { buildFilamentRainAsset, loadThreeRainFactory, parseGlb, readAccessor } from './build-filament-rain.mjs';

const assetBytes = await readFile(new URL('../assets/renderer-lab/filament-rain.glb', import.meta.url));
const asset = parseGlb(assetBytes);
const sharedAsset = parseGlb(await readFile(new URL('../assets/renderer-lab/rain.glb', import.meta.url)));
const createGeometry = await loadThreeRainFactory();
const POOLS = { rain: 720, splash: 336, runoff: 56 };
const CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]];

/** Find a named batch and its single primitive in the committed binary. */
function meshRecord(source, name) {
  const node = source.document.nodes.find((candidate) => candidate.name === name);
  assert.ok(node, `Missing ${name}`);
  const mesh = source.document.meshes[node.mesh];
  assert.equal(mesh.primitives.length, 1);
  return { node, primitive: mesh.primitives[0] };
}

/** Read one vertex's channels as a plain array for exact numeric comparisons. */
function channels(values, vertex, width) {
  return Array.from(values.subarray(vertex * width, (vertex + 1) * width));
}

test('the native asset contains four fixed draw batches within its mobile budget', () => {
  assert.deepEqual(asset.document.nodes.map(({ name }) => name), [
    'lab-filament-rain', 'lab-filament-splash', 'lab-filament-runoff', 'lab-filament-wet',
  ]);
  assert.equal(asset.document.meshes.length, 4);
  assert.deepEqual(asset.document.scenes[0].nodes, [0, 1, 2, 3]);
  let waterTriangles = 0;
  for (const [kind, count] of Object.entries(POOLS)) {
    const { node, primitive } = meshRecord(asset, `lab-filament-${kind}`);
    assert.equal(node.extras.particleCount, count);
    assert.equal(node.extras.guardVertexStart, count * 4);
    assert.equal(asset.document.accessors[primitive.attributes.POSITION].count, count * 4 + 2);
    assert.equal(asset.document.accessors[primitive.indices].count, count * 6 + 6);
    assert.equal(primitive.mode, 4);
    waterTriangles += count * 2;
  }
  assert.equal(waterTriangles, 2224);
  assert.ok(assetBytes.length < 350_000, 'Keep the expanded native geometry under 350 kB');
});

for (const [kind, count] of Object.entries(POOLS)) {
  test(`${kind} retains every surveyed anchor, seed, corner and tangent frame`, () => {
    const { primitive } = meshRecord(asset, `lab-filament-${kind}`);
    const attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([name, index]) => [name, readAccessor(asset, index)]));
    const expected = createGeometry(kind);
    try {
      const anchors = expected.getAttribute('aAnchor');
      const seeds = expected.getAttribute('aSeed');
      assert.equal(expected.instanceCount, count);
      for (const values of Object.values(attributes)) assert.ok(values.every(Number.isFinite));
      for (let particle = 0; particle < count; particle++) {
        const anchor = [anchors.getX(particle), anchors.getY(particle), anchors.getZ(particle)];
        for (let corner = 0; corner < 4; corner++) {
          const vertex = particle * 4 + corner;
          assert.deepEqual(channels(attributes.POSITION, vertex, 3), anchor);
          assert.deepEqual(channels(attributes.TEXCOORD_0, vertex, 2), CORNERS[corner]);
          assert.deepEqual(channels(attributes.TEXCOORD_1, vertex, 2), [seeds.getX(particle), seeds.getY(particle)]);
          assert.deepEqual(channels(attributes.COLOR_0, vertex, 4), [Math.fround(seeds.getZ(particle) / 3), seeds.getW(particle), 0, 1]);
          assert.equal(Math.round(attributes.COLOR_0[vertex * 4] * 3), seeds.getZ(particle));
          assert.deepEqual(channels(attributes.NORMAL, vertex, 3), [0, 1, 0]);
          assert.deepEqual(channels(attributes.TANGENT, vertex, 4), [1, 0, 0, 1]);
        }
      }
      if (kind === 'splash') assert.ok(attributes.TEXCOORD_1.some((value) => value > 1), 'Splash angles must not be clamped as colors');
    } finally {
      expected.dispose();
    }
  });
}

test('indexed invisible guards conservatively bound shader motion without displacing anchors', () => {
  for (const [kind, count] of Object.entries(POOLS)) {
    const { primitive } = meshRecord(asset, `lab-filament-${kind}`);
    const positions = readAccessor(asset, primitive.attributes.POSITION);
    const colors = readAccessor(asset, primitive.attributes.COLOR_0);
    const indices = readAccessor(asset, primitive.indices);
    const accessor = asset.document.accessors[primitive.attributes.POSITION];
    const guard = count * 4;
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    for (let vertex = 0; vertex < guard; vertex++) {
      for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis], positions[vertex * 3 + axis]);
        maximum[axis] = Math.max(maximum[axis], positions[vertex * 3 + axis]);
      }
    }
    assert.deepEqual(channels(positions, guard, 3), minimum.map((value) => Math.fround(value - 2)));
    assert.deepEqual(channels(positions, guard + 1, 3), maximum.map((value, axis) => Math.fround(value + (axis === 1 ? 8 : 2))));
    assert.deepEqual(accessor.min, channels(positions, guard, 3));
    assert.deepEqual(accessor.max, channels(positions, guard + 1, 3));
    for (let vertex = guard; vertex < guard + 2; vertex++) assert.deepEqual(channels(colors, vertex, 4), [0, 0, 0, 0]);
    assert.deepEqual(Array.from(indices.subarray(count * 6)), [guard, guard, guard, guard + 1, guard + 1, guard + 1]);
    for (let particle = 0; particle < count; particle++) {
      assert.deepEqual(Array.from(indices.subarray(particle * 6, particle * 6 + 6)), [0, 1, 2, 2, 1, 3].map((index) => particle * 4 + index));
      for (let axis = 0; axis < 3; axis++) {
        const anchor = positions[particle * 12 + axis];
        assert.ok(accessor.min[axis] <= anchor - (axis === 1 ? 1.1 : 1.5));
        assert.ok(accessor.max[axis] >= anchor + (axis === 1 ? 7.5 : 1.5));
      }
    }
    assert.ok(indices.every((index) => index < guard + 2));
  }
});

test('the native wet mask is the exact existing pavement-only geometry', () => {
  const { primitive: actual } = meshRecord(asset, 'lab-filament-wet');
  const { primitive: expected } = meshRecord(sharedAsset, 'lab-weather-wet');
  for (const attribute of ['POSITION', 'NORMAL']) {
    assert.deepEqual(readAccessor(asset, actual.attributes[attribute]), readAccessor(sharedAsset, expected.attributes[attribute]));
  }
  assert.equal(asset.document.accessors[actual.attributes.POSITION].count, 132);
  assert.equal(actual.indices, undefined);
});

test('the placeholder preserves both UV sets with a self-contained white pixel', () => {
  const material = asset.document.materials[0];
  assert.equal(material.pbrMetallicRoughness.baseColorTexture.texCoord, 0);
  assert.equal(material.occlusionTexture.texCoord, 1);
  assert.equal(material.pbrMetallicRoughness.baseColorFactor[3], 0);
  assert.equal(material.doubleSided, true);
  const image = asset.document.images[0];
  assert.equal(image.uri, undefined);
  assert.equal(image.mimeType, 'image/png');
  const view = asset.document.bufferViews[image.bufferView];
  const png = asset.binary.subarray(view.byteOffset, view.byteOffset + view.byteLength);
  assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1);
  assert.equal(png.readUInt32BE(20), 1);
  const imageData = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') imageData.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  assert.deepEqual(Array.from(inflateSync(Buffer.concat(imageData))), [0, 255, 255, 255, 255]);
  for (const bufferView of asset.document.bufferViews) {
    assert.equal(bufferView.byteOffset % 4, 0);
    assert.ok(bufferView.byteOffset + bufferView.byteLength <= asset.binary.length);
  }
});

test('rebuilding deterministically reproduces the committed native water binary', async () => {
  assert.deepEqual(await buildFilamentRainAsset(), assetBytes);
});
