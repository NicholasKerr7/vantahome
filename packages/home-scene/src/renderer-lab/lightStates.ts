/** Small renderer snapshot: catalog actions and hardware commands never enter this contract. */
export interface LabLightState {
  on: boolean;
  brightness: number;
  colorTemperature: number;
  colorHex: string;
}

export type LabLightSlot = 'ceiling' | 'left' | 'right';
export type LabLightStates = Partial<Record<LabLightSlot, LabLightState>>;
const LIGHT_SLOTS: LabLightSlot[] = ['ceiling', 'left', 'right'];

/** Bound the optional fixture payload and copy only the fields consumed by a renderer. */
export function parseLabLightStates(value: unknown): LabLightStates | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !LIGHT_SLOTS.includes(key as LabLightSlot))) return null;
  const result: LabLightStates = {};
  for (const slot of LIGHT_SLOTS) {
    const candidate = input[slot];
    if (candidate === undefined) continue;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const light = candidate as Record<string, unknown>;
    if (typeof light.on !== 'boolean'
      || typeof light.brightness !== 'number' || !Number.isFinite(light.brightness) || light.brightness < 0 || light.brightness > 100
      || typeof light.colorTemperature !== 'number' || !Number.isFinite(light.colorTemperature) || light.colorTemperature < 2000 || light.colorTemperature > 6500
      || typeof light.colorHex !== 'string' || !/^#[0-9a-f]{6}$/i.test(light.colorHex)) return null;
    result[slot] = { on: light.on, brightness: light.brightness, colorTemperature: light.colorTemperature, colorHex: light.colorHex };
  }
  return result;
}

/** Convert display sRGB to linear channels for Filament's explicit RGB light/material APIs. */
export function linearLightColor(hex: string): [number, number, number] {
  const color = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#ffe2b8';
  return [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}
