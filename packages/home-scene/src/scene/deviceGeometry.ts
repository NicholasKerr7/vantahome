import source from '../device-geometry.json';
import type { DeviceDefinition } from '../data';

export type VectorTuple = [number, number, number];
export type PartRole =
  | 'static'
  | 'glow'
  | 'rotor'
  | 'door'
  | 'window'
  | 'slat'
  | 'blindBottom'
  | 'shutter'
  | 'robot'
  | 'display';
export interface FixtureMaterial {
  color: string;
  roughness: number;
  metalness: number;
  opacity?: number;
}
export interface FixturePart {
  name: string;
  shape: 'box' | 'cylinder' | 'sphere';
  position: VectorTuple;
  size: VectorTuple;
  rotation: VectorTuple;
  material: string;
  role: PartRole;
  index?: number;
}
export interface FixtureGeometry {
  parts: FixturePart[];
  pivot?: VectorTuple;
}
export interface FixtureLibrary {
  materials: Record<string, FixtureMaterial>;
  devices: Record<string, FixtureGeometry>;
}

/** Reject damaged generated geometry before it can create invalid GPU transforms. */
export function validateFixtureLibrary(value: unknown): FixtureLibrary {
  const record = (item: unknown): item is Record<string, unknown> =>
    !!item && typeof item === 'object' && !Array.isArray(item);
  const vector = (item: unknown): item is VectorTuple =>
    Array.isArray(item) &&
    item.length === 3 &&
    item.every((v) => typeof v === 'number' && Number.isFinite(v));
  if (!record(value) || !record(value.materials) || !record(value.devices))
    throw new Error('Fixture geometry is unavailable.');
  const roles: readonly string[] = [
    'static',
    'glow',
    'rotor',
    'door',
    'window',
    'slat',
    'blindBottom',
    'shutter',
    'robot',
    'display',
  ];
  for (const material of Object.values(value.materials)) {
    if (
      !record(material) ||
      typeof material.color !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(material.color) ||
      typeof material.roughness !== 'number' ||
      !Number.isFinite(material.roughness) ||
      typeof material.metalness !== 'number' ||
      !Number.isFinite(material.metalness)
    )
      throw new Error('Invalid fixture surface.');
  }
  for (const fixture of Object.values(value.devices)) {
    if (
      !record(fixture) ||
      !Array.isArray(fixture.parts) ||
      (fixture.pivot !== undefined && !vector(fixture.pivot))
    )
      throw new Error('Invalid fixture assembly.');
    for (const part of fixture.parts) {
      if (
        !record(part) ||
        typeof part.name !== 'string' ||
        !['box', 'cylinder', 'sphere'].includes(String(part.shape)) ||
        !vector(part.position) ||
        !vector(part.rotation) ||
        !vector(part.size) ||
        part.size.some((n) => n <= 0) ||
        !roles.includes(String(part.role)) ||
        typeof part.material !== 'string' ||
        !Object.hasOwn(value.materials, part.material)
      )
        throw new Error('Invalid fixture geometry or material reference.');
    }
  }
  return value as unknown as FixtureLibrary;
}
export const FIXTURE_LIBRARY = validateFixtureLibrary(source);

/** A placed TV needs its own shell because the original television body lives inside the house GLB. */
const PLACED_TELEVISION: FixtureGeometry = {
  parts: [
    { name: 'television frame', shape: 'box', position: [0, 0.4725, -0.005], size: [1.275, 0.735, 0.05], rotation: [0, 0, 0], material: 'graphite', role: 'static' },
    { name: 'television stand', shape: 'box', position: [0, 0.07, -0.025], size: [0.055, 0.11, 0.08], rotation: [0, 0, 0], material: 'graphite', role: 'static' },
    { name: 'television base', shape: 'box', position: [0, 0.01, -0.025], size: [0.42, 0.02, 0.22], rotation: [0, 0, 0], material: 'graphite', role: 'static' },
  ],
};

/** Reuse curated local geometry while retaining authored fixtures' baked static shells. */
export function getDeviceFixtureGeometry(device: DeviceDefinition): FixtureGeometry | undefined {
  if (device.templateDeviceId === 'family-tv') return PLACED_TELEVISION;
  return FIXTURE_LIBRARY.devices[device.templateDeviceId ?? device.id];
}
