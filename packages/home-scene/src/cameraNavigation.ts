import { getDevice } from './data';

export type CameraWatchRequest = { channel: 'vantahome-navigation'; version: 1; type: 'camera-watch'; deviceId: string };

/** A camera Watch envelope contains only an authored identity and never stream URLs or commands. */
export function parseCameraWatchRequest(input: unknown): CameraWatchRequest | null {
  try {
    if (typeof input === 'string' && input.length > 256) return null;
    const value = typeof input === 'string' ? JSON.parse(input) : input;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'channel,deviceId,type,version'
      || value.channel !== 'vantahome-navigation' || value.version !== 1 || value.type !== 'camera-watch'
      || typeof value.deviceId !== 'string' || getDevice(value.deviceId)?.kind !== 'camera') return null;
    return { channel: 'vantahome-navigation', version: 1, type: 'camera-watch', deviceId: value.deviceId };
  } catch { return null; }
}
