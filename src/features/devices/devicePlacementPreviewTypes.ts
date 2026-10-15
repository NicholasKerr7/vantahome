import type { SimulationDevicePlacement } from '../../../packages/home-scene/src/devicePlacement';

export type DevicePlacementPreviewProps = {
  placement: SimulationDevicePlacement;
  onChange: (placement: SimulationDevicePlacement) => void;
  disabled?: boolean;
};
