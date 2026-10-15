import { AUTHORED_DEVICES, ROOMS, installRuntimeDeviceDefinitions, type DeviceDefinition } from './data';
import type { DeviceKind } from './deviceCapabilities';
import { HOUSE_SCENE_BOUNDS } from './houseBounds';

export const MAX_RUNTIME_DEVICES = 32;
/** Keep outdoor fixtures clear of the complete authored house, including porch and roof overhangs. */
export const HOUSE_PLACEMENT_EXCLUSION_BOUNDS = [HOUSE_SCENE_BOUNDS.min[0], HOUSE_SCENE_BOUNDS.max[0], HOUSE_SCENE_BOUNDS.min[2], HOUSE_SCENE_BOUNDS.max[2]] as const;
export type DeviceMount = DeviceDefinition['mount'];
export interface SimulationDevicePlacement {
  version: 1;
  templateId: string;
  modelRoomId: string;
  position: [number, number, number];
  rotationY: number;
  mount: DeviceMount;
}
export interface RuntimePlacedDevice {
  id: string;
  name: string;
  placement: SimulationDevicePlacement;
}
export interface SimulationDeviceTemplate {
  id: string;
  name: string;
  description: string;
  kind: DeviceKind;
  mount: DeviceMount;
  sourceDeviceId: string;
  outdoor: boolean;
}
export const SIMULATION_DEVICE_TEMPLATES: readonly SimulationDeviceTemplate[] = [
  { id: 'master-light', name: 'Ceiling light', description: 'A quiet architectural glow, with brightness and colour controls.', kind: 'light', mount: 'ceiling', sourceDeviceId: 'master-light', outdoor: false },
  { id: 'master-bedside-left', name: 'Table lamp', description: 'Warm, sculptural lighting for a bedside table or console.', kind: 'light', mount: 'surface', sourceDeviceId: 'master-bedside-left', outdoor: false },
  { id: 'living-fan', name: 'Ceiling fan', description: 'A modern fan with responsive blade movement and speed controls.', kind: 'fan', mount: 'ceiling', sourceDeviceId: 'living-fan', outdoor: false },
  { id: 'master-ac', name: 'Climate unit', description: 'A wall-mounted air conditioner with a subtle airflow preview.', kind: 'ac', mount: 'wall', sourceDeviceId: 'master-ac', outdoor: false },
  { id: 'living-speaker', name: 'Wall speaker', description: 'A compact speaker with playback and volume controls.', kind: 'speaker', mount: 'wall', sourceDeviceId: 'living-speaker', outdoor: false },
  { id: 'grounds-light', name: 'Path light', description: 'A refined bollard light for the grounds and garden paths.', kind: 'light', mount: 'floor', sourceDeviceId: 'grounds-light', outdoor: true },
  { id: 'living-air', name: 'Air sensor', description: 'A discreet wall sensor with simulated environmental readings.', kind: 'air', mount: 'wall', sourceDeviceId: 'living-air', outdoor: false },
  { id: 'family-tv', name: 'Television', description: 'A slim display with animated preview, power and remote controls.', kind: 'tv', mount: 'surface', sourceDeviceId: 'family-tv', outdoor: false },
];
let runtimePlacements: RuntimePlacedDevice[] = [];

/** Read a curated template without letting caller-supplied capabilities or assets enter the scene. */
export function getSimulationDeviceTemplate(id: string): SimulationDeviceTemplate | undefined {
  return SIMULATION_DEVICE_TEMPLATES.find((template) => template.id === id);
}

/** Resolve only the original fixture, even if the active catalog has already changed. */
function sourceDevice(templateId: string): DeviceDefinition | undefined {
  const template = getSimulationDeviceTemplate(templateId);
  const device = template && AUTHORED_DEVICES.find((item) => item.id === template.sourceDeviceId);
  // The authored TV is built into furniture; its standalone shell includes a small pedestal.
  return device?.id === 'family-tv' ? { ...device, dimensions: [1.275, 0.86, 0.22], hotspot: [device.hotspot[0], device.hotspot[1] + 0.125, device.hotspot[2]] } : device;
}

/** Restrict outdoor fixtures to the grounds and keep indoor appliances out of the garden. */
export function canPlaceDeviceInRoom(templateId: string, modelRoomId: string): boolean {
  const template = getSimulationDeviceTemplate(templateId);
  const room = ROOMS.find((item) => item.id === modelRoomId);
  const source = sourceDevice(templateId);
  if (!template || !source || !room?.bounds || !(template.outdoor ? room.id === 'grounds' : !room.outdoor)) return false;
  const [left, right, back, front] = room.bounds;
  const minimumFootprint = Math.min(source.dimensions[0], source.dimensions[2]) + 0.08;
  return right - left >= minimumFootprint && front - back >= minimumFootprint;
}

/** Clamp a finite value to one interval without allowing invalid GPU transforms. */
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Normalize a finite heading into the same bounded representation used in persistence. */
function heading(value: number): number {
  return ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

/** Place ceiling hardware at the room's authored ceiling, with a safe common fallback. */
function ceilingAnchor(modelRoomId: string, height: number): number {
  const source = AUTHORED_DEVICES.find((item) => item.roomId === modelRoomId && item.mount === 'ceiling');
  return (source ? source.position[1] + source.dimensions[1] : 2.7) - height;
}

/** Return the legal height interval for accessible height controls and validation. */
export function devicePlacementHeightRange(templateId: string, modelRoomId: string): [number, number] | null {
  const source = sourceDevice(templateId);
  if (!source || !canPlaceDeviceInRoom(templateId, modelRoomId)) return null;
  if (source.mount === 'floor') return [-0.35, -0.35];
  if (source.mount === 'ceiling') {
    const height = ceilingAnchor(modelRoomId, source.dimensions[1]);
    return [height, height];
  }
  return source.mount === 'wall' ? [0.4, Math.min(2.3, 2.75 - source.dimensions[1])] : [0.4, 1.3];
}

/** Snap fixtures inside room bounds; wall fixtures always face into the room and ceilings keep their height. */
export function clampDevicePlacement(input: SimulationDevicePlacement): SimulationDevicePlacement | null {
  const template = getSimulationDeviceTemplate(input.templateId);
  const source = sourceDevice(input.templateId);
  const room = ROOMS.find((item) => item.id === input.modelRoomId);
  const heights = devicePlacementHeightRange(input.templateId, input.modelRoomId);
  if (!template || !source || !room?.bounds || !heights || !Array.isArray(input.position)
    || input.position.length !== 3 || input.position.some((value) => !Number.isFinite(value)) || !Number.isFinite(input.rotationY)) return null;
  const [left, right, back, front] = room.bounds;
  const [width, , depth] = source.dimensions;
  let rotationY = heading(input.rotationY);
  let [x, y, z] = input.position;
  y = clamp(y, ...heights);
  if (template.mount === 'wall') {
    x = clamp(x, left, right);
    z = clamp(z, back, front);
    const edge = [Math.abs(x - left), Math.abs(x - right), Math.abs(z - back), Math.abs(z - front)];
    const nearest = edge.indexOf(Math.min(...edge));
    const inset = depth / 2 + 0.025;
    if (nearest < 2) {
      x = nearest === 0 ? left + inset : right - inset;
      z = clamp(z, back + width / 2 + 0.04, front - width / 2 - 0.04);
      rotationY = nearest === 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      z = nearest === 2 ? back + inset : front - inset;
      x = clamp(x, left + width / 2 + 0.04, right - width / 2 - 0.04);
      rotationY = nearest === 2 ? 0 : -Math.PI;
    }
  } else {
    const xMargin = Math.abs(Math.cos(rotationY)) * width / 2 + Math.abs(Math.sin(rotationY)) * depth / 2 + 0.04;
    const zMargin = Math.abs(Math.sin(rotationY)) * width / 2 + Math.abs(Math.cos(rotationY)) * depth / 2 + 0.04;
    if (right - left < xMargin * 2 || front - back < zMargin * 2) return null;
    x = clamp(x, left + xMargin, right - xMargin);
    z = clamp(z, back + zMargin, front - zMargin);
    if (template.outdoor) {
      const [houseLeft, houseRight, houseBack, houseFront] = HOUSE_PLACEMENT_EXCLUSION_BOUNDS;
      const edges = [houseLeft - xMargin, houseRight + xMargin, houseBack - zMargin, houseFront + zMargin];
      if (x > edges[0]! && x < edges[1]! && z > edges[2]! && z < edges[3]!) {
        // Resolve a draft to the nearest clear edge; strict persistence validation rejects the original overlap.
        const distances = [x - edges[0]!, edges[1]! - x, z - edges[2]!, edges[3]! - z];
        const nearest = distances.indexOf(Math.min(...distances));
        if (nearest < 2) x = edges[nearest]!;
        else z = edges[nearest]!;
      }
    }
  }
  return { version: 1, templateId: template.id, modelRoomId: room.id, position: [x, y, z], rotationY, mount: template.mount };
}

/** Create a valid starting pose; the editor still makes furniture clearance visible before saving. */
export function createDefaultDevicePlacement(templateId: string, modelRoomId: string): SimulationDevicePlacement | null {
  const template = getSimulationDeviceTemplate(templateId);
  const room = ROOMS.find((item) => item.id === modelRoomId);
  if (!template || !room || !canPlaceDeviceInRoom(templateId, modelRoomId)) return null;
  return clampDevicePlacement({ version: 1, templateId, modelRoomId, position: [room.center[0], template.mount === 'wall' ? 1.5 : 0.7, room.center[1]], rotationY: 0, mount: template.mount });
}

/** Reject extra fields, arbitrary assets, nonfinite poses and transforms that have not been safely snapped. */
export function parseSimulationDevicePlacement(input: unknown): SimulationDevicePlacement | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== 6 || !['version', 'templateId', 'modelRoomId', 'position', 'rotationY', 'mount'].every((key) => Object.hasOwn(value, key))
    || value.version !== 1 || typeof value.templateId !== 'string' || typeof value.modelRoomId !== 'string' || typeof value.rotationY !== 'number'
    || !Array.isArray(value.position) || value.position.length !== 3 || value.position.some((item) => typeof item !== 'number' || !Number.isFinite(item))) return null;
  const candidate = value as unknown as SimulationDevicePlacement;
  const bounded = clampDevicePlacement(candidate);
  if (!bounded || candidate.mount !== bounded.mount || Math.abs(candidate.rotationY - bounded.rotationY) > 0.000001
    || candidate.position.some((item, index) => Math.abs(item - bounded.position[index]) > 0.000001)) return null;
  return bounded;
}

/** Validate the complete custom catalog without mutating the renderer or accepting arbitrary IDs. */
export function parseRuntimePlacedDevices(input: unknown): RuntimePlacedDevice[] | null {
  if (!Array.isArray(input) || input.length > MAX_RUNTIME_DEVICES) return null;
  const seen = new Set<string>();
  const devices: RuntimePlacedDevice[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const value = item as Record<string, unknown>;
    if (Object.keys(value).length !== 3 || typeof value.id !== 'string' || !/^placed-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)
      || seen.has(value.id) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 || /[\u0000-\u001f\u007f]/u.test(value.name)) return null;
    const placement = parseSimulationDevicePlacement(value.placement);
    if (!placement) return null;
    seen.add(value.id);
    devices.push({ id: value.id, name: value.name, placement });
  }
  return devices;
}

/** Derive behaviour and assets solely from curated fixtures; placement never defines device capabilities. */
export function buildRuntimeDeviceDefinitions(placements: readonly RuntimePlacedDevice[]): DeviceDefinition[] {
  return placements.map(({ id, name, placement }) => {
    const source = sourceDevice(placement.templateId)!;
    const offset = source.hotspot[1] - source.position[1];
    return { ...source, id, name, roomId: placement.modelRoomId, position: [...placement.position], rotation: [0, placement.rotationY, 0],
      hotspot: [placement.position[0], placement.position[1] + offset, placement.position[2]], dimensions: [...source.dimensions],
      templateDeviceId: source.id, defaultOn: source.kind === 'air', defaultLevel: source.kind === 'air' ? 0 : source.defaultLevel,
      description: 'Placed simulation device · no real device control' };
  });
}

/** Replace the complete active-scope registry; callers must also apply fresh host-issued access grants. */
export function replaceRuntimeDevices(input: unknown): boolean {
  const next = parseRuntimePlacedDevices(input);
  if (!next) return false;
  if (JSON.stringify(next) === JSON.stringify(runtimePlacements)) return true;
  runtimePlacements = next;
  installRuntimeDeviceDefinitions(buildRuntimeDeviceDefinitions(next));
  return true;
}

/** Return an isolated copy so transport/persistence callers cannot mutate the active catalog. */
export function getRuntimePlacements(): RuntimePlacedDevice[] {
  return runtimePlacements.map((device) => ({ ...device, placement: { ...device.placement, position: [...device.placement.position] } }));
}
