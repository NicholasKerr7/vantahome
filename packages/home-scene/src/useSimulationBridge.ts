import { useEffect, useState } from 'react';
import { isEmbeddedScene } from './embeddedHost';
import { createSimulationBridgeClient } from './simulationBridgeClient';
import { connectSimulationBridgeTransport } from './simulationBridgeTransport';
import { useHomeStore } from './state';

/** Connect embedded simulation state to its host while preserving standalone browser persistence. */
export function useSimulationBridge(): { hydrated: boolean; syncError: boolean } {
  const embedded = isEmbeddedScene();
  const [status, setStatus] = useState({ hydrated: !embedded, syncError: false });
  useEffect(() => {
    if (!embedded) return;
    let client: ReturnType<typeof createSimulationBridgeClient> | undefined;
    const transport = connectSimulationBridgeTransport(window, (message) => client?.receive(message));
    client = createSimulationBridgeClient({
      store: {
        applySnapshot: (state) => useHomeStore.setState({ ...state, activePreset: null }),
        subscribe: useHomeStore.subscribe,
      },
      send: transport.send,
      onHydrated: () => setStatus({ hydrated: true, syncError: false }),
      onSyncError: () => setStatus((previous) => ({ ...previous, syncError: true })),
    });
    return () => {
      transport.dispose();
      client?.dispose();
    };
  }, [embedded]);
  return status;
}
