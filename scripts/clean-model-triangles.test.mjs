import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanModelTriangles, readGeometryGlb, assertCleanModelTriangles } from './clean-model-triangles.mjs';

/** Build small real GLB streams; callbacks cover shared accessors and animated geometry. */
function fixture({ positions = [0, 0, 0, 1, 0, 0, 0, 1, 0], indices = [0, 1, 2], normals, mutate } = {}) {
  const streams = [Buffer.from(new Float32Array(positions).buffer)];
  const accessors = [{ bufferView: 0, componentType: 5126, type: 'VEC3', count: positions.length / 3 }];
  const attributes = { POSITION: 0 };
  if (normals) {
    attributes.NORMAL = streams.length;
    accessors.push({ bufferView: streams.length, componentType: 5126, type: 'VEC3', count: normals.length / 3 });
    streams.push(Buffer.from(new Float32Array(normals).buffer));
  }
  const primitive = { attributes };
  if (indices) {
    primitive.indices = streams.length;
    accessors.push({ bufferView: streams.length, componentType: 5123, type: 'SCALAR', count: indices.length });
    streams.push(Buffer.from(new Uint16Array(indices).buffer));
  }
  let offset = 0;
  const bufferViews = streams.map((stream) => {
    const view = { buffer: 0, byteOffset: offset, byteLength: stream.length };
    offset += Math.ceil(stream.length / 4) * 4;
    return view;
  });
  const binary = Buffer.alloc(offset);
  streams.forEach((stream, index) => stream.copy(binary, bufferViews[index].byteOffset));
  const document = { asset: { version: '2.0' }, buffers: [{ byteLength: binary.length }], bufferViews, accessors,
    materials: [{ name: 'Original material' }], meshes: [{ primitives: [primitive] }],
    nodes: [{ mesh: 0, translation: [4, 2, -9] }], scenes: [{ nodes: [0] }], scene: 0 };
  mutate?.(document);
  const text = Buffer.from(JSON.stringify(document));
  const json = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20);
  text.copy(json);
  const output = Buffer.alloc(28 + json.length + binary.length);
  output.write('glTF'); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(json.length, 12); output.writeUInt32LE(0x4e4f534a, 16); json.copy(output, 20);
  output.writeUInt32LE(binary.length, 20 + json.length); output.writeUInt32LE(0x004e4942, 24 + json.length);
  binary.copy(output, 28 + json.length);
  return output;
}

test('removes duplicate cyclic faces and exact zero area while retaining reverse winding', () => {
  const source = fixture({ indices: [0, 1, 2, 1, 2, 0, 0, 0, 1, 0, 2, 1] });
  const result = cleanModelTriangles(source);
  assert.equal(result.report.removedZeroArea, 1);
  assert.equal(result.report.removedDuplicates, 1);
  assert.equal(result.report.trianglesAfter, 2);
  assert.throws(() => assertCleanModelTriangles(source, 'fixture'), /--write/);
  assert.doesNotThrow(() => assertCleanModelTriangles(result.buffer, 'fixture'));
  assert.equal(cleanModelTriangles(result.buffer).buffer, result.buffer);
});

test('preserves every original byte, scene node, transform, attribute, material and unrelated accessor', () => {
  const source = fixture({ indices: [0, 1, 2, 0, 1, 2], mutate(document) {
    document.meshes[0].primitives.push({ ...document.meshes[0].primitives[0], mode: 1 });
    document.animations = [{ samplers: [{ input: 1, output: 1 }] }];
  } });
  const before = readGeometryGlb(source);
  const after = readGeometryGlb(cleanModelTriangles(source).buffer);
  assert.deepEqual(after.binary.subarray(0, before.binary.length), before.binary);
  for (const key of ['nodes', 'scenes', 'materials', 'animations']) assert.deepEqual(after.document[key], before.document[key]);
  assert.deepEqual(after.document.accessors.slice(0, before.document.accessors.length), before.document.accessors);
  assert.deepEqual(after.document.meshes[0].primitives[1], before.document.meshes[0].primitives[1]);
  assert.deepEqual(after.document.meshes[0].primitives[0].attributes, before.document.meshes[0].primitives[0].attributes);
});

test('merges only identical complete vertex attributes, preserving coincident seams', () => {
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0];
  const identical = fixture({ positions, indices: [0, 1, 2, 3, 4, 5] });
  assert.equal(cleanModelTriangles(identical).report.removedDuplicates, 1);
  const seams = fixture({ positions, indices: [0, 1, 2, 3, 4, 5],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1] });
  assert.equal(cleanModelTriangles(seams).changed, false);
});

test('retains valid tiny triangles instead of applying a geometric epsilon', () => {
  const source = fixture({ positions: [0, 0, 0, 1e-30, 0, 0, 0, 1e-30, 0] });
  assert.equal(cleanModelTriangles(source).changed, false);
});

test('preserves degenerate base faces that may unfold under morph animation', () => {
  const source = fixture({ indices: [0, 1, 2, 0, 0, 1], mutate(document) {
    document.meshes[0].primitives[0].targets = [{ POSITION: 0 }];
  } });
  assert.equal(cleanModelTriangles(source).changed, false);
});

test('compares morph attributes too when identifying duplicate faces', () => {
  const source = fixture({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], indices: [0, 1, 2, 3, 4, 5], mutate(document) {
      delete document.meshes[0].primitives[0].attributes.NORMAL;
      document.meshes[0].primitives[0].targets = [{ POSITION: 1 }];
    } });
  assert.equal(cleanModelTriangles(source).changed, false);
});

test('supports non-indexed triangles without altering the vertex stream', () => {
  const source = fixture({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0], indices: null });
  const result = cleanModelTriangles(source);
  assert.equal(result.report.removedDuplicates, 1);
  assert.equal(readGeometryGlb(result.buffer).document.accessors.at(-1).count, 3);
});

test('rejects broken indices, nonfinite positions, incomplete triangles and empty replacement geometry', () => {
  assert.throws(() => cleanModelTriangles(fixture({ indices: [0, 1, 7] })), /outside/);
  assert.throws(() => cleanModelTriangles(fixture({ positions: [NaN, 0, 0, 1, 0, 0, 0, 1, 0] })), /finite/);
  assert.throws(() => cleanModelTriangles(fixture({ indices: [0, 1] })), /incomplete/);
  assert.throws(() => cleanModelTriangles(fixture({ indices: [0, 0, 0] })), /empty/);
  assert.throws(() => cleanModelTriangles(Buffer.from('glTF')), /complete GLB/);
});

test('skips unsupported compressed or sparse primitives without rewriting them', () => {
  for (const mutate of [
    (document) => { document.meshes[0].primitives[0].extensions = { KHR_draco_mesh_compression: {} }; },
    (document) => { document.accessors[0].sparse = { count: 1 }; },
  ]) {
    const source = fixture({ indices: [0, 1, 2, 0, 1, 2], mutate });
    const result = cleanModelTriangles(source);
    assert.equal(result.changed, false);
    assert.equal(result.report.skippedPrimitives, 1);
    assert.equal(result.buffer, source);
  }
});
