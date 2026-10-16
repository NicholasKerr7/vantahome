import type { SimulationDevicePlacement } from '../../../packages/home-scene/src/devicePlacement';

export type DevicePlacementPreviewProps = {
  placement: SimulationDevicePlacement;
  onChange: (placement: SimulationDevicePlacement) => void;
  disabled?: boolean;
  /** Hide the saved fixture while previewing its replacement pose, without changing the live catalog. */
  excludeModelDeviceId?: string;
};
