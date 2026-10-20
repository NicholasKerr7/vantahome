import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Droplets, Ellipsis, Pause, Play, Square, Wind } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { DISHWASHER_CYCLE_OPTIONS, DISHWASHER_TEMPERATURE_OPTIONS, dishwasherControllerActionId, readDishwasherControllerState } from './dishwasherController';
import { DishwasherConsoleArtwork } from './DishwasherConsoleArtwork';
import './dishwasher-controller.css';

/** A selected dishwasher presents saved preferences and activity through the existing guarded store. */
export function DishwasherController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const dishwasher = readDishwasherControllerState(device, current);
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);

  /** Preserve the full catalog and restore keyboard focus when deliberately changing panels. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  /** Explicit activity commands preserve sample values and saved preferences. */
  function run(key: 'start' | 'pause' | 'stop') {
    useHomeStore.getState().runDeviceAction(device.id, dishwasherControllerActionId(key));
  }
  /** Preference selection never starts a wash preview; the reducer rechecks the grant. */
  function choose(field: string, value: string | boolean) { useHomeStore.getState().setDeviceSetting(device.id, field, value); }

  if (!dishwasher) return null;
  if (more) return <section className="dishwasher-more" aria-label="Additional dishwasher settings">
    <button ref={backButton} type="button" className="dishwasher-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to dishwasher console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;
  const PrimaryIcon = dishwasher.on ? Pause : Play;
  const primaryLabel = dishwasher.on ? 'Pause cycle' : dishwasher.activity === 'paused' ? 'Resume cycle' : 'Start cycle';
  return <section className="dishwasher-workspace" aria-label={`${device.name} wash console`} data-motion-disabled={reduced}>
    <div className="dishwasher-stage"><div className="dishwasher-console">
      <header className="dishwasher-top">
        <span className="dishwasher-emblem" aria-hidden="true"><Droplets size={23} /></span>
        <div className="dishwasher-brand"><span>VANTAHOME</span><strong>DISHWASH</strong></div>
        <button ref={moreButton} type="button" className="dishwasher-round" aria-label="More dishwasher settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="dishwasher-hero">
        <DishwasherConsoleArtwork running={dishwasher.on} reduced={reduced} />
        <div className="dishwasher-readout"><div><strong>{dishwasher.status}</strong><span>{dishwasher.cycle} · Saved program</span></div>
          <div className="dishwasher-samples"><strong>{dishwasher.remainingMin === null ? '—' : `${dishwasher.remainingMin} min`}</strong><span>{dishwasher.progressPercent === null ? 'Progress unavailable' : `${dishwasher.progressPercent}% progress`} · Sample</span></div>
        </div>
      </div>
      <div className="dishwasher-actions" role="group" aria-label="Dishwasher cycle activity">
        <button type="button" className="dishwasher-primary" disabled={!controllable} onClick={() => run(dishwasher.on ? 'pause' : 'start')}><PrimaryIcon size={18} aria-hidden="true" />{primaryLabel}</button>
        <button type="button" disabled={!controllable || (!dishwasher.on && dishwasher.activity !== 'paused')} onClick={() => run('stop')}><Square size={16} aria-hidden="true" />Stop cycle</button>
      </div>
      <div className="dishwasher-cycles"><span className="dishwasher-caption">PROGRAM · {dishwasher.cycle}</span>
        <div className="dishwasher-cycle-rail" role="group" aria-label="Cycle preference">
          {DISHWASHER_CYCLE_OPTIONS.map((option) => <button type="button" key={option.value} aria-pressed={dishwasher.cycle === option.value}
            disabled={!controllable} onClick={() => choose('cycle', option.value)}>{option.label}</button>)}
        </div>
      </div>
      <div className="dishwasher-preferences">
        <label><span className="dishwasher-caption">TEMPERATURE</span><select aria-label="Temperature preference" value={dishwasher.washTemp ?? ''} disabled={!controllable}
          onChange={(event) => choose('washTemp', event.target.value)}>
          {dishwasher.washTemp === null && <option value="" disabled>Unavailable</option>}
          {DISHWASHER_TEMPERATURE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <div><span className="dishwasher-caption">DRYING PREFERENCE</span><button type="button" className="dishwasher-dry" aria-label="Dry Boost preference"
          aria-pressed={dishwasher.extraDry} disabled={!controllable} onClick={() => choose('extraSpin', !dishwasher.extraDry)}>
          <Wind size={17} aria-hidden="true" /><span>Dry Boost</span><strong>{dishwasher.extraDry ? 'On' : 'Off'}</strong>
        </button></div>
      </div>
      <p className="dishwasher-note">Saved preferences · Time and progress are fixed samples.</p>
    </div></div>
    <p className="dishwasher-feedback"><span>SIMULATION</span>More includes rinse, soil, care and schedule settings</p>
  </section>;
}
