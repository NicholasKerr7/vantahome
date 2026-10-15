import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const VECTOR_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Read an uncompressed GLB while retaining unknown chunks and their original bytes. */
export function readGeometryGlb(source, label = 'model') {
  if (source.length < 20 || source.toString('ascii', 0, 4) !== 'glTF'
    || source.readUInt32LE(4) !== 2 || source.readUInt32LE(8) !== source.length) {
    throw new Error(`${label}: expected a complete GLB version 2 file.`);
  }
  const chunks = [];
  for (let offset = 12; offset < source.length;) {
    if (offset + 8 > source.length) throw new Error(`${label}: truncated GLB chunk.`);
    const length = source.readUInt32LE(offset);
    if (length % 4 || offset + 8 + length > source.length) throw new Error(`${label}: invalid GLB chunk length.`);
    chunks.push({ type: source.readUInt32LE(offset + 4), data: source.subarray(offset + 8, offset + 8 + length) });
    offset += length + 8;
  }
  if (chunks[0]?.type !== JSON_CHUNK) throw new Error(`${label}: missing JSON chunk.`);
  const document = JSON.parse(chunks[0].data.toString('utf8').trim());
  if (document.asset?.version !== '2.0') throw new Error(`${label}: unsupported glTF version.`);
  const binaries = chunks.filter((chunk) => chunk.type === BIN_CHUNK);
  if (binaries.length > 1) throw new Error(`${label}: multiple binary chunks.`);
  return { document, chunks, binary: binaries[0]?.data ?? Buffer.alloc(0) };
}

/** Reassemble edited index metadata without changing unrelated JSON or chunk contents. */
function writeGeometryGlb(document, chunks, binary) {
  const text = Buffer.from(JSON.stringify(document));
  const json = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20);
  text.copy(json);
  const edited = chunks.map((chunk, index) => ({
    type: chunk.type,
    data: index === 0 ? json : chunk.type === BIN_CHUNK ? binary : chunk.data,
  }));
  const output = Buffer.alloc(12 + edited.reduce((total, chunk) => total + 8 + chunk.data.length, 0));
  output.write('glTF');
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  let offset = 12;
  for (const chunk of edited) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
}

/** Expose tightly packed or interleaved element bytes without decoding away attribute seams. */
function accessorReader(document, binary, index) {
  const accessor = document.accessors?.[index];
  const view = document.bufferViews?.[accessor?.bufferView];
  const width = COMPONENT_BYTES[accessor?.componentType] * VECTOR_COMPONENTS[accessor?.type];
  if (!accessor || accessor.sparse || !view || view.buffer !== 0 || view.extensions
    || !width || !Number.isSafeInteger(accessor.count) || accessor.count < 1) return null;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? width;
  const end = start + (accessor.count - 1) * stride + width;
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(stride) || stride < width
    || !Number.isSafeInteger(view.byteLength) || end > (view.byteOffset ?? 0) + view.byteLength
    || end > binary.length || end > document.buffers[0].byteLength) {
    throw new Error(`Invalid geometry accessor ${index}.`);
  }
  return { accessor, view, start, end, stride, width, element: (vertex) => binary.subarray(start + vertex * stride, start + vertex * stride + width) };
}

/** Convert one finite float32 to exact integer units of the smallest float32 subnormal. */
function exactFloat32(bytes, offset) {
  const bits = bytes.readUInt32LE(offset);
  const exponent = (bits >>> 23) & 0xff;
  const mantissa = BigInt((bits & 0x7fffff) | (exponent === 0 ? 0 : 0x800000));
  const magnitude = mantissa << BigInt(exponent === 0 ? 0 : exponent - 1);
  return bits >>> 31 ? -magnitude : magnitude;
}

/** Remove only mathematically zero-area float32 triangles, never a near-zero tolerance. */
function isZeroArea(position, indices) {
  const points = indices.map((index) => position.element(index));
  const values = points.map((point) => [point.readFloatLE(0), point.readFloatLE(4), point.readFloatLE(8)]);
  if (values.flat().some((value) => !Number.isFinite(value))) throw new Error('Model positions must be finite.');
  const ab = values[1].map((value, axis) => value - values[0][axis]);
  const ac = values[2].map((value, axis) => value - values[0][axis]);
  if (ab[1] * ac[2] - ab[2] * ac[1] !== 0 || ab[2] * ac[0] - ab[0] * ac[2] !== 0
    || ab[0] * ac[1] - ab[1] * ac[0] !== 0) return false;
  // Confirm candidate zeros with integer arithmetic; floating-point cancellation must
  // never erase a tiny but valid triangle with coordinates of very different scales.
  const exact = points.map((point) => [0, 4, 8].map((offset) => exactFloat32(point, offset)));
  const u = exact[1].map((value, axis) => value - exact[0][axis]);
  const v = exact[2].map((value, axis) => value - exact[0][axis]);
  return u[1] * v[2] === u[2] * v[1] && u[2] * v[0] === u[0] * v[2] && u[0] * v[1] === u[1] * v[0];
}

/** Rotate the ordered corner identities only; reversed winding deliberately has a different key. */
function orientedTriangleKey(ids) {
  const first = ids.indexOf(Math.min(...ids));
  return [ids[first], ids[(first + 1) % 3], ids[(first + 2) % 3]].join(',');
}

/** Encode a replacement index stream without narrowing its original component type. */
function encodeIndices(indices, componentType) {
  const output = Buffer.alloc(indices.length * COMPONENT_BYTES[componentType]);
  indices.forEach((value, index) => output.writeUIntLE(value, index * COMPONENT_BYTES[componentType], COMPONENT_BYTES[componentType]));
  return output;
}

/** Clean triangles within each primitive; all vertex data, materials and scene transforms remain intact. */
export function cleanModelTriangles(source, label = 'model') {
  const { document, chunks, binary } = readGeometryGlb(source, label);
  const report = { label, trianglesBefore: 0, trianglesAfter: 0, removedZeroArea: 0, removedDuplicates: 0, primitives: [], skippedPrimitives: 0 };
  if (!document.meshes?.length) return { buffer: source, report, changed: false };
  if (document.buffers?.length !== 1 || document.buffers[0].uri || !binary.length) throw new Error(`${label}: geometry cleanup requires one embedded binary buffer.`);
  const originalReaders = document.accessors.map((_, index) => accessorReader(document, binary, index));
  let outputBinary = Buffer.from(binary);
  for (const [meshIndex, mesh] of document.meshes.entries()) {
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const attributeIds = [...Object.keys(primitive.attributes).sort().map((name) => primitive.attributes[name]),
        ...(primitive.targets ?? []).flatMap((target) => Object.keys(target).sort().map((name) => target[name]))];
      const attributes = attributeIds.map((index) => originalReaders[index]);
      const position = originalReaders[primitive.attributes.POSITION];
      const indexReader = primitive.indices === undefined ? null : originalReaders[primitive.indices];
      if (primitive.extensions || attributes.some((item) => !item) || !position
        || position.accessor.componentType !== 5126 || position.accessor.type !== 'VEC3'
        || (primitive.indices !== undefined && (!indexReader || indexReader.accessor.type !== 'SCALAR'
          || ![5121, 5123, 5125].includes(indexReader.accessor.componentType)))) {
        report.skippedPrimitives += 1;
        continue;
      }
      if (attributes.some((item) => item.accessor.count !== position.accessor.count)) throw new Error(`${label}: inconsistent vertex counts.`);
      const count = indexReader?.accessor.count ?? position.accessor.count;
      if (count % 3) throw new Error(`${label}: incomplete triangle index stream.`);
      const vertexIds = new Map();
      const corners = new Map();
      const seen = new Set();
      const kept = [];
      let zeroArea = 0;
      let duplicates = 0;
      const deformable = primitive.targets?.length || Object.keys(primitive.attributes).some((name) => /^(JOINTS|WEIGHTS)_/u.test(name));
      for (let offset = 0; offset < count; offset += 3) {
        const indices = [0, 1, 2].map((corner) => indexReader
          ? indexReader.element(offset + corner).readUIntLE(0, indexReader.width) : offset + corner);
        if (indices.some((index) => index >= position.accessor.count)) throw new Error(`${label}: index outside its vertex buffer.`);
        if (!deformable && isZeroArea(position, indices)) { zeroArea += 1; continue; }
        const identities = indices.map((index) => {
          if (!corners.has(index)) {
            const signature = attributes.map((reader) => reader.element(index).toString('hex')).join('/');
            if (!vertexIds.has(signature)) vertexIds.set(signature, vertexIds.size);
            corners.set(index, vertexIds.get(signature));
          }
          return corners.get(index);
        });
        const key = orientedTriangleKey(identities);
        if (seen.has(key)) duplicates += 1;
        else { seen.add(key); kept.push(...indices); }
      }
      report.trianglesBefore += count / 3;
      report.trianglesAfter += kept.length / 3;
      if (!zeroArea && !duplicates) continue;
      if (!kept.length) throw new Error(`${label}: cleanup would empty mesh ${meshIndex} primitive ${primitiveIndex}; review the export manually.`);
      const componentType = indexReader?.accessor.componentType ?? (position.accessor.count > 65536 ? 5125 : 5123);
      const bytes = encodeIndices(kept, componentType);
      // Append a dedicated stream: every original byte, including shared accessors,
      // images, morphs and animations, is preserved. Only this primitive's indices
      // change. The small unused old index ranges are preferable to unsafe compaction.
      const start = Math.ceil(outputBinary.length / 4) * 4;
      const padded = Buffer.alloc(Math.ceil((start + bytes.length) / 4) * 4);
      outputBinary.copy(padded);
      bytes.copy(padded, start);
      outputBinary = padded;
      document.bufferViews.push({ buffer: 0, byteOffset: start, byteLength: bytes.length, target: 34963 });
      document.accessors.push({ bufferView: document.bufferViews.length - 1, componentType, count: kept.length, type: 'SCALAR',
        min: [kept.reduce((value, index) => Math.min(value, index), Infinity)],
        max: [kept.reduce((value, index) => Math.max(value, index), -Infinity)] });
      primitive.indices = document.accessors.length - 1;
      report.removedZeroArea += zeroArea;
      report.removedDuplicates += duplicates;
      report.primitives.push({ mesh: meshIndex, primitive: primitiveIndex, material: primitive.material ?? null, zeroArea, duplicates });
    }
  }
  const changed = report.removedZeroArea + report.removedDuplicates > 0;
  if (!changed) return { buffer: source, report, changed };
  document.buffers[0].byteLength = outputBinary.length;
  return { buffer: writeGeometryGlb(document, chunks, outputBinary), report, changed };
}

/** Keep future Blender exports from silently reintroducing known triangle artifacts. */
export function assertCleanModelTriangles(source, label) {
  const result = cleanModelTriangles(source, label);
  if (result.changed) throw new Error(`${label}: ${result.report.removedZeroArea} zero-area and ${result.report.removedDuplicates} duplicate triangles; review with scripts/clean-model-triangles.mjs, then use --write to repair the source export.`);
  return result.report;
}

/** Explicit --write repairs source GLBs; default mode reports findings without changing files. */
async function run() {
  const args = process.argv.slice(2);
  const write = args[0] === '--write';
  const files = write ? args.slice(1) : args;
  if (!files.length || files.some((file) => file.startsWith('--'))) throw new Error('Usage: node scripts/clean-model-triangles.mjs [--write] model.glb [...]');
  for (const file of files) {
    const result = cleanModelTriangles(await readFile(file), file);
    if (write && result.changed && readGeometryGlb(result.buffer).document.extras?.vantaGasFixtures) {
      throw new Error(`${file}: run node scripts/build-gas-device-assets.mjs to clean its verified baseline before rebuilding appended fixtures.`);
    }
    if (write && result.changed) await writeFile(file, result.buffer);
    console.info(JSON.stringify({ ...result.report, changed: result.changed, written: write && result.changed }));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
