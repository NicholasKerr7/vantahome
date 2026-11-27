import type { SceneAccess } from './sceneAccess';

export const ENERGY_SOURCE_IDS = ['utility-energy', 'utility-solar', 'utility-battery', 'utility-generator'] as const;

/** Whole-property estimates require full home visibility and every energy source grant. */
export function canViewEnergyFlow(access: SceneAccess | undefined): boolean {
  return Boolean(access?.fullHome && ENERGY_SOURCE_IDS.every((id) => access.deviceIds.includes(id)));
}

/** Starting a coordinated simulation never expands a single-device or room-only grant. */
export function canManageEnergyFlow(access: SceneAccess | undefined): boolean {
  return canViewEnergyFlow(access) && ENERGY_SOURCE_IDS.every((id) => access!.controllableDeviceIds.includes(id));
}
