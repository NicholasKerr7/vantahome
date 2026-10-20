import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Battery, Ellipsis, House, Minus, Moon, Pause, Play, Plus, Sparkles, Waves } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { VACUUM_MODE_OPTIONS, readVacuumControllerState, vacuumControllerActionId, vacuumMaintenanceSummary } from './vacuumController';
import { VacuumConsoleArtwork } from './VacuumConsoleArtwork';
import './vacuum-controller.css';

/** A tactile cleaning console operates the existing saved simulation, without a route or progress engine. */
export function VacuumController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const motionDisabled = useHomeStore((state) => state.motionDisabled);
  const vacuum = readVacuumControllerState(device, current);

  /** Restore meaningful focus after deliberate More/Back navigation only. */
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);

  /** Preserve the complete advanced catalog behind the everyday console. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }

  /** Explicit commands distinguish pausing from docking and resolve relative steps against current state. */
  function run(key: Parameters<typeof vacuumControllerActionId>[0]) { useHomeStore.getState().runDeviceAction(device.id, vacuumControllerActionId(key)); }

  /** Cleaning preferences do not start the robot or imply an implemented cleaning algorithm. */
  function setValue(field: 'vacuumMode' | 'vacuumMop' | 'vacuumQuietMode', value: string | boolean) { useHomeStore.getState().setDeviceSetting(device.id, field, value); }

  if (!vacuum) return null;
  if (more) return <section className="vacuum-more" aria-label="Additional vacuum settings">
    <button ref={backButton} type="button" className="vacuum-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to cleaning console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;
  const primaryLabel = vacuum.on ? 'Pause cleaning' : vacuum.activity === 'paused' ? 'Resume cleaning' : 'Start cleaning';
  const PrimaryIcon = vacuum.on ? Pause : Play;
  const maintenance = vacuumMaintenanceSummary(vacuum);

  return <section className="vacuum-workspace" aria-label={`${device.name} cleaning console`} data-motion-disabled={motionDisabled}>
    <div className="vacuum-stage"><div className="vacuum-console" data-activity={vacuum.activity}>
      <header className="vacuum-top">
        <span className="vacuum-emblem" aria-hidden="true"><Sparkles size={21} /></span>
        <div className="vacuum-brand"><span>VANTAHOME</span><strong>CLEANING</strong></div>
        <button ref={moreButton} className="vacuum-key" type="button" aria-label="More vacuum settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="vacuum-visual">
        <VacuumConsoleArtwork vacuum={vacuum} />
        <div className="vacuum-readings"><strong>{vacuum.status}</strong><span aria-label={vacuum.batteryPercent === null ? 'Battery sample unavailable' : `Battery sample ${vacuum.batteryPercent}%`}><Battery size={15} aria-hidden="true" />{vacuum.batteryPercent === null ? '—' : `${vacuum.batteryPercent}%`}<small>sample</small></span></div>
      </div>
      <div className="vacuum-actions" role="group" aria-label="Cleaning activity">
        <button type="button" className="vacuum-primary" disabled={!controllable} onClick={() => run(vacuum.on ? 'pause' : 'start')}><PrimaryIcon size={18} aria-hidden="true" />{primaryLabel}</button>
        <button type="button" aria-label="Dock vacuum" disabled={!controllable || vacuum.activity === 'docked'} onClick={() => run('dock')}><House size={18} aria-hidden="true" />Dock</button>
      </div>
      <div className="vacuum-modes"><span>CLEANING MODE PREFERENCE</span><div role="group" aria-label="Cleaning mode preference">
        {VACUUM_MODE_OPTIONS.map((option) => <button type="button" key={option.value} aria-pressed={vacuum.mode === option.value} disabled={!controllable} onClick={() => setValue('vacuumMode', option.value)}>{option.label}</button>)}
      </div></div>
      <div className="vacuum-suction" role="group" aria-label="Suction preference, steps of 10 percent">
        <button type="button" className="vacuum-key" aria-label="Decrease suction preference" disabled={!controllable || vacuum.suction <= 0} onClick={() => run('suctionDown')}><Minus size={20} aria-hidden="true" /></button>
        <div><span>SUCTION PREFERENCE</span><output aria-label="Suction preference in percent" aria-live="off">{vacuum.suction}<small>%</small></output></div>
        <button type="button" className="vacuum-key" aria-label="Increase suction preference" disabled={!controllable || vacuum.suction >= 100} onClick={() => run('suctionUp')}><Plus size={20} aria-hidden="true" /></button>
      </div>
      <div className="vacuum-preferences">
        <button type="button" role="switch" aria-label="Mop preference" aria-checked={vacuum.mop} disabled={!controllable} onClick={() => setValue('vacuumMop', !vacuum.mop)}><Waves size={17} aria-hidden="true" />Mop<strong>{vacuum.mop ? 'On' : 'Off'}</strong></button>
        <button type="button" role="switch" aria-label="Quiet preference" aria-checked={vacuum.quiet} disabled={!controllable} onClick={() => setValue('vacuumQuietMode', !vacuum.quiet)}><Moon size={17} aria-hidden="true" />Quiet<strong>{vacuum.quiet ? 'On' : 'Off'}</strong></button>
      </div>
      <p className="vacuum-note">Modes, suction, mop and quiet are saved preferences.<br />No cleaning route or progress is simulated.</p>
    </div></div>
    <p className="vacuum-feedback" role={maintenance ? 'status' : undefined}><span>{maintenance ? 'MAINTENANCE SAMPLE' : 'SIMULATION'}</span>{maintenance ?? 'Start, pause and dock · Settings saved locally'}</p>
  </section>;
}
