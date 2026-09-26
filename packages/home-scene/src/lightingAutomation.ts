import { DEVICES } from './data';
import type { DeviceStates } from './simulationTypes';

export type LightingMode = 'auto' | 'day' | 'night';

/** Switch only the four solar poles, preserving brightness and every indoor device. */
export function synchronizeSolarLights(states: DeviceStates, night: boolean): DeviceStates {
  let next = states;
  for (const device of DEVICES) {
    if (device.model !== 'solar-streetlight' || states[device.id]?.on === night) continue;
    if (next === states) next = { ...states };
    next[device.id] = { ...states[device.id], on: night };
  }
  return next;
}
