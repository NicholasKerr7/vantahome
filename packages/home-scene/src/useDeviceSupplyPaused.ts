import { readEnergyControllerState } from './energyController';
import { coordinatedEnergyController } from './energyFlowPresentation';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { ENERGY_SOURCE_IDS, canViewEnergyFlow } from './energyAccess';
import { readEnergyFlow } from './energySimulation';
import { useHomeStore } from './state';

/** Read only a visible device's interruption; requested controls remain unchanged. */
export function useDeviceSupplyPaused(id: string): boolean {
  return useHomeStore((state) => {
    if (!state.access.deviceIds.includes(id) || (state.energyMode !== undefined && state.energyMode !== 'local')) return false;
    if (state.energy?.enabled && canViewEnergyFlow(state.access)) {
      return readEnergyFlow(state.energy, state.deviceStates, state.night).deferredDeviceIds.includes(id);
    }
    return state.powerPausedDeviceIds?.includes(id) === true;
  });
}

/** Keep energy summaries consistent with the console without replacing requested controls. */
export function useCoordinatedEnergyStatus(device: DeviceDefinition, current: DeviceState): string | null {
  return useHomeStore((state) => {
    if (!ENERGY_SOURCE_IDS.some((id) => id === device.id) || !state.energy?.enabled || !canViewEnergyFlow(state.access)) return null;
    const base = readEnergyControllerState(device, current);
    if (!base) return null;
    if (state.energyMode && state.energyMode !== 'local') return 'Power flow paused';
    const flow = readEnergyFlow(state.energy, state.deviceStates, state.night);
    const linked = coordinatedEnergyController(base, flow, state.energy);
    return linked.kind === 'battery' ? `${flow.batteryPercent.toFixed(1)}% · ${linked.status}` : `${linked.status} · Simulation`;
  });
}
