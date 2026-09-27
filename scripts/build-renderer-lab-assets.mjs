import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createWeatherAssets } from './renderer-lab-weather-assets.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(repository, 'assets/renderer-lab');
const sceneDirectory = path.join(repository, 'packages/home-scene/src');
const library = JSON.parse(await readFile(path.join(sceneDirectory, 'device-geometry.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(sceneDirectory, 'house-manifest.json'), 'utf8'));
const layout = JSON.parse(await readFile(path.join(sceneDirectory, 'site-layout.json'), 'utf8'));

/** Supply the browser FileReader methods used by Three's binary-only exporter. */
class ExportFileReader {
  result = null;
  onloadend = null;
  onerror = null;

  /** Resolve a binary GLB buffer without requiring a browser or network access. */
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(
      (result) => {
        this.result = result;
        this.onloadend?.({ target: this });
      },
      (error) => this.onerror?.(error),
    );
  }
}

globalThis.FileReader ??= ExportFileReader;

/** Reproduce a catalog primitive in the same metre-based, Y-up coordinate system. */
function createPartGeometry(part) {
  if (part.shape === 'box') return new BoxGeometry(...part.size);
  if (part.shape === 'cylinder') {
    return new CylinderGeometry(0.5, 0.5, 1, 20).scale(...part.size);
  }
  if (part.shape === 'sphere') {
    return new SphereGeometry(0.5, 16, 10).scale(...part.size);
  }
  throw new Error(`Unsupported fixture primitive: ${part.shape}`);
}

/** Preserve the shared catalog's physically based surface settings. */
function createPartMaterial(part, name) {
  const surface = library.materials[part.material];
  if (!surface) throw new Error(`Missing fixture material: ${part.material}`);
  const luminous = part.role === 'glow';
  return new MeshStandardMaterial({
    name,
    color: luminous ? '#ffe2ad' : surface.color,
    roughness: surface.roughness,
    metalness: surface.metalness,
    transparent: (surface.opacity ?? 1) < 1,
    opacity: surface.opacity ?? 1,
    emissive: luminous ? '#ffe2ad' : '#000000',
    emissiveIntensity: luminous ? 1 : 0,
  });
}

/** Export only live fixture parts: the room GLB already contains the static shells. */
function createFixtures() {
  const scene = new Scene();
  scene.name = 'VantaHome renderer comparison fixtures';
  const deviceIds = ['master-light', 'master-bedside-left', 'master-bedside-right'];
  for (const deviceId of deviceIds) {
    const device = manifest.devices.find(({ id }) => id === deviceId);
    const geometry = library.devices[deviceId];
    if (!device || !geometry) throw new Error(`Missing fixture: ${deviceId}`);
    const parts = geometry.parts.filter(({ role }) => role === 'glow');
    if (parts.length !== 1) throw new Error(`Expected one light diffuser: ${deviceId}`);
    const [part] = parts;
    const name = `lab-light-${deviceId}`;
    const mesh = new Mesh(createPartGeometry(part), createPartMaterial(part, name));
    mesh.name = name;
    mesh.position.set(...device.position).add({ x: part.position[0], y: part.position[1], z: part.position[2] });
    mesh.rotation.set(...part.rotation);
    scene.add(mesh);
  }

  const blind = manifest.devices.find(({ id }) => id === 'master-blinds');
  if (!blind) throw new Error('Missing primary suite blinds');
  const fabric = new Group();
  fabric.name = 'lab-blind-fabric';
  fabric.position.set(blind.position[0], 2.1, blind.position[2]);
  const movingParts = library.devices[blind.id].parts.filter(({ role }) => role !== 'static');
  const blindMaterials = new Map();
  let slatGeometry;
  for (const part of movingParts) {
    const name = part.role === 'slat'
      ? `lab-blind-slat-${String(part.index).padStart(2, '0')}`
      : 'lab-blind-bottom';
    if (!blindMaterials.has(part.material)) {
      blindMaterials.set(part.material, createPartMaterial(part, `lab-${part.material}`));
    }
    if (part.role === 'slat') slatGeometry ??= createPartGeometry(part);
    const mesh = new Mesh(
      part.role === 'slat' ? slatGeometry : createPartGeometry(part),
      blindMaterials.get(part.material),
    );
    mesh.name = name;
    mesh.position.set(part.position[0], blind.position[1] + part.position[1] - 2.1, part.position[2]);
    mesh.rotation.set(...part.rotation);
    fabric.add(mesh);
  }
  scene.add(fabric);
  return scene;
}

/** Add only the four live solar diffusers; landscape.glb owns their poles and housings. */
function createSolarFixtures() {
  const scene = new Scene();
  scene.name = 'VantaHome renderer comparison solar diffusers';
  const devices = manifest.devices.filter(({ model }) => model === 'solar-streetlight');
  if (devices.length !== 4) throw new Error('Expected four property-corner solar streetlights');
  for (const device of devices) {
    const parts = library.devices[device.id]?.parts.filter(({ role }) => role === 'glow');
    if (parts?.length !== 1) throw new Error(`Expected one solar diffuser: ${device.id}`);
    const [part] = parts;
    const name = `lab-light-${device.id}`;
    const mesh = new Mesh(createPartGeometry(part), createPartMaterial(part, name));
    mesh.name = name;
    // Flatten the device hierarchy while preserving its inward-facing corner rotation.
    const rotation = new Euler(...device.rotation);
    mesh.position.fromArray(part.position).applyEuler(rotation).add(new Vector3(...device.position));
    mesh.rotation.set(...part.rotation);
    mesh.quaternion.premultiply(new Quaternion().setFromEuler(rotation));
    scene.add(mesh);
  }
  return scene;
}

/** Write a self-contained GLB without changing the existing scene asset inventory. */
async function exportBinary(name, scene) {
  const exporter = new GLTFExporter();
  const binary = await exporter.parseAsync(scene, { binary: true, trs: true });
  if (!(binary instanceof ArrayBuffer)) throw new Error(`Expected binary GLB for ${name}`);
  await writeFile(path.join(outputDirectory, name), new Uint8Array(binary));
  scene.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      object.material.dispose();
    }
  });
  process.stdout.write(`${name}: ${binary.byteLength} bytes\n`);
}

await mkdir(outputDirectory, { recursive: true });
await exportBinary('fixtures.glb', createFixtures());
await exportBinary('solar.glb', createSolarFixtures());
const weather = await createWeatherAssets(repository, layout, manifest);
await exportBinary('rain.glb', weather.scene);
await writeFile(path.join(sceneDirectory, 'renderer-lab/weather-surfaces.json'), `${JSON.stringify(weather.metadata)}\n`);
