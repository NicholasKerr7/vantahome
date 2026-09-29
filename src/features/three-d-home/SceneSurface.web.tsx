import React, { useEffect, useRef } from 'react';
import { parseSceneStatus, type SceneSurfaceProps } from './protocol';
import { SimulationSession } from './simulationSession';
import { parseRoutineNavigation } from '../../../packages/home-scene/src/routineNavigation';
import './scene-surface.css';

/** Keep an optional save-status callback stable when callers do not display it. */
const ignoreSaveStatus = () => undefined;

/** Run the self-contained scene in an opaque origin with no access to app storage or DOM. */
export default function SceneSurface({ onStatus, onSaveStatus = ignoreSaveStatus, onDeviceRoutines }: SceneSurfaceProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const session = new SimulationSession((message) => {
      // The sandbox has an opaque origin, so source identity is checked on receipt instead.
      frame.current?.contentWindow?.postMessage(message, '*');
    }, onSaveStatus);
    /** Accept messages only from this exact frame, never a neighboring tab or window. */
    function handleMessage(event: MessageEvent<unknown>) {
      if (event.source !== frame.current?.contentWindow) return;
      const status = parseSceneStatus(event.data);
      const navigation = parseRoutineNavigation(event.data);
      if (status) onStatus(status);
      else if (navigation) onDeviceRoutines?.(navigation.deviceId);
      else session.handleMessage(event.data);
    }
    window.addEventListener('message', handleMessage);
    return () => { window.removeEventListener('message', handleMessage); session.dispose(); };
  }, [onStatus, onSaveStatus, onDeviceRoutines]);
  return <iframe
    ref={frame}
    className="vantahome-scene-frame"
    title="3D Home simulation"
    src="/home-scene/embedded.html"
    sandbox="allow-scripts"
    referrerPolicy="no-referrer"
    onError={() => onStatus('error')}
  />;
}
