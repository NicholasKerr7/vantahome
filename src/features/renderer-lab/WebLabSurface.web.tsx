import React, { useEffect, useRef } from 'react';
import { parseLabEvent, type LabSurfaceProps } from './protocol';
import './renderer-lab.css';

/** Keep the browser comparison usable without importing native graphics modules. */
export default function WebLabSurface({ settings, onEvent }: LabSurfaceProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(settings);
  latest.current = settings;
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin) return;
      const parsed = parseLabEvent(typeof event.data === 'string' ? event.data : JSON.stringify(event.data));
      if (parsed?.type === 'ready') frame.current?.contentWindow?.postMessage({ type: 'lab-settings', settings: latest.current }, window.location.origin);
      if (parsed) onEvent(parsed);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onEvent]);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: 'lab-settings', settings }, window.location.origin);
  }, [settings]);
  return <iframe ref={frame} className="renderer-lab-frame" title="Three.js renderer comparison"
    src={`/renderer-lab/${settings.view}.html#${settings.view}`} onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'lab-settings', settings: latest.current }, window.location.origin)} />;
}
