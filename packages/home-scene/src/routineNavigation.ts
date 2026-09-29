import { DEVICES } from './data';

const DEVICE_IDS = new Set(DEVICES.map((device) => device.id));
export type RoutineNavigationRequest = { channel: 'vantahome-navigation'; version: 1; type: 'device-routines'; deviceId: string };

/** Admit only a bounded navigation request for a known model device; this never authorizes commands. */
export function parseRoutineNavigation(input: unknown): RoutineNavigationRequest | null {
  let value = input;
  if (typeof value === 'string') {
    if (value.length > 256) return null;
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (Object.keys(message).sort().join(',') !== 'channel,deviceId,type,version') return null;
  if (message.channel !== 'vantahome-navigation' || message.version !== 1 || message.type !== 'device-routines'
    || typeof message.deviceId !== 'string' || !DEVICE_IDS.has(message.deviceId)) return null;
  return { channel: 'vantahome-navigation', version: 1, type: 'device-routines', deviceId: message.deviceId };
}
