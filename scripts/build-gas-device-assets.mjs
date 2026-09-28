/** Add the two descriptor-authored gas fixtures without re-exporting existing house geometry.
 * Run from the repository root: node scripts/build-gas-device-assets.mjs
 * Existing accessor data, material definitions, textures and node transforms remain unchanged.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CylinderGeometry, Euler, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Scene, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const GAS_ASSET_DEVICES = {
  ground: ['kitchen-gas-leak'],
  exterior: ['kitchen-gas-leak'],
  landscape: ['utility-gas-meter'],
};
const APPEND_KEY = 'vantaGasFixtures';
const TABLES = ['accessors', 'bufferViews', 'materials', 'meshes', 'nodes'];
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Hash original bytes and JSON independently so tests can prove the append is lossless. */
export function hash(value) { return createHash('sha256').update(value).digest('hex'); }

/** Read the existing self-contained GLB without decoding or re-encoding its images. */
export function readGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error('Invalid GLB header.');
  }
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Missing GLB JSON.');
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const binaryOffset = 20 + jsonLength;
  if (bytes.readUInt32LE(binaryOffset + 4) !== 0x004e4942 || json.buffers?.length !== 1 || json.buffers[0].uri) {
    throw new Error('Gas fixture export requires one embedded binary buffer.');
  }
  const binary = bytes.subarray(binaryOffset + 8, binaryOffset + 8 + json.buffers[0].byteLength);
  return { json, binary };
}

/** Serialize only the GLB container; original geometry and image bytes are retained verbatim. */
export function writeGlb({ json, binary }) {
  const encoded = Buffer.from(JSON.stringify(json));
  const paddedJson = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 0x20);
  encoded.copy(paddedJson);
  const paddedBinary = Buffer.alloc(Math.ceil(binary.length / 4) * 4);
  binary.copy(paddedBinary);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + paddedJson.length + paddedBinary.length, 8);
  header.writeUInt32LE(paddedJson.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(paddedBinary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, paddedJson, binaryHeader, paddedBinary]);
}

/** Remove this tool's previous append, rejecting drift instead of overwriting other edits. */
export function originalAsset(asset) {
  const json = structuredClone(asset.json);
  const metadata = json.extras?.[APPEND_KEY];
  if (!metadata) return { json, binary: Buffer.from(asset.binary) };
  if (metadata.version !== 1) throw new Error('Unsupported gas fixture append version.');
  for (const table of TABLES) json[table] = json[table].slice(0, metadata.counts[table]);
  json.scenes[metadata.sceneIndex].nodes = metadata.sceneNodes;
  json.buffers[0].byteLength = metadata.binaryLength;
  delete json.extras[APPEND_KEY];
  if (!metadata.hadExtras) delete json.extras;
  const binary = Buffer.from(asset.binary.subarray(0, metadata.binaryLength));
  if (hash(JSON.stringify(json)) !== metadata.jsonHash || hash(binary) !== metadata.binaryHash) {
    throw new Error('Original house asset changed after the gas fixture append; re-export its baseline first.');
  }
  return { json, binary };
}

/** Match runtime rounded boxes and twenty-sided pipe cylinders in device-local coordinates. */
function partGeometry(part) {
  const geometry = part.shape === 'box'
    ? new RoundedBoxGeometry(...part.size, 1, Math.min(...part.size) * 0.12)
    : part.shape === 'cylinder'
      ? new CylinderGeometry(0.5, 0.5, 1, 20).scale(...part.size)
      : null;
  if (!geometry) throw new Error(`Unsupported gas fixture shape: ${part.shape}`);
  const matrix = new Matrix4().compose(new Vector3(...part.position), new Quaternion().setFromEuler(new Euler(...part.rotation)), new Vector3(1, 1, 1));
  geometry.applyMatrix4(matrix);
  if (!geometry.index) return geometry;
  const expanded = geometry.toNonIndexed();
  geometry.dispose();
  return expanded;
}

/** Batch static shells by material; the main Three scene draws live display-role parts itself. */
export function createGasFixtureScene(ids, manifest, library) {
  const scene = new Scene();
  for (const id of ids) {
    const device = manifest.devices.find((item) => item.id === id);
    const fixture = library.devices[id];
    if (!device || !fixture) throw new Error(`Missing gas fixture descriptor: ${id}`);
    const root = new Group();
    root.name = `gas-fixture-${id}`;
    root.userData = { deviceId: id, gasFixture: true };
    root.position.fromArray(device.position);
    root.rotation.fromArray(device.rotation);
    const batches = new Map();
    for (const part of fixture.parts.filter((item) => item.role === 'static')) {
      if (!batches.has(part.material)) batches.set(part.material, []);
      batches.get(part.material).push(partGeometry(part));
    }
    for (const [materialId, parts] of batches) {
      const geometry = mergeGeometries(parts, false);
      parts.forEach((part) => part.dispose());
      if (!geometry) throw new Error(`Could not batch ${id}/${materialId}`);
      const surface = library.materials[materialId];
      const material = new MeshStandardMaterial({ name: `gas-fixture-${materialId}`, color: surface.color, roughness: surface.roughness, metalness: surface.metalness });
      const mesh = new Mesh(geometry, material);
      mesh.name = `gas-fixture-${id}-${materialId}`;
      mesh.userData = { deviceId: id, gasFixture: true, staticBatch: true };
      root.add(mesh);
    }
    scene.add(root);
  }
  return scene;
}

/** Implement the sole browser FileReader operation needed for binary Three exports. */
class BinaryFileReader {
  /** Forward Blob bytes asynchronously, preserving exporter completion/error callbacks. */
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); }, (error) => this.onerror?.(error));
  }
}

/** Generate a small portable GLB from repository descriptors, then release build-only GPU data. */
export async function exportGasFixtureScene(ids, manifest, library) {
  globalThis.FileReader ??= BinaryFileReader;
  const scene = createGasFixtureScene(ids, manifest, library);
  try {
    const binary = await new GLTFExporter().parseAsync(scene, { binary: true, trs: true });
    if (!(binary instanceof ArrayBuffer)) throw new Error('Expected a binary fixture export.');
    return readGlb(Buffer.from(binary));
  } finally {
    scene.traverse((object) => { if (object.isMesh) { object.geometry.dispose(); object.material.dispose(); } });
  }
}

/** Append isolated fixture tables while preserving every pre-existing table entry and byte. */
export function appendGasFixtures(asset, supplement, ids) {
  const { json, binary } = originalAsset(asset);
  if (json.materials?.some((material) => /^gas[- ]fixture[- ]/i.test(material.name ?? ''))) {
    throw new Error('The baseline already includes gas fixtures, such as a full export of the updated Blender master.');
  }
  const source = supplement.json;
  if (source.images || source.textures || source.extensionsRequired) throw new Error('Gas fixture supplements must contain plain embedded geometry only.');
  const counts = Object.fromEntries(TABLES.map((table) => [table, json[table]?.length ?? 0]));
  const sceneIndex = json.scene ?? 0;
  const metadata = { version: 1, ids, counts, sceneIndex, sceneNodes: [...json.scenes[sceneIndex].nodes], binaryLength: binary.length, hadExtras: Object.hasOwn(json, 'extras'), jsonHash: hash(JSON.stringify(json)), binaryHash: hash(binary) };
  const binaryStart = Math.ceil(binary.length / 4) * 4;
  const combined = Buffer.alloc(binaryStart + supplement.binary.length);
  binary.copy(combined);
  supplement.binary.copy(combined, binaryStart);
  for (const table of TABLES) json[table] ??= [];
  json.bufferViews.push(...source.bufferViews.map((view) => ({ ...view, byteOffset: (view.byteOffset ?? 0) + binaryStart })));
  json.accessors.push(...source.accessors.map((accessor) => ({ ...accessor, bufferView: accessor.bufferView + counts.bufferViews })));
  json.materials.push(...source.materials);
  json.meshes.push(...source.meshes.map((mesh) => ({ ...mesh, primitives: mesh.primitives.map((primitive) => ({ ...primitive, attributes: Object.fromEntries(Object.entries(primitive.attributes).map(([key, value]) => [key, value + counts.accessors])), ...(primitive.indices === undefined ? {} : { indices: primitive.indices + counts.accessors }), material: primitive.material + counts.materials })) })));
  json.nodes.push(...source.nodes.map((node) => ({ ...node, ...(node.mesh === undefined ? {} : { mesh: node.mesh + counts.meshes }), ...(node.children ? { children: node.children.map((id) => id + counts.nodes) } : {}) })));
  json.scenes[sceneIndex].nodes.push(...source.scenes[source.scene ?? 0].nodes.map((id) => id + counts.nodes));
  json.buffers[0].byteLength = combined.length;
  json.extras = { ...json.extras, [APPEND_KEY]: metadata };
  return { json, binary: combined };
}

/** Refresh just the affected exports; untouched upper-floor and gate files are never opened. */
async function main() {
  const directory = path.join(repository, 'packages/home-scene');
  const manifest = JSON.parse(await readFile(path.join(directory, 'src/house-manifest.json'), 'utf8'));
  const library = JSON.parse(await readFile(path.join(directory, 'src/device-geometry.json'), 'utf8'));
  for (const [name, ids] of Object.entries(GAS_ASSET_DEVICES)) {
    const filename = path.join(directory, 'public/models', `${name}.glb`);
    const original = await readFile(filename);
    const addition = await exportGasFixtureScene(ids, manifest, library);
    const output = writeGlb(appendGasFixtures(readGlb(original), addition, ids));
    if (!original.equals(output)) await writeFile(filename, output);
    process.stdout.write(`${name}.glb: ${output.length} bytes; ${ids.join(', ')}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
