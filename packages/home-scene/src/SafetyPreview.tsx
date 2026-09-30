import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { getFireIncident, type FireIncident } from './fireSafetySimulation';
import { GATE_DEVICE_ID, gateSafetySummary } from './gateSafetySimulation';
import { useHomeStore } from './state';
import './safety-preview.css';

/** Keep a single standalone clock; embedded views receive foreground ticks from the host. */
export function useSafetyPreviewClock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    /** Pause actual simulated motion on hide, with no elapsed-time catch-up on return. */
    const visibilityChanged = () => {
      if (interval) clearInterval(interval);
      interval = undefined;
      if (document.hidden) useHomeStore.getState().pauseSafety();
      else interval = setInterval(() => useHomeStore.getState().advanceSafety(1), 1000);
    };
    visibilityChanged();
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [enabled]);
}

/** Display one latched incident above other dialogs; acknowledgment is never an alarm reset. */
function EmergencyDialog({ incident, onAcknowledge }: { incident: FireIncident; onAcknowledge: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const deviceStates = useHomeStore((state) => state.deviceStates);
  const clearSources = useHomeStore((state) => state.clearFireSources);
  const reset = useHomeStore((state) => state.resetFire);
  useLayoutEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    title.current?.focus({ preventScroll: true });
    return () => {
      element?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="safety-preview-dialog" aria-labelledby="safety-preview-title" aria-describedby="safety-preview-description" onCancel={(event) => { event.preventDefault(); onAcknowledge(); }}>
    <div className="safety-preview-content">
      <span className="safety-preview-kicker"><ShieldAlert size={20} aria-hidden="true" />Emergency simulation</span>
      <h2 id="safety-preview-title" ref={title} tabIndex={-1}>{incident.activeSources.length ? 'An alarm needs attention' : 'Sources clear. Reset when ready.'}</h2>
      <p id="safety-preview-description">Local preview only. No physical alarms or emergency services are activated.</p>
      <div className="safety-preview-sources" aria-label="Simulated alarm sources">
        {incident.sources.map((source) => <p key={source.id}><strong>{source.roomName}</strong><span>{source.smokeDetected && source.coDetected ? 'Smoke + CO simulation' : source.coDetected ? 'CO simulation' : source.smokeDetected ? 'Smoke simulation' : 'Cleared · reset pending'}</span></p>)}
      </div>
      <p className="safety-preview-support">Preview room and approach lights stay on.<br />Gate: {gateSafetySummary(deviceStates[GATE_DEVICE_ID])}.</p>
      <p className="safety-preview-note">Acknowledging keeps this incident visible. Clear the simulated sources before resetting. The gate hold remains until you release it in full controls.</p>
      <div className="safety-preview-actions">
        <button type="button" className="safety-preview-primary" onClick={onAcknowledge}>{incident.acknowledged ? 'Keep monitoring' : 'Acknowledge simulation'}</button>
        <button type="button" disabled={!incident.activeSources.length} onClick={clearSources}>Clear simulated sources</button>
        <button type="button" disabled={!incident.canReset} onClick={reset}>Reset incident</button>
      </div>
    </div>
  </dialog>;
}

/** Keep acknowledged incidents reachable from every standalone room or device view. */
export function SafetyPreview() {
  const states = useHomeStore((state) => state.deviceStates);
  const acknowledge = useHomeStore((state) => state.acknowledgeFire);
  const incident = getFireIncident(states);
  const [review, setReview] = useState(false);
  // Mount a new review state for each completed incident rather than leaking an old expansion.
  useEffect(() => { if (!incident.active) setReview(false); }, [incident.active]);
  if (!incident.active) return null;
  /** Condense the incident only after persisting its acknowledgment. */
  const acknowledgeAndCondense = () => { acknowledge(); setReview(false); };
  if (!incident.acknowledged || review) return <EmergencyDialog incident={incident} onAcknowledge={acknowledgeAndCondense} />;
  return <button type="button" className="safety-preview-banner" onClick={() => setReview(true)} aria-label="Review emergency simulation">
    <ShieldAlert size={21} aria-hidden="true" /><span><strong>Emergency simulation</strong><span>{incident.canReset ? 'Sources clear · reset pending' : 'Acknowledged · alarm still active'}</span></span><span>Review</span>
  </button>;
}
