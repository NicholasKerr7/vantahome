import source from '../device-geometry.json';

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
