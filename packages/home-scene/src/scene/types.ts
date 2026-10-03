import type { SceneAccess } from '../sceneAccess';
import type { LiveEnvironment } from '../environment/useLiveEnvironment';
import siteLayout from '../site-layout.json';
import { ROOMS } from '../data';
import type { DeviceState } from '../state';
export type { DeviceState } from '../state';

export type HouseView = 'exterior' | 'ground' | 'upper' | 'immersive';
export type HouseFloor = 'ground' | 'upper';

export interface HouseSceneProps {
  access?: SceneAccess;
  environment: LiveEnvironment;
  daylight: number;
  view: HouseView;
  floor: HouseFloor;
  roomId: string;
  night: boolean;
  deviceStates: Record<string, DeviceState>;
  selectedDevice: string | null;
  quickDeviceId?: string | null;
  hotspotControlMode?: 'inspector' | 'quick';
  reducedMotion: boolean;
  onSelectDevice: (id: string) => void;
  onReady: () => void;
}

export interface RoomPosition {
  floor: HouseFloor;
  center: [number, number];
  eye: [number, number, number];
  look: [number, number, number];
}

export const UPPER_ELEVATION = 2.9464;

/** Coordinates remain in the exported model's metre-based, Y-up space. */
export const ROOM_POSITIONS: Record<string, RoomPosition> = Object.fromEntries(ROOMS.map((room) => {
  const elevation = room.floor === 'upper' ? UPPER_ELEVATION : 0;
  return [room.id, { floor: room.floor, center: room.id === 'grounds' ? [siteLayout.runtime.gate.position[0], siteLayout.runtime.gate.position[2]] : room.center,
    eye: [room.eye[0], room.eye[1] + elevation, room.eye[2]], look: [room.look[0], room.look[1] + elevation, room.look[2]] }];
}));

/** Treat missing or malformed simulation levels as an off device. */
export function readDevice(states: Record<string, DeviceState>, id: string): DeviceState {
  const state = states[id];
  return state ? { ...state, on: Boolean(state.on), level: Number.isFinite(state.level) ? Math.min(100, Math.max(0, state.level)) : 0 } : { on: false, level: 0 };
}
