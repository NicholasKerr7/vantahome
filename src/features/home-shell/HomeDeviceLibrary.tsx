import React, { useState } from 'react';
import { DeviceControlsSheet } from '../three-d-home/DeviceControlsSheet';
import { useSimulationControls } from '../three-d-home/useSimulationControls';

/** Keep all modeled devices controllable even if graphics fail to initialize. */
export default function HomeDeviceLibrary({ onClose }: { onClose: () => void }) {
  const snapshot = useSimulationControls();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  return <DeviceControlsSheet deviceId={deviceId} client={snapshot.client} snapshot={snapshot}
    motionAllowed={false} onClose={onClose} onSelect={setDeviceId} />;
}
