import { getDevice, getRoom } from '../data';
import { readLabLightState } from '../lightAppearance';
import { readDevice, UPPER_ELEVATION, type HouseSceneProps } from './types';

// Keep the existing six-light rendering budget while giving every fill a real device owner.
const ROOM_FILLS = [
  { id: 'living-light', position: [7.6, 2.1, -9], day: 7, night: 4, distance: 9 },
  { id: 'kitchen-light', position: [14.7, 2.1, -12.5], day: 8, night: 4, distance: 6 },
  { id: 'laundry-light', position: [14.5, 2.1, -15.2], day: 5, night: 5, distance: 5 },
  { id: 'family-light', position: [8.3, 2.1, -9.1], day: 9, night: 5, distance: 10 },
  { id: 'master-light', position: [10, 2.2, -14], day: 8, night: 5, distance: 8 },
  { id: 'gym-light', position: [12.5, 2.1, -4.2], day: 7, night: 7, distance: 7 },
] as const;

/** Bind architectural fill to the same power, dimming and color state as its fixture. */
export function roomFillLights({ deviceStates, view, floor, night }: Pick<HouseSceneProps, 'deviceStates' | 'view' | 'floor' | 'night'>) {
  const full = view === 'exterior' || view === 'immersive';
  return ROOM_FILLS.flatMap((fill) => {
    const device = getDevice(fill.id)!;
    const room = getRoom(device.roomId);
    if (!full && room.floor !== floor) return [];
    const light = readLabLightState(device, readDevice(deviceStates, fill.id));
    const elevation = full && room.floor === 'upper' ? UPPER_ELEVATION : 0;
    return [{
      id: fill.id,
      position: [fill.position[0], fill.position[1] + elevation, fill.position[2]] as [number, number, number],
      intensity: light.on ? (night ? fill.night : fill.day) * light.brightness / 100 : 0,
      color: light.colorHex,
      distance: fill.distance,
    }];
  });
}
