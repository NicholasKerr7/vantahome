import { useEffect, useState, useSyncExternalStore } from 'react';
import { SimulationControlClient } from './simulationControlClient';

/** Give either native renderer the persisted simulation controls without a live command transport. */
export function useSimulationControls() {
  const [client, setClient] = useState(() => new SimulationControlClient());
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  useEffect(() => {
    client.connect();
    return () => client.dispose();
  }, [client]);
  return { ...snapshot, client, reconnect: () => setClient(new SimulationControlClient()) };
}
