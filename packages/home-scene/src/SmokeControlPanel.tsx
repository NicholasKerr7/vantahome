import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, ShieldCheck } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { canRunSmokeScenarios, readSmokeControllerState, smokeSampleLabel, SMOKE_PREVIEW_NOTE } from './smokeController';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { SmokeConsoleArtwork } from './SmokeConsoleArtwork';
import './smoke-controller.css';

/** Keep sample checks and selected-sensor commands separate from whole-incident clearance. */
export function SmokeController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null), backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const scenariosAllowed = useHomeStore((state) => canRunSmokeScenarios(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const detector = readSmokeControllerState(device, current);
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);

  /** Restore keyboard focus across deliberate More/Back navigation. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  /** The canonical reducer retains alarms, cross-device behavior and current access checks. */
  function run(action: string) {
    const store = useHomeStore.getState();
    if ((action === 'test-alarm' || action === 'simulate-co') && !canRunSmokeScenarios(store.access, device.id)) return;
    store.runDeviceAction(device.id, `smoke-${action}`);
  }

  if (!detector) return null;
  if (more) return <section className="smoke-more" aria-label="Additional smoke detector settings">
    <button ref={backButton} className="smoke-return" type="button" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to smoke detector console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;
  const active = detector.incidentActive === true || detector.smokeDetected === true || detector.coDetected === true;
  return <section className="smoke-workspace" aria-label={`${device.name} smoke detector console`} data-motion-disabled={reduced}>
    <div className="smoke-stage"><div className="smoke-console" data-tone={detector.tone}>
      <header className="smoke-top"><span className="smoke-mark" aria-hidden="true"><ShieldCheck size={25} /></span>
        <div className="smoke-brand"><span>VANTAHOME</span><strong>SMOKE + CO</strong></div>
        <button ref={moreButton} type="button" className="smoke-round" aria-label="More smoke detector settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <SmokeConsoleArtwork tone={detector.tone} />
      <div className="smoke-readout"><span>SENSOR PREVIEW</span><p className="smoke-status" role="status">{detector.status}</p>
        <small>{active ? `${detector.silenced === null ? 'Silence state unavailable' : detector.silenced ? 'Preview silenced' : 'Preview not silenced'} · ${detector.acknowledged === null ? 'Acknowledgment unavailable' : detector.acknowledged ? 'Acknowledged' : 'Not acknowledged'}`
          : detector.sampleChecked === null ? 'Sample check unavailable' : detector.sampleChecked ? 'Sample checked · no physical test' : 'Sample check not run'}</small>
      </div>
      <div className="smoke-samples">
        <div><span>SMOKE SAMPLE</span><output aria-label="Smoke sample">{smokeSampleLabel(detector.smokeDetected)}</output></div>
        <div><span>CO SAMPLE</span><output aria-label="CO sample">{smokeSampleLabel(detector.coDetected)}</output></div>
      </div>
      <div className="smoke-meta"><span>Sample battery <strong>{detector.batteryPercent ?? '—'}%</strong></span><span>Condition <strong>{detector.sensorStatus ?? 'Unavailable'}</strong></span></div>
      <div className="smoke-actions">
        <button type="button" className="smoke-primary" disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}>Check sample</button>
        <button type="button" disabled={!controllable || !active || detector.silenced !== false} onClick={() => run('silence')}>Silence preview</button>
      </div>
      <div className="smoke-actions" role="group" aria-label="Explicit alarm scenarios">
        <button type="button" disabled={!controllable || !scenariosAllowed || detector.smokeDetected !== false} onClick={() => run('test-alarm')}>Simulate smoke</button>
        <button type="button" disabled={!controllable || !scenariosAllowed || detector.coDetected !== false} onClick={() => run('simulate-co')}>Simulate CO</button>
      </div>
      <div className="smoke-actions">
        <button type="button" disabled={!controllable || !active || detector.acknowledged !== false} onClick={() => run('acknowledge')}>Acknowledge sensor</button>
        <button type="button" disabled={!controllable || (detector.smokeDetected !== true && detector.coDetected !== true)} onClick={() => run('clear-alarm')}>Clear this sensor</button>
      </div>
      <p className="smoke-note">{scenariosAllowed ? 'Scenarios affect preview lights and gate. Clear sources, then reset under More.' : 'Alarm scenarios require access to the affected lights and gate. Incident controls remain under More.'}</p>
    </div></div><p className="smoke-feedback">{SMOKE_PREVIEW_NOTE}</p>
  </section>;
}
