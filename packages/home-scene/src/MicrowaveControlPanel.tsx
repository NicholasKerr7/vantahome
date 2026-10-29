import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, Minus, Plus, Play, Square, Microwave } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { MICROWAVE_MODES, MICROWAVE_POWER_BOUNDS, MICROWAVE_PREVIEW_NOTE, MICROWAVE_QUICK_TIMES, readMicrowaveControllerState } from './microwaveController';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { MicrowaveConsoleArtwork } from './MicrowaveConsoleArtwork';
import './microwave-controller.css';

/** Keep stored cooking preferences separate from deliberate preview starts and clearing. */
export function MicrowaveController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null), backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const microwave = readMicrowaveControllerState(device, current);
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);
  /** Restore focus after intentional advanced-panel navigation, without stealing initial focus. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  /** Delegate commands to the canonical store so stale permissions and rapid taps are checked centrally. */
  function run(action: string) { useHomeStore.getState().runDeviceAction(device.id, action); }
  if (!microwave) return null;
  if (more) return <section className="microwave-more" aria-label="Additional microwave settings">
    <button ref={backButton} className="microwave-return" type="button" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to microwave console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;
  return <section className="microwave-workspace" aria-label={`${device.name} microwave console`} data-motion-disabled={reduced}>
    <div className="microwave-stage"><div className="microwave-console" data-running={microwave.on}>
      <header className="microwave-top">
        <span className="microwave-mark" aria-hidden="true"><Microwave size={25} /></span>
        <div className="microwave-brand"><span>VANTAHOME</span><strong>MICROWAVE</strong></div>
        <button ref={moreButton} type="button" className="microwave-round" aria-label="More microwave settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <MicrowaveConsoleArtwork on={microwave.on} />
      <div className="microwave-readout"><div><span>SET DURATION</span><output aria-label="Saved microwave duration">{microwave.duration}</output></div><p aria-live="polite">{microwave.status}<small>No countdown in this preview</small></p></div>
      <div className="microwave-section"><span>MODE PREFERENCE</span><div className="microwave-modes" role="group" aria-label="Microwave mode preference">
        {MICROWAVE_MODES.map((mode) => <button key={mode} type="button" aria-pressed={microwave.mode === mode} disabled={!controllable} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'microwaveMode', mode)}>{mode}</button>)}
      </div></div>
      <div className="microwave-power"><span>POWER LEVEL<small>Saved preference</small></span><div className="microwave-stepper" role="group" aria-label="Microwave power preference">
        <button type="button" aria-label="Decrease microwave power" disabled={!controllable || microwave.power === null || microwave.power <= MICROWAVE_POWER_BOUNDS.min} onClick={() => run('microwave-power-down')}><Minus size={20} aria-hidden="true" /></button>
        <output aria-label="Saved microwave power">{microwave.power ?? '—'}<small>/10</small></output>
        <button type="button" aria-label="Increase microwave power" disabled={!controllable || microwave.power === null || microwave.power >= MICROWAVE_POWER_BOUNDS.max} onClick={() => run('microwave-power-up')}><Plus size={20} aria-hidden="true" /></button>
      </div></div>
      <div className="microwave-section"><span>{microwave.on ? 'ADD PREVIEW TIME' : 'ADD TIME & START PREVIEW'}</span><div className="microwave-quick">
        {MICROWAVE_QUICK_TIMES.map((seconds) => <button key={seconds} type="button" aria-label={`Add ${seconds} seconds and start microwave preview`} disabled={!controllable || microwave.seconds === null || microwave.seconds >= 900} onClick={() => run(`microwave-add-${seconds}`)}>+{seconds < 60 ? `${seconds}s` : `${seconds / 60} min`}</button>)}
      </div></div>
      <div className="microwave-actions">
        <button type="button" className="microwave-primary" disabled={!controllable} onClick={() => run('microwave-start')}><Play size={16} aria-hidden="true" />Start 1 min</button>
        <button type="button" disabled={!controllable} onClick={() => run('microwave-stop')}><Square size={16} aria-hidden="true" />Stop & clear</button>
      </div>
    </div></div><p className="microwave-feedback">{MICROWAVE_PREVIEW_NOTE}</p>
  </section>;
}
