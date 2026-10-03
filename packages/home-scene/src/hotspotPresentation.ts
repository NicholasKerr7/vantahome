import { isPositionDevice, type DeviceDefinition } from './data';
import { deviceStatus, isMonitor, readDeviceSetting } from './deviceCapabilities';
import { gasStatusTone } from './gasSimulation';
import type { DeviceState } from './simulationTypes';

export interface HotspotPresentation {
  active: boolean;
  monitoring: boolean;
  stateLabel: string;
  tone: 'normal' | 'warning' | 'alarm' | 'closed';
}

/** Keep power, opening position, monitoring and safety signals distinct from selection. */
export function hotspotPresentation(
  device: DeviceDefinition,
  state: DeviceState,
): HotspotPresentation {
  const monitoring = isMonitor(device.kind);
  let active = state.on;
  if (isPositionDevice(device)) active = state.level > 0;
  else if (device.kind === 'camera') active = readDeviceSetting(device, state, 'armed') === true;
  else if (monitoring) active = false;

  let tone = gasStatusTone(device.kind, state);
  if (device.kind === 'smoke') {
    // Silencing or acknowledging an incident does not clear its source readings.
    if (state.settings?.smokeDetected === true || state.settings?.coDetected === true) tone = 'alarm';
    else if (state.settings?.fireIncidentActive === true) tone = 'warning';
  }

  return { active, monitoring, stateLabel: deviceStatus(device, state), tone };
}
