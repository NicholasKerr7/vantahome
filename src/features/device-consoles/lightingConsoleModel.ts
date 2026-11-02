/** Presentation capabilities come from an adapter, never from the device kind alone. */
export interface LightingConsoleCapabilities {
  power: boolean;
  brightness: { min: number; max: number; step: number } | null;
  temperature: { min: number; max: number } | null;
  color: boolean;
}

/** A console can display unknown readings without substituting simulation defaults. */
export interface LightingConsoleModel {
  on: boolean | null;
  brightness: number | null;
  colorMode: 'color' | 'temperature' | null;
  color: string | null;
  temperatureK: number | null;
  manual: boolean;
  previewColor: string;
  /** Accepted artwork output in percent (0–100); use zero for unavailable observations. */
  previewBrightness: number;
  status: string;
  feedback: string;
  capabilities: LightingConsoleCapabilities;
}

/** UI intent stays independent of registry identity, persistence and command transport. */
export interface LightingConsoleActions {
  toggle: () => void;
  adjustBrightness: (direction: -1 | 1) => void;
  setMode: (mode: 'color' | 'temperature') => void;
  setTemperature: (kelvin: number) => void;
  setColor: (hex: string) => void;
}
