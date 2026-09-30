import React, { useCallback, useEffect, useRef } from 'react';
import { parseSceneStatus, type SceneSurfaceProps } from './protocol';
import { SimulationSession } from './simulationSession';
import { parseRoutineNavigation } from '../../../packages/home-scene/src/routineNavigation';
import { scenePresentationMessage } from '../../../packages/home-scene/src/scenePresentation';
import './scene-surface.css';

/** Keep an optional save-status callback stable when callers do not display it. */
const ignoreSaveStatus = () => undefined;

/** Run the self-contained scene in an opaque origin with no access to app storage or DOM. */
export default function SceneSurface({ onStatus, onSaveStatus = ignoreSaveStatus, onDeviceRoutines, suspended = false }: SceneSurfaceProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  /** Send again after document readiness so an early covering panel cannot lose its pause. */
  const publishPresentation = useCallback(() => {
    frame.current?.contentWindow?.postMessage(scenePresentationMessage(suspendedRef.current), '*');
  }, []);
  useEffect(publishPresentation, [publishPresentation, suspended]);
  useEffect(() => {
    const session = new SimulationSession((message) => {
      // The sandbox has an opaque origin, so source identity is checked on receipt instead.
      frame.current?.contentWindow?.postMessage(message, '*');
    }, onSaveStatus, { onSceneCatalog: (message) => frame.current?.contentWindow?.postMessage(message, '*') });
    /** Accept messages only from this exact frame, never a neighboring tab or window. */
    function handleMessage(event: MessageEvent<unknown>) {
      if (event.source !== frame.current?.contentWindow) return;
      const status = parseSceneStatus(event.data);
      const navigation = parseRoutineNavigation(event.data);
      if (status) { onStatus(status); publishPresentation(); }
      else if (navigation) onDeviceRoutines?.(navigation.deviceId);
      else session.handleMessage(event.data);
    }
    window.addEventListener('message', handleMessage);
    return () => { window.removeEventListener('message', handleMessage); session.dispose(); };
  }, [onStatus, onSaveStatus, onDeviceRoutines, publishPresentation]);
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
