import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, Minus, Plus, Power, LockKeyhole } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { COOKTOP_MODES, COOKTOP_PREVIEW_NOTE, readCooktopControllerState } from './cooktopController';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { CooktopConsoleArtwork } from './CooktopConsoleArtwork';
import './cooktop-controller.css';

/** Keep the induction preview's shared preferences separate from deliberate power changes. */
export function CooktopController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const cooktop = readCooktopControllerState(device, current);

  useLayoutEffect(() => {
    if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true });
  }, [more]);

  /** Return keyboard focus to the initiating control after intentional More/Back navigation. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  /** Resolve rapid steps against the latest canonical state and current grant. */
  function run(action: string) { useHomeStore.getState().runDeviceAction(device.id, action); }

  if (!cooktop) return null;
  if (more) return <section className="cooktop-more" aria-label="Additional cooktop settings">
    <button ref={backButton} className="cooktop-return" type="button" onClick={() => changePanel(false)}>
      <ArrowLeft size={18} aria-hidden="true" />Back to cooktop console
    </button>
    <PagedDeviceControls device={device} current={current} />
  </section>;

  return <section className="cooktop-workspace" aria-label={`${device.name} cooktop console`} data-motion-disabled={reduced}>
    <div className="cooktop-stage"><div className="cooktop-console" data-powered={cooktop.on}>
      <header className="cooktop-top">
        <button type="button" className="cooktop-round" aria-label={`Turn cooktop preview ${cooktop.on ? 'off' : 'on'}`} aria-pressed={cooktop.on}
          disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}><Power size={22} aria-hidden="true" /></button>
        <div className="cooktop-brand"><span>VANTAHOME</span><strong>INDUCTION</strong></div>
        <button ref={moreButton} type="button" className="cooktop-round" aria-label="More cooktop settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <CooktopConsoleArtwork on={cooktop.on} heat={cooktop.heat} />
      <div className="cooktop-heat">
        <span>SHARED HEAT PREFERENCE</span>
        <div className="cooktop-heat-stepper" role="group" aria-label="Shared cooktop heat">
          <button type="button" aria-label="Decrease cooktop heat" disabled={!controllable || cooktop.heat === null || cooktop.heat <= 0} onClick={() => run('stove-heat-down')}><Minus size={22} aria-hidden="true" /></button>
          <output aria-label="Saved cooktop heat">{cooktop.heat ?? '—'}<small>/10</small></output>
          <button type="button" aria-label="Increase cooktop heat" disabled={!controllable || cooktop.heat === null || cooktop.heat >= 10} onClick={() => run('stove-heat-up')}><Plus size={22} aria-hidden="true" /></button>
        </div>
        <p className="cooktop-status" role="status">{cooktop.status}</p>
      </div>
      <div className="cooktop-modes" role="group" aria-label="Cooktop mode preference">
        {COOKTOP_MODES.map(({ value, label }) => <button key={value} type="button" aria-label={`Cooktop mode: ${label}`} aria-pressed={cooktop.mode === value}
          disabled={!controllable} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'stoveMode', value)}>{label}</button>)}
      </div>
      <div className="cooktop-timer"><span>SAVED TIMER<small>No countdown or auto-stop</small></span>
        <div className="cooktop-timer-stepper" role="group" aria-label="Saved cooktop timer">
          <button type="button" aria-label="Decrease cooktop timer" disabled={!controllable || cooktop.timerMinutes === null || cooktop.timerMinutes <= 0} onClick={() => run('stove-timer-down')}><Minus size={18} aria-hidden="true" /></button>
          <output aria-label="Saved cooktop minutes">{cooktop.timerMinutes ?? '—'}<small> min</small></output>
          <button type="button" aria-label="Increase cooktop timer" disabled={!controllable || cooktop.timerMinutes === null || cooktop.timerMinutes >= 60} onClick={() => run('stove-timer-up')}><Plus size={18} aria-hidden="true" /></button>
        </div>
      </div>
      <button className="cooktop-lock" type="button" role="switch" aria-label={`Child-lock preference${cooktop.lockPreference === null ? ' unavailable' : ''}`} aria-checked={cooktop.lockPreference === true}
        disabled={!controllable || cooktop.lockPreference === null} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'stoveLock', !cooktop.lockPreference)}>
        <LockKeyhole size={17} aria-hidden="true" /><span>Child-lock preference<small>Saved only · does not lock controls</small></span><strong>{cooktop.lockPreference === null ? '—' : cooktop.lockPreference ? 'On' : 'Off'}</strong>
      </button>
    </div></div>
    <p className="cooktop-feedback">{COOKTOP_PREVIEW_NOTE}</p>
  </section>;
}
