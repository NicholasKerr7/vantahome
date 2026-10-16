import { getDevice } from './data';

export type DeviceEditingRequest = { channel: 'vantahome-navigation'; version: 1; type: 'device-edit'; deviceId: string };

/** Admit only a known placed fixture; this navigation intent contains no editable data or command. */
export function parseDeviceEditingRequest(input: unknown): DeviceEditingRequest | null {
  try {
    if (typeof input === 'string' && input.length > 256) return null;
    const value = typeof input === 'string' ? JSON.parse(input) : input;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'channel,deviceId,type,version'
      || value.channel !== 'vantahome-navigation' || value.version !== 1 || value.type !== 'device-edit'
      || typeof value.deviceId !== 'string' || !getDevice(value.deviceId)?.templateDeviceId) return null;
    return { channel: 'vantahome-navigation', version: 1, type: 'device-edit', deviceId: value.deviceId };
  } catch { return null; }
}
