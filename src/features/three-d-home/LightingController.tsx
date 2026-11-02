import React from 'react';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { lightingActionId, readLightingControllerState } from '../../../packages/home-scene/src/lightingController';
import { LightingConsole } from '../device-consoles/LightingConsole';
import type { LightingConsoleActions, LightingConsoleCapabilities } from '../device-consoles/lightingConsoleModel';
import type { SimulationDeviceControls } from './modelDeviceControls';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; onMore: () => void;
}
type LightingState = ReturnType<typeof readLightingControllerState>;
type LightingAction = Parameters<typeof lightingActionId>[0];

const SIMULATION_LIGHTING_CAPABILITIES: LightingConsoleCapabilities = {
  power: true,
  brightness: { min: 0, max: 100, step: 5 },
  temperature: { min: 2000, max: 6500 },
  color: true,
};

/** Describe remembered effects separately from effective output and avoid claiming that an off light is illuminated. */
function lightingFeedback(lighting: LightingState): string {
  if (lighting.effectLabel) return lighting.on
    ? `${lighting.effectLabel} effect · Preview ${Math.round(lighting.previewBrightness)}%`
    : `${lighting.effectLabel} effect remembered · Light off`;
  if (!lighting.on) return 'Off · Your settings are remembered';
  return lighting.brightness === 0 ? 'On · Brightness 0%' : 'Local light preview · Simulation';
}

/** Adapt guarded simulation state and commands to the shared capability-aware presentation. */
export function LightingController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const lighting = readLightingControllerState(device, state);

  /** Shared relative actions resolve rapid presses against current state and preserve the current power flag. */
  function run(action: LightingAction): void { if (!disabled) client.runAction(device.id, lightingActionId(action)); }

  /** Manual presets clear effects through the validated setting path without turning the light on. */
  function chooseSetting(field: 'color' | 'colorTempK', value: string | number): void {
    if (!disabled) client.setSetting(device.id, field, value);
  }

  const actions: LightingConsoleActions = {
    toggle: () => { if (!disabled) client.toggle(device.id); },
    adjustBrightness: (direction) => run(direction === -1 ? 'dimmer' : 'brighter'),
    setMode: (mode) => run(mode === 'temperature' ? 'white' : 'color'),
    setTemperature: (kelvin) => chooseSetting('colorTempK', kelvin),
    setColor: (hex) => chooseSetting('color', hex),
  };

  return <LightingConsole model={{ ...lighting, manual: lighting.effect === 'none', capabilities: SIMULATION_LIGHTING_CAPABILITIES,
    feedback: disabled ? 'View only · Controls unavailable' : lightingFeedback(lighting) }}
    actions={actions} disabled={disabled} compact={compact} fontScale={fontScale} onMore={onMore} />;
}
