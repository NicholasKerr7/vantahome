import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getRuntimePlacements } from '../../../packages/home-scene/src/devicePlacement';
import { parsePlacementMessage, PLACEMENT_CHANNEL } from '../../../packages/home-scene/src/placement/placementProtocol';
import type { DevicePlacementPreviewProps } from './devicePlacementPreviewTypes';
import { usePlacementPreviewReadiness } from './usePlacementPreviewReadiness';
import './device-placement-preview.css';

/** Host the same packaged editor in an opaque iframe without granting cookies, storage, or commands. */
export default function DevicePlacementPreview({ placement, onChange, disabled = false }: DevicePlacementPreviewProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = usePlacementPreviewReadiness(attempt, placement.modelRoomId);
  const current = useRef({ placement, onChange, disabled });
  current.current = { placement, onChange, disabled };
  const publish = useCallback(() => {
    const draft = current.current;
    frame.current?.contentWindow?.postMessage({ channel: PLACEMENT_CHANNEL, version: 1, type: 'configure', placement: draft.placement, disabled: draft.disabled, devices: getRuntimePlacements() }, '*');
  }, []);
  useEffect(publish, [publish, placement, disabled]);
  useEffect(() => {
    /** A neighboring frame cannot supply draft geometry or a false readiness signal. */
    function receive(event: MessageEvent<unknown>) {
      if (event.source !== frame.current?.contentWindow) return;
      const message = parsePlacementMessage(event.data);
      if (message?.type === 'ready') publish();
      else if (message?.type === 'rendered') setStatus('ready');
      else if (message?.type === 'error') setStatus('error');
      else if (message?.type === 'change' && !current.current.disabled
        && message.placement.templateId === current.current.placement.templateId
        && message.placement.modelRoomId === current.current.placement.modelRoomId) current.current.onChange(message.placement);
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [publish]);
  return <div className="device-placement-preview">
    <iframe key={attempt} ref={frame} title="Device placement preview" src="/home-scene/embedded.html#placement" sandbox="allow-scripts" referrerPolicy="no-referrer" onLoad={publish} onError={() => setStatus('error')} />
    {status !== 'ready' && <div className="device-placement-preview-error" role={status === 'error' ? 'alert' : 'status'}>
      {status === 'loading' ? 'Preparing your room…' : <>The placement preview could not load.<button type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button></>}
    </div>}
  </div>;
}
