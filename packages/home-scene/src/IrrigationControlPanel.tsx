import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, Leaf, Minus, Plus, Power, Droplets } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { IRRIGATION_DURATION_BOUNDS, IRRIGATION_DURATION_PRESETS, IRRIGATION_ZONES, irrigationControllerActionId, readIrrigationControllerState } from './irrigationController';
import { IrrigationConsoleArtwork } from './IrrigationConsoleArtwork';
import './irrigation-controller.css';

/** Everyday garden controls use the existing simulation; zone and duration remain saved preferences. */
export function IrrigationController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const irrigation = readIrrigationControllerState(device, current);
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);

  /** Return keyboard focus to the originating control after advanced settings. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  /** Apply relative changes to the latest guarded state rather than a stale rendered duration. */
  function step(key: 'durationUp' | 'durationDown') { useHomeStore.getState().runDeviceAction(device.id, irrigationControllerActionId(key)); }
  if (!irrigation) return null;
  if (more) return <section className="irrigation-more" aria-label="Additional irrigation settings">
    <button ref={backButton} type="button" className="irrigation-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to irrigation console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;

  return <section className="irrigation-workspace" aria-label={`${device.name} irrigation console`} data-motion-disabled={reduced}>
    <div className="irrigation-stage"><div className="irrigation-console" data-running={irrigation.on}>
      <header className="irrigation-top">
        <span className="irrigation-mark" aria-hidden="true"><Leaf size={24} /></span>
        <div className="irrigation-brand"><span>VANTAHOME</span><strong>IRRIGATION</strong></div>
        <button ref={moreButton} className="irrigation-round" type="button" aria-label="More irrigation settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="irrigation-hero"><IrrigationConsoleArtwork on={irrigation.on} reduced={reduced} />
        <p className="irrigation-status" aria-live="polite"><span aria-hidden="true" />{irrigation.status}</p>
      </div>
      <div className="irrigation-section"><span className="irrigation-caption">ZONE PREFERENCE</span>
        <div className="irrigation-zones" role="group" aria-label="Irrigation zone preference">
          {IRRIGATION_ZONES.map((zone) => <button type="button" key={zone.value} aria-label={`Zone preference: ${zone.label}`} aria-pressed={irrigation.zone === zone.value}
            disabled={!controllable} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'zone', zone.value)}>{zone.label}</button>)}
        </div>
      </div>
      <div className="irrigation-duration" role="group" aria-label="Saved duration, steps of 5 minutes">
        <button className="irrigation-round" type="button" aria-label="Decrease irrigation duration" disabled={!controllable || irrigation.durationMin === null || irrigation.durationMin <= IRRIGATION_DURATION_BOUNDS.min} onClick={() => step('durationDown')}><Minus size={22} aria-hidden="true" /></button>
        <div><span className="irrigation-caption">DURATION PREFERENCE</span><output aria-label="Saved irrigation duration" aria-live="off">{irrigation.durationMin ?? '—'}<small>min</small></output></div>
        <button className="irrigation-round" type="button" aria-label="Increase irrigation duration" disabled={!controllable || irrigation.durationMin === null || irrigation.durationMin >= IRRIGATION_DURATION_BOUNDS.max} onClick={() => step('durationUp')}><Plus size={22} aria-hidden="true" /></button>
      </div>
      <div className="irrigation-presets" role="group" aria-label="Irrigation duration presets">
        {IRRIGATION_DURATION_PRESETS.map((preset) => <button type="button" key={preset.value} aria-label={`Save irrigation duration ${preset.label}`} aria-pressed={irrigation.durationMin === preset.value}
          disabled={!controllable} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'durationMin', preset.value)}>{preset.label}</button>)}
      </div>
      <button className="irrigation-primary" type="button" aria-label={irrigation.on ? 'Stop irrigation simulation' : 'Start irrigation simulation'} disabled={!controllable}
        onClick={() => useHomeStore.getState().toggleDevice(device.id)}>{irrigation.on ? <Power size={19} aria-hidden="true" /> : <Droplets size={19} aria-hidden="true" />}{irrigation.on ? 'Stop simulation' : 'Start simulation'}</button>
    </div></div>
    <p className="irrigation-feedback"><span>SIMULATION</span>Zone and duration save only · Stop ends the preview</p>
  </section>;
}
