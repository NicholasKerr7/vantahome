import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { SimulationControlClient } from './simulationControlClient';

/** Connect controls only while enabled, replacing disposed clients when the owning scope returns. */
export function useSimulationControls(enabled = true) {
  const [revision, setRevision] = useState(0);
  const client = useMemo(() => new SimulationControlClient(), [enabled, revision]);
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useEffect(() => {
    if (!enabled) return;
    client.connect();
    return () => client.dispose();
  }, [client, enabled]);
  const reconnect = useCallback(() => setRevision((value) => value + 1), []);
  return { ...snapshot, client, reconnect };
}
