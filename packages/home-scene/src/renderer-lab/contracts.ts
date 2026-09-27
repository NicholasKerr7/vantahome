import { isWeatherSettings, type WeatherSettings } from './weather';
import { parseLabLightStates, type LabLightStates } from './lightStates';

/** Deliberately small, simulation-only controls shared with the native renderer lab. */
export interface LabState extends WeatherSettings {
  view: 'bedroom' | 'property';
  night: boolean;
  lights: boolean;
  lightStates?: LabLightStates;
  blinds: number;
  gate: number;
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
  gate: 0, weather: 'clear', windSpeed: 0, windDirection: 0, motion: true, resetKey: 0,
};

/** Reject malformed host payloads before they can reach the camera or transforms. */
export function parseLabState(value: unknown): LabState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.view !== 'bedroom' && input.view !== 'property') return null;
  if (!isWeatherSettings(input)) return null;
  for (const key of ['night', 'lights', 'motion']) {
    if (typeof input[key] !== 'boolean') return null;
  }
  for (const key of ['blinds', 'gate']) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key]) || input[key] < 0 || input[key] > 100) return null;
  }
  if (typeof input.resetKey !== 'number' || !Number.isSafeInteger(input.resetKey) || input.resetKey < 0) return null;
  const lightStates = input.lightStates === undefined ? undefined : parseLabLightStates(input.lightStates);
  if (lightStates === null) return null;
  return {
    view: input.view, night: input.night as boolean, lights: input.lights as boolean,
    blinds: input.blinds as number, gate: input.gate as number,
    weather: input.weather, windSpeed: input.windSpeed, windDirection: input.windDirection,
    motion: input.motion as boolean, resetKey: input.resetKey,
    ...(lightStates === undefined ? {} : { lightStates }),
  };
}

/** Return only the tiny typed lab protocol; no actual home commands are exposed. */
export function postLabMessage(message: LabMessage): void {
  const payload = JSON.stringify(message);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
  else if (window.parent !== window) window.parent.postMessage(payload, window.location.origin);
}
