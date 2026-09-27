import { linearLightColor, type LabLightSlot, type LabLightStates } from './lightStates';

type VectorTuple = [number, number, number];

/** Simulation fixtures shared by both renderers, in the upper-floor GLB's local coordinates. */
export interface BedroomLightRig {
  id: 'master-light' | 'master-bedside-left' | 'master-bedside-right';
  position: VectorTuple;
}

export const BEDROOM_LIGHT_RADIUS = 7;
// Three.js uses candela; native Filament calibrates its lumen values separately.
export const BEDROOM_LIGHT_INTENSITY = 18;
export const BEDROOM_LIGHT_COLOR = '#ffe2b8';
/** Linear sRGB equivalent of the shared warm color, safe to import without Three.js in native. */
export const BEDROOM_LIGHT_LINEAR_COLOR: VectorTuple = [1, 0.76052450467022, 0.4793201830913402];
export const BEDROOM_DIFFUSER_OFFSET = 0.12;

// Emit below each exported opal diffuser. The bedside positions are below the
// opaque linen shade, where their light can illuminate its underside and table.
// The asset contract test verifies these positions against the committed GLB.
export const BEDROOM_LIGHT_RIG: BedroomLightRig[] = [
  { id: 'master-light', position: [9.9665, 2.3922, -14.145] },
  { id: 'master-bedside-left', position: [8.655, 0.716, -15.9] },
  { id: 'master-bedside-right', position: [11.345, 0.716, -15.9] },
];

const BEDROOM_LIGHT_SLOTS: Record<BedroomLightRig['id'], LabLightSlot> = {
  'master-light': 'ceiling', 'master-bedside-left': 'left', 'master-bedside-right': 'right',
};

/** Resolve a single fixture while preserving the original grouped switch as a legacy fallback. */
export function bedroomLightAppearance(id: BedroomLightRig['id'], lights: boolean, states?: LabLightStates) {
  const state = states?.[BEDROOM_LIGHT_SLOTS[id]];
  return {
    gain: state ? (state.on ? state.brightness / 100 : 0) : lights ? 1 : 0,
    color: state?.colorHex ?? BEDROOM_LIGHT_COLOR,
    linearColor: state ? linearLightColor(state.colorHex) : BEDROOM_LIGHT_LINEAR_COLOR,
    customized: state !== undefined,
  };
}
