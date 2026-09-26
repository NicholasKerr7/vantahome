/** Serializable scene state shared with the host, independent of rendering and browser APIs. */
export type SettingValue = string | number | boolean;
export interface DeviceState { on: boolean; level: number; settings?: Record<string, SettingValue> }
export type DeviceStates = Record<string, DeviceState>;
