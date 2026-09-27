import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  Box3, BoxGeometry, BufferGeometry, Color, DoubleSide, Float32BufferAttribute,
  Mesh, MeshStandardMaterial, Raycaster, Scene, Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const ORIGINAL_FOLIAGE_NAMES = [
  'landscape-Site Leaf dark', 'landscape-Site Leaf light', 'landscape-Site Leaf middle',
];
const PAVED_NAMES = ['Site Road', 'Site Paving', 'Site Path', 'Site Access'];

/** Generate stable pseudo-random values for repeatable assets and renderer comparisons. */
function seed(index) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Read geometry and plain material colors without decoding unrelated embedded interior textures. */
export async function loadGeometryModel(filename) {
  const bytes = await readFile(filename);
  const loader = new GLTFLoader().register((parser) => ({
    name: 'VantaHomeGeometryOnly',
    /** Preserve source linear colors while avoiding browser-only image APIs in this build tool. */
    loadMaterial(index) {
      const material = parser.json.materials[index];
      const surface = material.pbrMetallicRoughness ?? {};
      return Promise.resolve(new MeshStandardMaterial({
        name: material.name,
        color: new Color().fromArray(surface.baseColorFactor ?? [1, 1, 1]),
        roughness: surface.roughnessFactor ?? 1,
        side: DoubleSide,
      }));
    },
  }));
  const model = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  model.scene.updateMatrixWorld(true);
  return model.scene;
}

/** Test the traced parcel polygon in its metre-based Y-up renderer coordinates. */
function insidePolygon(x, z, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [ax, az] = polygon[index];
    const [bx, bz] = polygon[previous];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

/** Collect meshes satisfying a semantic source-material or node-name predicate. */
function collectMeshes(scene, predicate) {
  const meshes = [];
  scene.traverse((object) => { if (object.isMesh && predicate(object)) meshes.push(object); });
  return meshes;
}

/** Bake indexed source triangles into world coordinates for exact raycasts and overlays. */
function worldTriangles(mesh) {
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  const positions = geometry.getAttribute('position');
  const triangles = [];
  for (let index = 0; index < positions.count; index += 3) {
    const vertices = [0, 1, 2].map((offset) => new Vector3().fromBufferAttribute(positions, index + offset));
    const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
    triangles.push({ vertices, normal });
  }
  geometry.dispose();
  return triangles;
}

/** Merge particles into one draw call per animation phase and discard their temporary primitives. */
function mergedParticleMesh(geometries, material, name) {
  if (!geometries.length) throw new Error(`No geometry generated for ${name}`);
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) throw new Error(`Could not merge ${name}`);
  const mesh = new Mesh(merged, material);
  mesh.name = name;
  return mesh;
}

/** Rebuild exact foliage triangles around individual crown/soil anchors with original linear colors. */
function splitFoliage(scene, landscape, layout, groups) {
  const palms = layout.planting.palms.map(([x, north, height]) => [x, -0.35 + height * 0.59, -north]);
  const shrubs = layout.planting.shrubs.map(({ a, b }) => [(a[0] + b[0]) / 2, -0.35, -(a[1] + b[1]) / 2]);
  const anchors = [...palms, ...shrubs];
  const buckets = anchors.map(() => ({ positions: [], normals: [], colors: [] }));
  const sourceNames = ORIGINAL_FOLIAGE_NAMES.map((name) => name.replaceAll(' ', '_'));
  let sourceVertexCount = 0;
  for (const mesh of collectMeshes(landscape, (object) => sourceNames.includes(object.name))) {
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const color = mesh.material.color.toArray();
    sourceVertexCount += positions.count;
    for (let index = 0; index < positions.count; index += 3) {
      const center = new Vector3();
      for (let offset = 0; offset < 3; offset++) center.add(new Vector3().fromBufferAttribute(positions, index + offset));
      center.multiplyScalar(1 / 3);
      // High fronds belong to palms; low planting belongs to the nearest traced shrub bed.
      const first = center.y > 1.2 ? 0 : palms.length;
      const last = center.y > 1.2 ? palms.length : anchors.length;
      let nearest = first, distance = Infinity;
      for (let candidate = first; candidate < last; candidate++) {
        const anchor = anchors[candidate];
        const squared = (center.x - anchor[0]) ** 2 + (center.z - anchor[2]) ** 2;
        if (squared < distance) { nearest = candidate; distance = squared; }
      }
      const bucket = buckets[nearest], anchor = anchors[nearest];
      for (let offset = 0; offset < 3; offset++) {
        const vertex = index + offset;
        bucket.positions.push(positions.getX(vertex) - anchor[0], positions.getY(vertex) - anchor[1], positions.getZ(vertex) - anchor[2]);
        bucket.normals.push(normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex));
        bucket.colors.push(...color);
      }
    }
    geometry.dispose();
  }
  const material = new MeshStandardMaterial({ name: 'lab-weather-foliage', color: '#ffffff', roughness: 0.85, vertexColors: true, side: DoubleSide });
  for (let index = 0; index < buckets.length; index++) {
    const bucket = buckets[index];
    if (!bucket.positions.length) throw new Error(`Missing source foliage for anchor ${index}`);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(bucket.positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(bucket.normals, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(bucket.colors, 3));
    const name = `lab-weather-plant-${String(index).padStart(2, '0')}`;
    const indexed = mergeVertices(geometry, 0.000001); geometry.dispose();
    const mesh = new Mesh(indexed, material); mesh.name = name; mesh.position.fromArray(anchors[index]);
    scene.add(mesh);
    groups.push({ name, kind: 'plant', phase: seed(index + 711), anchor: anchors[index], tier: 0 });
  }
  return sourceVertexCount;
}

/** Build bounded, surface-aware weather batches directly against the committed house and landscape. */
export async function createWeatherAssets(repository, layout, manifest) {
  const modelDirectory = path.join(repository, 'packages/home-scene/public/models');
  const [exterior, landscape] = await Promise.all([
    loadGeometryModel(path.join(modelDirectory, 'exterior.glb')),
    loadGeometryModel(path.join(modelDirectory, 'landscape.glb')),
  ]);
  const scene = new Scene(); scene.name = 'VantaHome surface-aware property weather';
  const groups = [], landingPoints = [], splashPoints = [], runoffPoints = [];
  const roofMeshes = collectMeshes(exterior, (mesh) => mesh.name.startsWith('roof--'));
  const pavedMeshes = collectMeshes(landscape, (mesh) => PAVED_NAMES.includes(mesh.material.name));
  const landscapeMeshes = collectMeshes(landscape, (mesh) => !mesh.material.name.includes('Leaf') && !mesh.material.name.includes('Bark') && !mesh.material.name.includes('Trunk'));
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0), 0, 40);
  /** Return the first downward hit, keeping roof slopes, terrace levels, and the energy shed accurate. */
  function hitAt(x, z, meshes) {
    ray.ray.origin.set(x, 25, z);
    return ray.intersectObjects(meshes, false)[0];
  }
  const polygon = layout.parcel.vertices.map(([x, north]) => [x, -north]);
  const shed = manifest.rooms.find(({ id }) => id === 'utility').bounds;
  /** Keep ground-level drops outside solid house/shed envelopes even as the wind changes direction. */
  function isClearLanding(x, z, hit) {
    if (!hit) return false;
    const houseInterior = x > -1 && x < 17.3 && z > -17.7 && z < 1;
    const shedInterior = x > shed[0] - 0.7 && x < shed[1] + 0.7 && z > shed[2] - 0.7 && z < shed[3] + 0.7;
    return !(houseInterior && hit.point.y < 2.6) && !(shedInterior && hit.point.y < 2.4);
  }
  const rainMaterial = new MeshStandardMaterial({ name: 'lab-weather-rain', color: '#bfd8e3', roughness: 0.6, transparent: true, opacity: 0.48, depthWrite: false });
  for (let phase = 0; phase < 12; phase++) {
    const geometries = [];
    for (let attempt = 0; geometries.length < 30 && attempt < 3000; attempt++) {
      const index = phase * 3000 + attempt;
      const x = -15.3 + seed(index * 3 + 1) * 50.6;
      const z = -28.8 + seed(index * 3 + 2) * 41.0;
      if (!(z < -23.5 || insidePolygon(x, z, polygon))) continue;
      const hit = hitAt(x, z, [...roofMeshes, ...landscapeMeshes]);
      if (!isClearLanding(x, z, hit)) continue;
      const y = hit.point.y;
      const tier = phase % 3 + 1;
      // Extra heavy/storm batches use longer streaks so intensity remains readable at property scale.
      const length = tier === 1 ? 0.24 + seed(index * 3 + 3) * 0.22
        : tier === 2 ? 0.5 + seed(index * 3 + 3) * 0.3 : 0.85 + seed(index * 3 + 3) * 0.35;
      const width = tier === 1 ? 0.023 : tier === 2 ? 0.028 : 0.032;
      geometries.push(new BoxGeometry(width, length, width).translate(x, y + length / 2 + 0.015, z));
      landingPoints.push({ phase, position: [x, y, z], source: hit.object.name });
    }
    if (geometries.length !== 30) throw new Error(`Could not fit rain phase ${phase}`);
    const name = `lab-weather-rain-${String(phase).padStart(2, '0')}`;
    scene.add(mergedParticleMesh(geometries, rainMaterial, name));
    groups.push({ name, kind: 'rain', phase: phase / 12, anchor: [0, 0, 0], tier: phase % 3 + 1 });
  }
  const splashMaterial = new MeshStandardMaterial({ name: 'lab-weather-splash', color: '#c8dce5', roughness: 0.34, transparent: true, opacity: 0.57, depthWrite: false });
  for (let phase = 0; phase < 4; phase++) {
    const geometries = [];
    for (let impact = 0; impact < 28; impact++) {
      const onRoof = impact < 8;
      const pavedName = impact < 20 ? 'Site Paving' : impact < 24 ? 'Site Road' : impact < 26 ? 'Site Path' : 'Site Access';
      const targets = onRoof ? roofMeshes : pavedMeshes.filter((mesh) => mesh.material.name === pavedName);
      const bounds = new Box3(); targets.forEach((mesh) => bounds.expandByObject(mesh));
      let placed = false;
      for (let attempt = 0; attempt < 3000; attempt++) {
        const index = phase * 83003 + impact * 3001 + attempt + 8331;
        const x = bounds.min.x + seed(index) * (bounds.max.x - bounds.min.x);
        const z = bounds.min.z + seed(index + 71) * (bounds.max.z - bounds.min.z);
        const hit = hitAt(x, z, targets);
        if (!hit || hit.face.normal.y < 0.45) continue;
        const covering = hitAt(x, z, roofMeshes);
        if (!onRoof && covering && covering.point.y > hit.point.y + 0.03) continue;
        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        const center = hit.point.clone().addScaledVector(normal, 0.035);
        for (let arm = 0; arm < 3; arm++) {
          const angle = arm * Math.PI * 2 / 3 + seed(index) * 3;
          geometries.push(new BoxGeometry(0.018, 0.075, 0.018)
            .rotateZ(0.85).rotateY(angle)
            .translate(center.x + Math.sin(angle) * 0.042, center.y + 0.044, center.z + Math.cos(angle) * 0.042));
        }
        splashPoints.push({ phase, position: hit.point.toArray(), source: hit.object.name, surface: onRoof ? 'roof' : 'pavement' });
        placed = true; break;
      }
      if (!placed) throw new Error(`Could not sample ${pavedName} splash surface`);
    }
    const name = `lab-weather-splash-${String(phase).padStart(2, '0')}`;
    scene.add(mergedParticleMesh(geometries, splashMaterial, name));
    groups.push({ name, kind: 'splash', phase: phase / 4, anchor: [0, 0, 0], tier: phase < 2 ? 1 : 2 });
  }
  // The primary clay roof's exposed, nearly horizontal boundary edges identify eaves, not ridges.
  const edges = new Map();
  for (const mesh of roofMeshes.filter((mesh) => mesh.name === 'roof--clay')) {
    for (const { vertices, normal } of worldTriangles(mesh)) {
      if (normal.y < 0.4) continue;
      for (let index = 0; index < 3; index++) {
        const a = vertices[index], b = vertices[(index + 1) % 3];
        const key = [a, b].map((point) => point.toArray().map((value) => value.toFixed(3)).join(',')).sort().join('|');
        const previous = edges.get(key);
        edges.set(key, { a, b, count: (previous?.count ?? 0) + 1 });
      }
    }
  }
  const eaves = [];
  for (const { a, b, count } of edges.values()) {
    if (count !== 1 || Math.abs(a.y - b.y) > 0.15 || a.distanceTo(b) < 1) continue;
    const midpoint = a.clone().add(b).multiplyScalar(0.5);
    const outside = new Vector3(b.z - a.z, 0, a.x - b.x).normalize().multiplyScalar(0.18);
    for (const sign of [1, -1]) {
      const probe = midpoint.clone().addScaledVector(outside, sign);
      const hit = hitAt(probe.x, probe.z, roofMeshes);
      if (!hit || hit.point.y < midpoint.y - 0.45) { eaves.push({ a, b, outside: outside.clone().multiplyScalar(sign) }); break; }
    }
  }
  if (!eaves.length) throw new Error('No exposed roof eaves found');
  const runoffMaterial = new MeshStandardMaterial({ name: 'lab-weather-runoff', color: '#bcd2dd', roughness: 0.28, transparent: true, opacity: 0.47, depthWrite: false });
  for (let phase = 0; phase < 4; phase++) {
    const geometries = [];
    for (let attempt = 0; geometries.length < 14 && attempt < 3000; attempt++) {
      const eave = eaves[(phase * 97 + attempt) % eaves.length];
      const point = eave.a.clone().lerp(eave.b, 0.12 + seed(phase * 3001 + attempt) * 0.76).add(eave.outside);
      const covering = hitAt(point.x, point.z, roofMeshes);
      if (covering && covering.point.y > point.y - 1.05) continue;
      geometries.push(new BoxGeometry(0.028, 0.25, 0.028).translate(point.x, point.y - 0.16, point.z));
      runoffPoints.push({ phase, position: point.toArray() });
    }
    if (geometries.length !== 14) throw new Error('Could not place runoff clear of lower roofs');
    const name = `lab-weather-runoff-${String(phase).padStart(2, '0')}`;
    scene.add(mergedParticleMesh(geometries, runoffMaterial, name));
    groups.push({ name, kind: 'runoff', phase: phase / 4, anchor: [0, 0, 0], tier: 2 });
  }
  const wetPositions = [];
  for (const mesh of pavedMeshes) {
    for (const { vertices, normal } of worldTriangles(mesh)) {
      if (normal.y < 0.98) continue;
      for (const point of vertices) wetPositions.push(point.x, point.y + 0.009, point.z);
    }
  }
  const wetGeometry = new BufferGeometry();
  wetGeometry.setAttribute('position', new Float32BufferAttribute(wetPositions, 3)); wetGeometry.computeVertexNormals();
  const wetMaterial = new MeshStandardMaterial({ name: 'lab-weather-wet', color: '#415462', roughness: 0.12, metalness: 0.22, transparent: true, opacity: 0.19, depthWrite: false });
  const wet = new Mesh(wetGeometry, wetMaterial); wet.name = 'lab-weather-wet'; scene.add(wet);
  groups.push({ name: wet.name, kind: 'wet', phase: 0, anchor: [0, 0, 0], tier: 0 });
  const foliageSourceVertexCount = splitFoliage(scene, landscape, layout, groups);
  for (const source of [exterior, landscape]) source.traverse((object) => {
    if (object.isMesh) { object.geometry.dispose(); object.material.dispose(); }
  });
  return {
    scene,
    metadata: {
      version: 1, units: 'metres', coordinateSystem: 'Y-up, north is negative Z',
      originalFoliageNames: ORIGINAL_FOLIAGE_NAMES, groups,
      budgets: { drawPrimitives: groups.length, rainDrops: landingPoints.length, splashImpacts: splashPoints.length, runoffDrops: runoffPoints.length, foliageSourceVertexCount },
      landingPoints, splashPoints, runoffPoints,
    },
  };
}
