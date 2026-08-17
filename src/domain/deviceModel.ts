import type { Device, DeviceKind } from "../store/useHomeStore";
import type { DeviceStatePatch } from "../services/transportSchemas";

export type DeviceIdentity = {
  id: string;
  integrationId?: string;
  integrationDeviceId?: string;
  entityIds?: string[];
};

export type DeviceConfiguration = {
  name: string;
  kind: DeviceKind;
  roomId: string;
};

export type DeviceCapabilities = {
  /** IDs from the Vanta design profile that the physical driver supports. */
  reportedIds?: string[];
};

export type DeviceLiveState = DeviceStatePatch & {
  observedAt?: number;
};

export type NormalizedDevice = {
  identity: DeviceIdentity;
  configuration: DeviceConfiguration;
  capabilities: DeviceCapabilities;
  state: DeviceLiveState;
};

/** Compatibility adapter while the UI continues to consume the flat model. */
export function normalizeLegacyDevice(device: Device): NormalizedDevice {
  const {
    id,
    name,
    kind,
    roomId,
    reportedCapabilityIds,
    ...state
  } = device;
  return {
    identity: { id },
    configuration: { name, kind, roomId },
    capabilities: { reportedIds: reportedCapabilityIds },
    state,
  };
}
