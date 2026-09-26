import React, { useEffect, useRef } from 'react';
import { parseSceneStatus, type SceneSurfaceProps } from './protocol';
import './scene-surface.css';

/** Run the self-contained scene in an opaque origin with no access to app storage or DOM. */
export default function SceneSurface({ onStatus }: SceneSurfaceProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    /** Accept readiness only from this exact frame, never a neighboring tab or window. */
    function handleMessage(event: MessageEvent<unknown>) {
      if (event.source !== frame.current?.contentWindow) return;
      const status = parseSceneStatus(event.data);
      if (status) onStatus(status);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onStatus]);
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
