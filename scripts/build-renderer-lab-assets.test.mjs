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

test('weather export stays within the phone draw and particle budgets', async () => {
  const { document } = await readGlb('rain.glb');
  const metadata = JSON.parse(await readFile(new URL('packages/home-scene/src/renderer-lab/weather-surfaces.json', repository), 'utf8'));
  assert.equal(document.nodes.length, 36);
  assert.equal(document.meshes.length, 36);
  assert.equal(metadata.budgets.rainDrops, 360);
  assert.equal(metadata.budgets.splashImpacts, 112);
  assert.equal(metadata.budgets.runoffDrops, 56);
  assert.deepEqual(document.nodes.map(({ name }) => name).sort(), metadata.groups.map(({ name }) => name).sort());
  assert.ok(document.meshes.every(({ primitives }) => primitives.length === 1));
  assert.equal(document.images, undefined, 'weather must not add textures or network requests');
  assert.ok(document.buffers[0].byteLength < 1_500_000);
});

test('stronger rain batches use longer streaks without crossing their landing surfaces', async () => {
  const { document, binary } = await readGlb('rain.glb');
  const metadata = JSON.parse(await readFile(new URL('packages/home-scene/src/renderer-lab/weather-surfaces.json', repository), 'utf8'));
  for (let phase = 0; phase < 12; phase++) {
    const name = `lab-weather-rain-${String(phase).padStart(2, '0')}`;
    const node = document.nodes.find((entry) => entry.name === name);
    const primitive = document.meshes[node.mesh].primitives[0];
    const accessor = document.accessors[primitive.attributes.POSITION];
    const view = document.bufferViews[accessor.bufferView];
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stride = view.byteStride ?? 12;
    const points = metadata.landingPoints.filter((point) => point.phase === phase);
    const tier = phase % 3 + 1;
    const [minLength, maxLength, width] = tier === 1 ? [0.24, 0.46, 0.023]
      : tier === 2 ? [0.5, 0.8, 0.028] : [0.85, 1.2, 0.032];
    assert.equal(accessor.count, points.length * 24);
    for (let drop = 0; drop < points.length; drop++) {
      const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
      for (let vertex = 0; vertex < 24; vertex++) {
        for (let axis = 0; axis < 3; axis++) {
          const value = binary.readFloatLE(offset + (drop * 24 + vertex) * stride + axis * 4);
          minimum[axis] = Math.min(minimum[axis], value); maximum[axis] = Math.max(maximum[axis], value);
        }
      }
      close(maximum[0] - minimum[0], width);
      close(maximum[2] - minimum[2], width);
      const length = maximum[1] - minimum[1];
      assert.ok(length >= minLength - 0.00001 && length <= maxLength + 0.00001);
      close(minimum[1], points[drop].position[1] + 0.015);
    }
  }
});

test('impacts include actual roof, driveway, road, path, and access-cover surfaces, never grass', async () => {
  const metadata = JSON.parse(await readFile(new URL('packages/home-scene/src/renderer-lab/weather-surfaces.json', repository), 'utf8'));
  const sources = new Set(metadata.splashPoints.map(({ source }) => source));
  for (const required of ['landscape-Site_Paving', 'landscape-Site_Road', 'landscape-Site_Path', 'landscape-Site_Access']) {
    assert.ok(sources.has(required), `${required} needs visible impacts`);
  }
  assert.ok(metadata.splashPoints.some(({ surface }) => surface === 'roof'));
  assert.ok(metadata.splashPoints.every(({ source }) => source.startsWith('roof--') || /Site_(Paving|Road|Path|Access)$/.test(source)));
  assert.ok(metadata.landingPoints.some(({ source }) => source.startsWith('roof--')), 'the roof must receive rain');
  assert.ok(metadata.landingPoints.some(({ source }) => source === 'landscape-Site_Road'), 'rain must extend across the road');
});

test('all weather landing points agree with source geometry and stay above indoor floors', async () => {
  const { Raycaster, Vector3 } = await import('three');
  const { loadGeometryModel } = await import('./renderer-lab-weather-assets.mjs');
  const { fileURLToPath } = await import('node:url');
  const metadata = JSON.parse(await readFile(new URL('packages/home-scene/src/renderer-lab/weather-surfaces.json', repository), 'utf8'));
  const [exterior, landscape] = await Promise.all(['exterior', 'landscape'].map((name) => loadGeometryModel(fileURLToPath(new URL(`packages/home-scene/public/models/${name}.glb`, repository)))));
  const meshes = [];
  exterior.traverse((mesh) => { if (mesh.isMesh && mesh.name.startsWith('roof--')) meshes.push(mesh); });
  landscape.traverse((mesh) => { if (mesh.isMesh && !/Leaf|Bark|Trunk/.test(mesh.material.name)) meshes.push(mesh); });
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0), 0, 40);
  for (const { position, source } of [...metadata.landingPoints, ...metadata.splashPoints]) {
    ray.ray.origin.set(position[0], 25, position[2]);
    const sourceMeshes = meshes.filter((mesh) => mesh.name === source);
    assert.ok(sourceMeshes.length, `Missing source surface ${source}`);
    const hit = ray.intersectObjects(sourceMeshes, false)[0];
    assert.ok(hit, `Weather anchor must intersect ${source}`);
    close(hit.point.y, position[1]);
    if (position[0] > -0.3 && position[0] < 16.7 && position[2] > -17 && position[2] < 0.3 && source.startsWith('roof--')) {
      assert.ok(position[1] > 2.6, 'roof impacts cannot appear inside the house');
    }
  }
  for (const { position } of metadata.runoffPoints) {
    ray.ray.origin.set(position[0], 25, position[2]);
    const hit = ray.intersectObjects(meshes.filter((mesh) => mesh.name.startsWith('roof--')), false)[0];
    assert.ok(!hit || hit.point.y < position[1] - 0.4, 'runoff must fall outside a roof edge');
  }
});

test('replacement foliage preserves every original triangle around fixed crown and soil anchors', async () => {
  const { loadGeometryModel } = await import('./renderer-lab-weather-assets.mjs');
  const { fileURLToPath } = await import('node:url');
  const { Vector3 } = await import('three');
  const metadata = JSON.parse(await readFile(new URL('packages/home-scene/src/renderer-lab/weather-surfaces.json', repository), 'utf8'));
  const landscape = await loadGeometryModel(fileURLToPath(new URL('packages/home-scene/public/models/landscape.glb', repository)));
  const weather = await loadGeometryModel(fileURLToPath(new URL('assets/renderer-lab/rain.glb', repository)));
  /** Canonicalize world vertices while accepting harmless indexed-float export rounding. */
  function vertices(scene, predicate) {
    const result = [];
    scene.traverse((mesh) => {
      if (!mesh.isMesh || !predicate(mesh)) return;
      const attribute = mesh.geometry.getAttribute('position');
      const index = mesh.geometry.index;
      for (let offset = 0; offset < (index?.count ?? attribute.count); offset++) {
        const vertex = new Vector3().fromBufferAttribute(attribute, index ? index.getX(offset) : offset).applyMatrix4(mesh.matrixWorld);
        result.push(vertex.toArray());
      }
    });
    return result.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  }
  const original = vertices(landscape, (mesh) => /^Site Leaf/.test(mesh.material.name));
  const replacement = vertices(weather, (mesh) => mesh.name.startsWith('lab-weather-plant-'));
  assert.equal(original.length, metadata.budgets.foliageSourceVertexCount);
  assert.equal(replacement.length, original.length, 'splitting cannot add or lose triangles');
  // Compare a rounded multiset rather than sort raw floats whose tiny export errors reorder tied vertices.
  const counts = new Map();
  for (const point of original) {
    const key = point.map((value) => value.toFixed(3)).join(','); counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const point of replacement) {
    const key = point.map((value) => value.toFixed(3)).join(','); counts.set(key, (counts.get(key) ?? 0) - 1);
  }
  assert.ok([...counts.values()].every((count) => count === 0), 'rest-pose foliage must match source geometry');
  const plants = metadata.groups.filter(({ kind }) => kind === 'plant');
  assert.equal(plants.length, 15);
  assert.ok(plants.slice(0, 7).every(({ anchor }) => anchor[1] > 1.5), 'palm crowns pivot above stationary trunks');
  assert.ok(plants.slice(7).every(({ anchor }) => anchor[1] === -0.35), 'shrubs pivot at soil level');
});
