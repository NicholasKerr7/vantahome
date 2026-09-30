import { synchronizeGasSafety } from './gasSimulation';
import { getFireIncident, synchronizeFireSafety } from './fireSafetySimulation';
import { advanceGateSafety, GATE_DEVICE_ID, normalizeRestoredGateState, synchronizeGateSafety } from './gateSafetySimulation';
import type { DeviceStates } from './simulationTypes';

/** These modeled room/approach lights support the preview; they are not certified escape lighting. */
export const FIRE_PREVIEW_LIGHT_IDS = ['living-light', 'family-light', 'kitchen-light', 'master-light', 'bedroom-1-light', 'bedroom-2-light', 'bedroom-3-light', 'bedroom-4-light', 'bedroom-5-light', 'grounds-light'] as const;

/** Hold useful preview lights steady while an incident is latched, preserving unrelated devices. */
function illuminateIncident(states: DeviceStates): DeviceStates {
  let next = states;
  for (const id of FIRE_PREVIEW_LIGHT_IDS) {
    const light = next[id];
    if (!light || light.on && light.level === 100 && light.settings?.lightEffect === 'none' && light.settings?.lightColorMode === 'temperature' && light.settings?.colorTempK === 4000) continue;
    if (next === states) next = { ...states };
    next[id] = { ...light, on: true, level: 100, settings: { ...light.settings, lightEffect: 'none', lightColorMode: 'temperature', colorTempK: 4000 } };
  }
  return next;
}

/** Apply local cross-device rules at every reducer, scene, host overlay and bridge transaction. */
export function synchronizeSafetySimulation(states: DeviceStates, previousStates?: DeviceStates): DeviceStates {
  const fire = synchronizeFireSafety(synchronizeGasSafety(states, previousStates), previousStates);
  const incident = getFireIncident(fire);
  const next = synchronizeGateSafety(fire, previousStates ?? fire, incident.active);
  return incident.active ? illuminateIncident(next) : next;
}

/** Advance one active preview step; callers must never supply elapsed background time. */
export function advanceSafetySimulation(states: DeviceStates, seconds: number): DeviceStates {
  const gate = states[GATE_DEVICE_ID];
  if (!gate || !Number.isFinite(seconds) || seconds <= 0) return states;
  const next = advanceGateSafety(gate, Math.min(1, seconds), getFireIncident(states).active);
  return next === gate ? states : synchronizeSafetySimulation({ ...states, [GATE_DEVICE_ID]: next }, states);
}

/** Pause interrupted movement without clearing incidents, sensor inputs or manual holds. */
export function pauseSafetySimulation(states: DeviceStates): DeviceStates {
  const gate = states[GATE_DEVICE_ID];
  if (!gate || gate.settings?.gatePhase !== 'countdown' && gate.settings?.gatePhase !== 'closing') return states;
  return { ...states, [GATE_DEVICE_ID]: normalizeRestoredGateState(gate) };
}

/** Rehydrate alarms but require a fresh explicit gate action after interrupted motion. */
export function restoreSafetySimulation(states: DeviceStates): DeviceStates {
  return pauseSafetySimulation(synchronizeSafetySimulation(states));
}
