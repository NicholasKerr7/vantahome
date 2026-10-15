import { parseSimulationDevicePlacement, parseRuntimePlacedDevices, type RuntimePlacedDevice, type SimulationDevicePlacement } from '../devicePlacement';

export const PLACEMENT_CHANNEL = 'vantahome-placement';
export type PlacementMessage =
  | { channel: typeof PLACEMENT_CHANNEL; version: 1; type: 'ready' | 'rendered' | 'error' }
  | { channel: typeof PLACEMENT_CHANNEL; version: 1; type: 'change'; placement: SimulationDevicePlacement }
  | { channel: typeof PLACEMENT_CHANNEL; version: 1; type: 'configure'; placement: SimulationDevicePlacement; disabled: boolean; devices: RuntimePlacedDevice[] };

/** Keep the placement sandbox limited to bounded draft geometry, with no device commands or account data. */
export function parsePlacementMessage(input: unknown): PlacementMessage | null {
  try {
    const serialized = typeof input === 'string' ? input : JSON.stringify(input);
    if (!serialized || serialized.length > 24 * 1024) return null;
    const value = JSON.parse(serialized) as Record<string, unknown>;
    if (!value || value.channel !== PLACEMENT_CHANNEL || value.version !== 1) return null;
    const keys = Object.keys(value).sort().join(',');
    if (['ready', 'rendered', 'error'].includes(String(value.type)) && keys === 'channel,type,version') return value as PlacementMessage;
    const placement = parseSimulationDevicePlacement(value.placement);
    if (!placement) return null;
    if (value.type === 'change' && keys === 'channel,placement,type,version') return { channel: PLACEMENT_CHANNEL, version: 1, type: 'change', placement };
    if (value.type !== 'configure' || keys !== 'channel,devices,disabled,placement,type,version' || typeof value.disabled !== 'boolean') return null;
    const devices = parseRuntimePlacedDevices(value.devices);
    return devices ? { channel: PLACEMENT_CHANNEL, version: 1, type: 'configure', placement, disabled: value.disabled, devices } : null;
  } catch { return null; }
}

/** Encode only a validated data event into the locally packaged preview document. */
export function nativePlacementScript(message: PlacementMessage): string {
  const payload = JSON.stringify(message).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `window.dispatchEvent(new CustomEvent('${PLACEMENT_CHANNEL}',{detail:${payload}}));true;`;
}
