import manifest from './house-manifest.json';
import { DEVICE_KINDS, type DeviceKind } from './deviceCapabilities';

export type FloorId = 'ground' | 'upper';
export type ViewId = 'exterior' | 'ground' | 'upper' | 'immersive';
// IDs belong to the validated manifest, allowing additions without duplicate unions.
export type RoomId = string;
export type DeviceId = string;
export type PresetId = 'morning' | 'movie' | 'night' | 'away';
export interface RoomDefinition {
  id: RoomId; name: string; floor: FloorId; detail: string; area: string; outdoor: boolean;
  center: [number, number]; eye: [number, number, number]; look: [number, number, number];
  bounds?: [number, number, number, number];
}
export interface DeviceDefinition {
  id: DeviceId; name: string; roomId: RoomId; kind: DeviceKind; description: string;
  levelLabel: string; lowLabel: string; highLabel: string;
  hotspot: [number, number, number]; position: [number, number, number]; rotation: [number, number, number]; dimensions: [number, number, number];
  mount: 'floor' | 'wall' | 'ceiling' | 'surface'; model: string;
  defaultOn: boolean; defaultLevel: number; sourceKind?: string;
}

/** Validate catalog shape once so missing room links or invalid placements fail clearly. */
export function validateHouseManifest(value: unknown): { rooms: RoomDefinition[]; devices: DeviceDefinition[] } {
  const record = (item: unknown): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item);
  const tuple = (item: unknown, size: number): boolean => Array.isArray(item) && item.length === size && item.every((n) => typeof n === 'number' && Number.isFinite(n));
  if (!record(value) || !Array.isArray(value.rooms) || !Array.isArray(value.devices) || !value.rooms.length) throw new Error('House manifest must define rooms and devices.');
  const roomIds = new Set<string>(); const deviceIds = new Set<string>();
  for (const room of value.rooms) {
    if (!record(room) || typeof room.id !== 'string' || !/^[a-z0-9-]+$/.test(room.id) || roomIds.has(room.id) || !['ground', 'upper'].includes(String(room.floor)) || !['name', 'detail', 'area'].every((key) => typeof room[key] === 'string') || typeof room.outdoor !== 'boolean' || !tuple(room.center, 2) || !tuple(room.eye, 3) || !tuple(room.look, 3) || (room.bounds !== undefined && !tuple(room.bounds, 4))) throw new Error('House manifest contains an invalid or duplicate room.');
    roomIds.add(room.id);
  }
  for (const device of value.devices) {
    if (!record(device) || typeof device.id !== 'string' || !/^[a-z0-9-]+$/.test(device.id) || deviceIds.has(device.id) || !roomIds.has(String(device.roomId)) || !(DEVICE_KINDS as readonly unknown[]).includes(device.kind) || !['name', 'description', 'levelLabel', 'lowLabel', 'highLabel', 'model'].every((key) => typeof device[key] === 'string') || !tuple(device.hotspot, 3) || !tuple(device.position, 3) || !tuple(device.rotation, 3) || !tuple(device.dimensions, 3) || (device.dimensions as number[]).some((n) => n <= 0) || !['floor', 'wall', 'ceiling', 'surface'].includes(String(device.mount)) || typeof device.defaultOn !== 'boolean' || typeof device.defaultLevel !== 'number' || !Number.isFinite(device.defaultLevel) || device.defaultLevel < 0 || device.defaultLevel > 100) throw new Error('House manifest contains an invalid device, placement or room reference.');
    deviceIds.add(device.id);
  }
  return value as unknown as { rooms: RoomDefinition[]; devices: DeviceDefinition[] };
}
const validated = validateHouseManifest(manifest);
export const ROOMS: readonly RoomDefinition[] = validated.rooms;
export const DEVICES: readonly DeviceDefinition[] = validated.devices;
const roomById = new Map(ROOMS.map((room) => [room.id, room]));
const deviceById = new Map(DEVICES.map((device) => [device.id, device]));

export const PRESETS: readonly { id: PresetId; name: string; description: string }[] = [
  { id: 'morning', name: 'Morning', description: 'Open up to the day' },
  { id: 'movie', name: 'Movie time', description: 'Dim lights. Settle in.' },
  { id: 'night', name: 'Good night', description: 'Make it a quiet one' },
  { id: 'away', name: 'Away', description: 'Lights down. Essentials on.' },
];

/** Resolve a known room with a dependable default for restored state. */
export function getRoom(id: string): RoomDefinition {
  return roomById.get(id) ?? ROOMS[0]!;
}

/** Resolve device metadata without inventing a device for unknown input. */
export function getDevice(id: string | null): DeviceDefinition | undefined {
  return id === null ? undefined : deviceById.get(id);
}

/** Identify controls whose status follows their physical opening position. */
export function isPositionDevice(device: DeviceDefinition | undefined): boolean {
  return !!device && ['blinds', 'gate', 'garage', 'window', 'door'].includes(device.kind);
}

/** Describe a device value in the unit that makes sense to its user. */
export function formatDeviceLevel(device: DeviceDefinition, level: number): string {
  if (device.kind === 'ac') return `${26 - Math.round(level * 0.08)}°C`;
  if (isPositionDevice(device)) return level === 0 ? 'Closed' : level === 100 ? 'Fully open' : `${level}% open`;
  return `${Math.round(level)}%`;
}
