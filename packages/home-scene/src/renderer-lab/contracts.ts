/** Deliberately small, simulation-only controls shared with the native renderer lab. */
export interface LabState {
  view: 'bedroom' | 'property';
  night: boolean;
  lights: boolean;
  blinds: number;
  gate: number;
  rain: boolean;
  motion: boolean;
  resetKey: number;
}

export type LabDevice = 'lights' | 'blinds' | 'gate';
export type ModelName = 'upper' | 'exterior' | 'landscape' | 'gate' | 'fixtures' | 'solar' | 'rain';
export type LabMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'select'; device: LabDevice }
  | { type: 'metrics'; frames: number; p50: number; p95: number; slowFrames: number };

declare global {
  interface Window {
    __VANTA_LAB_MODELS__?: Partial<Record<ModelName, string>>;
    __VANTA_LAB_INITIAL_VIEW__?: 'bedroom' | 'property';
    __VANTA_LAB_UPDATE__?: (value: unknown) => void;
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

export const INITIAL_STATE: LabState = {
  view: 'bedroom', night: false, lights: true, blinds: 0,
  gate: 0, rain: false, motion: true, resetKey: 0,
};

/** Reject malformed host payloads before they can reach the camera or transforms. */
export function parseLabState(value: unknown): LabState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.view !== 'bedroom' && input.view !== 'property') return null;
  for (const key of ['night', 'lights', 'rain', 'motion']) {
    if (typeof input[key] !== 'boolean') return null;
  }
  for (const key of ['blinds', 'gate']) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < 0 || input[key] > 100) return null;
  }
  if (typeof input.resetKey !== 'number' || !Number.isSafeInteger(input.resetKey) || input.resetKey < 0) return null;
  return {
    view: input.view, night: input.night as boolean, lights: input.lights as boolean,
    blinds: input.blinds as number, gate: input.gate as number,
    rain: input.rain as boolean, motion: input.motion as boolean, resetKey: input.resetKey,
  };
}

/** Return only the tiny typed lab protocol; no actual home commands are exposed. */
export function postLabMessage(message: LabMessage): void {
  const payload = JSON.stringify(message);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
  else if (window.parent !== window) window.parent.postMessage(payload, window.location.origin);
}
