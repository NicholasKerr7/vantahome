import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, Shield } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { GAS_LEAK_PREVIEW_NOTE, gasLeakStatus, gasLeakTestStatus, gasLeakTone, getGasLeakSnapshot } from './gasLeakController';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { GasLeakConsoleArtwork } from './GasLeakConsoleArtwork';
import './gas-leak-controller.css';

/** Separate preview alarm state, test results and saved preferences without concealing an active leak. */
export function GasLeakController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null), backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const detector = getGasLeakSnapshot(current);
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);
  /** Restore keyboard focus across deliberate More/Back navigation. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  /** Canonical commands recheck current permissions and any linked meter effects. */
  function run(action: string) { useHomeStore.getState().runDeviceAction(device.id, `gas-leak-${action}`); }
  if (more) return <section className="gas-leak-more" aria-label="Additional gas detector settings">
    <button ref={backButton} className="gas-leak-return" type="button" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to gas detector console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;
  return <section className="gas-leak-workspace" aria-label={`${device.name} gas detector console`} data-motion-disabled={reduced}>
    <div className="gas-leak-stage"><div className="gas-leak-console" data-tone={gasLeakTone(detector)}>
      <header className="gas-leak-top"><span className="gas-leak-mark" aria-hidden="true"><Shield size={25} /></span>
        <div className="gas-leak-brand"><span>VANTAHOME</span><strong>GAS SENTINEL</strong></div>
        <button ref={moreButton} type="button" className="gas-leak-round" aria-label="More gas detector settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <GasLeakConsoleArtwork detector={detector} />
      <div className="gas-leak-readout"><span>SAMPLE CONCENTRATION</span><output aria-label="Sample gas concentration">{detector.concentration ?? '—'}<small> % LEL</small></output><p className="gas-leak-status" role="status">{gasLeakStatus(detector)}</p></div>
      <div className="gas-leak-metrics"><div><span>Sample battery</span><output aria-label="Sample detector battery">{detector.batteryPercent ?? '—'}<small>%</small></output></div><div><span>Preview self-tests</span><output aria-label="Preview test count">{detector.testCount ?? '—'}</output><small>{gasLeakTestStatus(detector)}</small></div></div>
      <div className="gas-leak-actions">
        <button type="button" className="gas-leak-primary" disabled={!controllable || detector.testCount === null} onClick={() => run('self-test')}>Run preview self-test</button>
        <button type="button" disabled={!controllable || detector.leakDetected !== true || detector.alarmSilenced !== false} onClick={() => run('silence')}>Silence preview alarm</button>
      </div>
      <div className="gas-leak-actions" role="group" aria-label="Explicit gas leak scenario">
        <button type="button" disabled={!controllable || detector.leakDetected !== false} onClick={() => run('simulate-leak')}>Simulate gas leak</button>
        <button type="button" disabled={!controllable || detector.leakDetected !== true} onClick={() => run('clear-leak')}>Clear leak scenario</button>
      </div>
      <div className="gas-leak-alerts" role="group" aria-label="Saved detector preferences">
        {([['Leak alerts', 'gasLeakAlerts', detector.leakAlerts], ['Preview auto-shutoff', 'gasAutoShutoff', detector.autoShutoff]] as const).map(([label, field, enabled]) => <button key={field} type="button" role="switch" aria-checked={enabled === true} aria-label={`${label}${enabled === null ? ' unavailable' : ''}`} disabled={!controllable || enabled === null} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, field, !enabled)}><span>{label}</span><strong>{enabled === null ? '—' : enabled ? 'On' : 'Off'}</strong></button>)}
      </div><p className="gas-leak-note">Silencing or testing does not clear a leak preview.</p>
    </div></div><p className="gas-leak-feedback">{GAS_LEAK_PREVIEW_NOTE}</p>
  </section>;
}
