import { useEffect, useRef, type RefObject } from 'react';
import { useHomeStore } from '../../store/useHomeStore';
import { SCENE_CATALOG_CHANNEL, type SceneCatalogMessage } from '../../../packages/home-scene/src/sceneCatalogProtocol';
import { SIMULATION_CHANNEL, type SimulationSnapshotMessage } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { modelSimulationIdentity } from './modelSceneAccess';
import type { SimulationSaveStatus } from './simulationPersistence';
import { SimulationSession } from './simulationSession';

/** Refresh the permission bridge independently of the retained, packaged renderer document. */
export function useSceneSimulationSession(
  deliver: (message: SimulationSnapshotMessage) => void,
  deliverCatalog: (message: SceneCatalogMessage) => void,
  onSaveStatus: (status: SimulationSaveStatus) => void,
): RefObject<SimulationSession | null> {
  const identity = useHomeStore(modelSimulationIdentity);
  const membershipReady = useHomeStore((state) => !(state.accountUserId || state.authenticatedUserId) || state.membershipReady);
  const sessionRef = useRef<SimulationSession | null>(null);
  useEffect(() => {
    if (!membershipReady) return;
    const session = new SimulationSession(deliver, onSaveStatus, { onSceneCatalog: deliverCatalog });
    sessionRef.current = session;
    // A warm document already completed its initial handshake. Reconnect it with
    // freshly scoped state; a cold document still sends its own load-time request.
    session.handleMessage({ channel: SIMULATION_CHANNEL, version: 1, type: 'request' });
    session.handleMessage({ channel: SCENE_CATALOG_CHANNEL, version: 1, type: 'request' });
    return () => { session.dispose(); sessionRef.current = null; };
  }, [identity, membershipReady, deliver, deliverCatalog, onSaveStatus]);
  return sessionRef;
}
