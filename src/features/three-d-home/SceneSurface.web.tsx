import React, { useCallback, useEffect, useRef } from 'react';
import { parseSceneStatus, type SceneSurfaceProps } from './protocol';
import { useSceneSimulationSession } from './useSceneSimulationSession';
import { parseRoutineNavigation } from '../../../packages/home-scene/src/routineNavigation';
import { scenePresentationMessage } from '../../../packages/home-scene/src/scenePresentation';
import type { SimulationSnapshotMessage } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import type { SceneCatalogMessage } from '../../../packages/home-scene/src/sceneCatalogProtocol';
import './scene-surface.css';

/** Keep an optional save-status callback stable when callers do not display it. */
const ignoreSaveStatus = () => undefined;

/** Run the self-contained scene in an opaque origin with no access to app storage or DOM. */
export default function SceneSurface({ onStatus, onSaveStatus = ignoreSaveStatus, onDeviceRoutines, suspended = false }: SceneSurfaceProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  /** Stable deliveries reconnect permissions without navigating or replacing this iframe. */
  const deliverSnapshot = useCallback((message: SimulationSnapshotMessage) => {
    frame.current?.contentWindow?.postMessage(message, '*');
  }, []);
  const deliverCatalog = useCallback((message: SceneCatalogMessage) => {
    frame.current?.contentWindow?.postMessage(message, '*');
  }, []);
  const simulation = useSceneSimulationSession(deliverSnapshot, deliverCatalog, onSaveStatus);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  /** Send again after document readiness so an early covering panel cannot lose its pause. */
  const publishPresentation = useCallback(() => {
    frame.current?.contentWindow?.postMessage(scenePresentationMessage(suspendedRef.current), '*');
  }, []);
  useEffect(publishPresentation, [publishPresentation, suspended]);
  useEffect(() => {
    /** Accept messages only from this exact frame, never a neighboring tab or window. */
    function handleMessage(event: MessageEvent<unknown>) {
      if (event.source !== frame.current?.contentWindow) return;
      const status = parseSceneStatus(event.data);
      const navigation = parseRoutineNavigation(event.data);
      if (status) { onStatus(status); publishPresentation(); }
      else if (navigation) {
        if (!suspendedRef.current && simulation.current?.canNavigate()) onDeviceRoutines?.(navigation.deviceId);
      }
      else simulation.current?.handleMessage(event.data);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onStatus, onDeviceRoutines, publishPresentation, simulation]);
  return <iframe
    ref={frame}
    className="vantahome-scene-frame"
    title="3D Home simulation"
    src="/home-scene/embedded.html"
    sandbox="allow-scripts"
    referrerPolicy="no-referrer"
    onLoad={publishPresentation}
    onError={() => onStatus('error')}
  />;
}
