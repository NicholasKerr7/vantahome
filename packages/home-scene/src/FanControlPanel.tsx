import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, Minus, Moon, Plus, Power, RotateCcw, RotateCw } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { FAN_SPEED_PRESETS, FAN_SPEED_BOUNDS, fanControllerActionId, readFanControllerState } from './fanController';
import { FanConsoleArtwork } from './FanConsoleArtwork';
import './fan-controller.css';

/** Everyday airflow controls project the same saved state and rotor behavior as the property scene. */
export function FanController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const fan = readFanControllerState(device, current);
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);

  /** Restore focus after advanced settings without disturbing initial dialog focus. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  /** Dispatch relative speed changes through the guarded reducer, preserving power and sleep. */
  function step(key: 'speedUp' | 'speedDown') { useHomeStore.getState().runDeviceAction(device.id, fanControllerActionId(key)); }
  /** Read current state for successive taps so sleep never toggles from a stale render. */
  function toggleSleep() {
    const store = useHomeStore.getState();
    const latest = store.deviceStates[device.id];
    const value = latest && readFanControllerState(device, latest);
    if (value) store.setDeviceSetting(device.id, 'fanSleepMode', !value.sleep);
  }
  if (!fan) return null;
  if (more) return <section className="fan-more" aria-label="Additional fan settings">
    <button ref={backButton} type="button" className="fan-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to airflow console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;

  return <section className="fan-workspace" aria-label={`${device.name} airflow console`} data-motion-disabled={reduced}>
    <div className="fan-stage"><div className="fan-console" data-running={fan.velocity !== 0}>
      <header className="fan-top">
        <button className="fan-round" type="button" role="switch" aria-label="Fan power" aria-checked={fan.on} disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}><Power size={22} aria-hidden="true" /></button>
        <div className="fan-brand"><span>VANTAHOME</span><strong>AIRFLOW</strong></div>
        <button ref={moreButton} className="fan-round" type="button" aria-label="More fan settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="fan-hero">
        <FanConsoleArtwork velocity={fan.velocity} reduced={reduced} extractor={device.model === 'extractor'} />
        <div className="fan-readout"><span>{device.model === 'extractor' ? 'VENTILATION' : 'CEILING FAN'}</span><strong>{fan.status}</strong><small>{fan.sleep ? `Sleep caps preview at 35% · Now ${fan.effectiveSpeed}%` : `Preview airflow ${fan.effectiveSpeed}%`}</small></div>
      </div>
      <div className="fan-speed" role="group" aria-label="Fan speed, steps of 10 percent">
        <button className="fan-round" type="button" aria-label="Decrease fan speed" disabled={!controllable || fan.speed <= FAN_SPEED_BOUNDS.min} onClick={() => step('speedDown')}><Minus size={21} aria-hidden="true" /></button>
        <div><span>SET SPEED</span><output aria-label="Fan set speed in percent" aria-live="off">{fan.speed}<small>%</small></output></div>
        <button className="fan-round" type="button" aria-label="Increase fan speed" disabled={!controllable || fan.speed >= FAN_SPEED_BOUNDS.max} onClick={() => step('speedUp')}><Plus size={21} aria-hidden="true" /></button>
      </div>
      <div className="fan-presets" role="group" aria-label="Fan speed presets">
        {FAN_SPEED_PRESETS.map((preset) => <button type="button" key={preset.value} aria-label={`${preset.label} fan speed ${preset.value}%`} aria-pressed={fan.speed === preset.value} disabled={!controllable} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'speed', preset.value)}>{preset.label}<small>{preset.value}%</small></button>)}
      </div>
      <div className="fan-options">
        <div className="fan-direction" role="group" aria-label="Fan direction">
          <button type="button" aria-label="Fan direction forward" aria-pressed={fan.direction === 'forward'} disabled={!controllable} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'fanDirection', 'forward')}><RotateCw size={17} aria-hidden="true" /><span>Forward</span></button>
          <button type="button" aria-label="Fan direction reverse" aria-pressed={fan.direction === 'reverse'} disabled={!controllable} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'fanDirection', 'reverse')}><RotateCcw size={17} aria-hidden="true" /><span>Reverse</span></button>
        </div>
        <button className="fan-sleep" type="button" role="switch" aria-label="Fan sleep mode" aria-checked={fan.sleep} disabled={!controllable} onClick={toggleSleep}><Moon size={18} aria-hidden="true" /><span>Sleep</span></button>
      </div>
    </div></div>
    <p className="fan-feedback"><span>SIMULATION</span>{fan.on ? 'Airflow preview · No physical fan connected' : 'Power off · Your speed and settings are saved'}</p>
  </section>;
}
