import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WHITE_PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=', 'base64');
const CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]];
const QUAD_INDICES = [0, 1, 2, 2, 1, 3];

/** Reuse the existing Three.js geometry factory so native anchors and seeds cannot drift. */
export async function loadThreeRainFactory(projectRoot = PROJECT_ROOT) {
  const filename = path.join(projectRoot, 'packages/home-scene/src/renderer-lab/threeRainGeometry.ts');
  const require = createRequire(filename);
  const ts = require('typescript');
  const source = await readFile(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  const module = { exports: {} };
  runInNewContext(compiled.outputText, { module, exports: module.exports, require }, { filename, timeout: 1000 });
  if (typeof module.exports.createRainGeometry !== 'function') throw new Error('Missing shared Three.js rain geometry factory');
  return module.exports.createRainGeometry;
}

/** Read the committed GLB's JSON and binary chunks without decoding images or creating a renderer. */
export function parseGlb(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error('Expected a complete glTF 2 binary');
  }
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binaryStart = 28 + jsonLength;
  return { document, binary: bytes.subarray(binaryStart) };
}

/** Copy a tightly packed numeric accessor, retaining the original float32 values. */
export function readAccessor({ document, binary }, index) {
  const accessor = document.accessors[index];
  const view = document.bufferViews[accessor.bufferView];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const ArrayType = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[accessor.componentType];
  if (!components || !ArrayType || accessor.sparse || accessor.normalized) throw new Error('Unsupported weather geometry accessor');
  const output = new ArrayType(accessor.count * components);
  const width = ArrayType.BYTES_PER_ELEMENT;
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? components * width;
  for (let vertex = 0; vertex < accessor.count; vertex++) {
    for (let channel = 0; channel < components; channel++) {
      const source = offset + vertex * stride + channel * width;
      output[vertex * components + channel] = accessor.componentType === 5126 ? binary.readFloatLE(source)
        : accessor.componentType === 5123 ? binary.readUInt16LE(source) : binary.readUInt32LE(source);
    }
  }
  return output;
}

/** Assemble aligned GLB buffer views and accessors with bounds derived from real vertex data. */
function createBufferWriter(document) {
  const chunks = [];
  let byteLength = 0;
  return {
    /** Add one four-byte-aligned binary view, optionally declaring its GPU target. */
    appendView(bytes, target) {
      const view = { buffer: 0, byteOffset: byteLength, byteLength: bytes.length };
      if (target !== undefined) view.target = target;
      const index = document.bufferViews.push(view) - 1;
      chunks.push(bytes);
      byteLength += bytes.length;
      const padding = (4 - bytes.length % 4) % 4;
      if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
      return index;
    },
    /** Preserve numeric component types and calculate actual POSITION extrema, including guards. */
    appendAccessor(values, type, target, bounds = false) {
      const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
      if (!components || values.length % components) throw new Error(`Invalid ${type} attribute length`);
      const componentType = values instanceof Float32Array ? 5126 : values instanceof Uint16Array ? 5123 : 5125;
      const accessor = {
        bufferView: this.appendView(Buffer.from(values.buffer, values.byteOffset, values.byteLength), target),
        componentType, count: values.length / components, type,
      };
      if (bounds) {
        accessor.min = Array(components).fill(Infinity);
        accessor.max = Array(components).fill(-Infinity);
        for (let offset = 0; offset < values.length; offset++) {
          const channel = offset % components;
          accessor.min[channel] = Math.min(accessor.min[channel], values[offset]);
          accessor.max[channel] = Math.max(accessor.max[channel], values[offset]);
        }
      }
      return document.accessors.push(accessor) - 1;
    },
    /** Finalize a self-contained glTF 2 binary with valid padded JSON and BIN chunks. */
    finish() {
      document.buffers = [{ byteLength }];
      const json = Buffer.from(JSON.stringify(document));
      const paddedJson = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
      json.copy(paddedJson);
      const binary = Buffer.concat(chunks, byteLength);
      const output = Buffer.alloc(28 + paddedJson.length + binary.length);
      output.write('glTF', 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
      output.writeUInt32LE(paddedJson.length, 12); output.writeUInt32LE(0x4e4f534a, 16); paddedJson.copy(output, 20);
      const binaryHeader = 20 + paddedJson.length;
      output.writeUInt32LE(binary.length, binaryHeader); output.writeUInt32LE(0x004e4942, binaryHeader + 4);
      binary.copy(output, binaryHeader + 8);
      return output;
    },
  };
}

/** Expand instanced quads into one native batch while encoding seed data in glTF-standard attributes. */
function appendWaterMesh(document, writer, kind, geometry) {
  const count = geometry.instanceCount;
  const anchors = geometry.getAttribute('aAnchor');
  const seeds = geometry.getAttribute('aSeed');
  const vertexCount = count * 4 + 2;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const tangents = new Float32Array(vertexCount * 4);
  const uv0 = new Float32Array(vertexCount * 2);
  const uv1 = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 4);
  const indices = new Uint16Array(count * 6 + 6);
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
  for (let particle = 0; particle < count; particle++) {
    const anchor = [anchors.getX(particle), anchors.getY(particle), anchors.getZ(particle)];
    for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], anchor[axis]); maximum[axis] = Math.max(maximum[axis], anchor[axis]);
    }
    for (let corner = 0; corner < 4; corner++) {
      const vertex = particle * 4 + corner;
      positions.set(anchor, vertex * 3);
      uv0.set(CORNERS[corner], vertex * 2);
      uv1.set([seeds.getX(particle), seeds.getY(particle)], vertex * 2);
      colors.set([seeds.getZ(particle) / 3, seeds.getW(particle), 0, 1], vertex * 4);
    }
    for (let index = 0; index < 6; index++) indices[particle * 6 + index] = particle * 4 + QUAD_INDICES[index];
  }
  // Explicit tangent frames avoid deriving normals/tangents from anchor-collapsed triangles.
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    normals.set([0, 1, 0], vertex * 3); tangents.set([1, 0, 0, 1], vertex * 4);
  }
  const guardStart = count * 4;
  positions.set(minimum.map((value) => value - 2), guardStart * 3);
  positions.set(maximum.map((value, axis) => value + (axis === 1 ? 8 : 2)), (guardStart + 1) * 3);
  // Referenced guard vertices survive loaders that recalculate bounds from indices.
  // Repeating each index keeps both guard triangles degenerate after vertex animation.
  indices.set([guardStart, guardStart, guardStart, guardStart + 1, guardStart + 1, guardStart + 1], count * 6);
  const primitive = {
    attributes: {
      POSITION: writer.appendAccessor(positions, 'VEC3', 34962, true),
      NORMAL: writer.appendAccessor(normals, 'VEC3', 34962),
      TANGENT: writer.appendAccessor(tangents, 'VEC4', 34962),
      TEXCOORD_0: writer.appendAccessor(uv0, 'VEC2', 34962),
      TEXCOORD_1: writer.appendAccessor(uv1, 'VEC2', 34962),
      COLOR_0: writer.appendAccessor(colors, 'VEC4', 34962),
    },
    indices: writer.appendAccessor(indices, 'SCALAR', 34963), material: 0, mode: 4,
  };
  const name = `lab-filament-${kind}`;
  const mesh = document.meshes.push({ name, primitives: [primitive] }) - 1;
  document.nodes.push({ name, mesh, extras: { particleCount: count, guardVertexStart: guardStart, shaderBoundsPadding: { below: 2, above: 8, horizontal: 2 } } });
}

/** Copy only the existing upward-facing pavement mask, preserving every float32 vertex and normal. */
function appendWetMesh(document, writer, source) {
  const node = source.document.nodes.find(({ name }) => name === 'lab-weather-wet');
  if (!node) throw new Error('The shared weather asset is missing its wet-surface mask');
  const original = source.document.meshes[node.mesh].primitives[0];
  const attributes = {};
  for (const name of ['POSITION', 'NORMAL']) {
    attributes[name] = writer.appendAccessor(readAccessor(source, original.attributes[name]), 'VEC3', 34962, name === 'POSITION');
  }
  const material = structuredClone(source.document.materials[original.material]);
  material.name = 'lab-filament-wet-placeholder';
  const primitive = { attributes, material: document.materials.push(material) - 1, mode: 4 };
  if (original.indices !== undefined) primitive.indices = writer.appendAccessor(readAccessor(source, original.indices), 'SCALAR', 34963);
  const name = 'lab-filament-wet';
  const mesh = document.meshes.push({ name, primitives: [primitive] }) - 1;
  document.nodes.push({ name, mesh });
}

/** Build a native-only water asset without changing any existing GLB or Three.js source. */
export async function buildFilamentRainAsset(projectRoot = PROJECT_ROOT) {
  const createGeometry = await loadThreeRainFactory(projectRoot);
  const sharedRain = parseGlb(await readFile(path.join(projectRoot, 'assets/renderer-lab/rain.glb')));
  const document = {
    asset: { version: '2.0', generator: 'VantaHome native water builder' },
    scene: 0, scenes: [{ name: 'VantaHome native shader water', nodes: [0, 1, 2, 3] }],
    nodes: [], meshes: [], accessors: [], bufferViews: [],
    materials: [{
      name: 'lab-filament-water-placeholder', doubleSided: true, alphaMode: 'BLEND',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 0], metallicFactor: 0, roughnessFactor: 1,
        baseColorTexture: { index: 0, texCoord: 0 },
      },
      // gltfio keeps both UV streams when the placeholder references each set.
      occlusionTexture: { index: 0, texCoord: 1 },
    }],
    textures: [{ sampler: 0, source: 0 }], samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }],
  };
  const writer = createBufferWriter(document);
  for (const kind of ['rain', 'splash', 'runoff']) {
    const geometry = createGeometry(kind);
    try { appendWaterMesh(document, writer, kind, geometry); } finally { geometry.dispose(); }
  }
  appendWetMesh(document, writer, sharedRain);
  document.images = [{ name: 'UV stream retention pixel', bufferView: writer.appendView(WHITE_PIXEL), mimeType: 'image/png' }];
  return writer.finish();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = path.join(PROJECT_ROOT, 'assets/renderer-lab/filament-rain.glb');
  const bytes = await buildFilamentRainAsset();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, bytes);
  process.stdout.write(`filament-rain.glb: ${bytes.length} bytes\n`);
}
