import type { DeviceState } from '../../../packages/home-scene/src/simulationBridgeProtocol';

/** Compare validated scalar settings without depending on JSON/JSONB object key ordering. */
export function equalSimulationDeviceState(left: DeviceState | undefined, right: DeviceState | undefined): boolean {
  if (left === right) return true;
  if (!left || !right || left.on !== right.on || left.level !== right.level) return false;
  const leftSettings = left.settings ?? {};
  const rightSettings = right.settings ?? {};
  const keys = Object.keys(leftSettings);
  return keys.length === Object.keys(rightSettings).length
    && keys.every((key) => Object.hasOwn(rightSettings, key) && leftSettings[key] === rightSettings[key]);
}
