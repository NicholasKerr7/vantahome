import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, Minus, Plus, Power, Snowflake, Wind } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { formatClimateTemperature } from './climateController';
import {
  REFRIGERATOR_MODES, REFRIGERATOR_PREFERENCE_NOTE, REFRIGERATOR_TARGET_BOUNDS,
  readRefrigeratorControllerState, refrigeratorControllerActionId,
} from './refrigeratorController';
import { RefrigeratorConsoleArtwork } from './RefrigeratorConsoleArtwork';
import './refrigerator-controller.css';

type TargetProps = {
  label: string; target: number | null; unit: 'C' | 'F'; controllable: boolean;
  bounds: { readonly min: number; readonly max: number }; onDown: () => void; onUp: () => void;
};

/** Keep each compartment's saved target separate, including an explicit unavailable state. */
function RefrigeratorTarget({ label, target, unit, controllable, bounds, onDown, onUp }: TargetProps) {
  return <div className="refrigerator-target" role="group" aria-label={`${label} target, steps of ${unit === 'F' ? '1.8 degrees Fahrenheit' : '1 degree Celsius'}`}>
    <span>{label} target</span>
    <div className="refrigerator-stepper">
      <button type="button" aria-label={`Decrease ${label.toLowerCase()} target`} disabled={!controllable || target === null || target <= bounds.min} onClick={onDown}><Minus size={19} aria-hidden="true" /></button>
      <output aria-label={`${label} target temperature in degrees ${unit === 'F' ? 'Fahrenheit' : 'Celsius'}`}>{target === null ? '—' : formatClimateTemperature(target, unit)}<small>°{unit}</small></output>
      <button type="button" aria-label={`Increase ${label.toLowerCase()} target`} disabled={!controllable || target === null || target >= bounds.max} onClick={onUp}><Plus size={19} aria-hidden="true" /></button>
    </div>
  </div>;
}

/** Present existing saved refrigeration settings without inventing cooling measurements or schedules. */
export function RefrigeratorController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const unit = useHomeStore((state) => state.tempUnit);
  const fridge = readRefrigeratorControllerState(device, current);
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);

  /** Retain keyboard focus when entering or leaving the original advanced controls. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  /** Resolve repeated taps against the latest guarded canonical state, never a render snapshot. */
  function step(key: Parameters<typeof refrigeratorControllerActionId>[0]) { useHomeStore.getState().runDeviceAction(device.id, refrigeratorControllerActionId(key)); }

  if (!fridge) return null;
  if (more) return <section className="refrigerator-more" aria-label="Additional refrigerator settings">
    <button ref={backButton} type="button" className="refrigerator-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to refrigerator console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;
  return <section className="refrigerator-workspace" aria-label={`${device.name} refrigerator console`} data-motion-disabled={reduced}>
    <div className="refrigerator-stage"><div className="refrigerator-console" data-powered={fridge.on}>
      <header className="refrigerator-top">
        <button type="button" className="refrigerator-round" role="switch" aria-label={`${device.name} power`} aria-checked={fridge.on} disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}><Power size={22} aria-hidden="true" /></button>
        <div className="refrigerator-brand"><span>VANTAHOME</span><strong>REFRIGERATION</strong></div>
        <button type="button" ref={moreButton} className="refrigerator-round" aria-label="More refrigerator settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="refrigerator-hero"><RefrigeratorConsoleArtwork on={fridge.on} /><p className="refrigerator-status" aria-live="polite"><span aria-hidden="true" />{fridge.status}</p></div>
      <div className="refrigerator-targets">
        <RefrigeratorTarget label="Fridge" target={fridge.tempC} unit={unit} bounds={REFRIGERATOR_TARGET_BOUNDS.fridge} controllable={controllable} onDown={() => step('fridgeDown')} onUp={() => step('fridgeUp')} />
        <RefrigeratorTarget label="Freezer" target={fridge.freezerTempC} unit={unit} bounds={REFRIGERATOR_TARGET_BOUNDS.freezer} controllable={controllable} onDown={() => step('freezerDown')} onUp={() => step('freezerUp')} />
      </div>
      <div className="refrigerator-section"><span>MODE PREFERENCE</span><div className="refrigerator-modes" role="group" aria-label="Refrigerator mode preference">
        {REFRIGERATOR_MODES.map((option) => <button type="button" key={option.value} aria-pressed={fridge.mode === option.value} disabled={!controllable} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'fridgeMode', option.value)}>{option.label}</button>)}
      </div></div>
      <div className="refrigerator-quick" role="group" aria-label="Saved quick cooling preferences">
        <button type="button" role="switch" aria-label="Quick cool preference" aria-checked={fridge.quickCool === true} disabled={!controllable} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'fridgeQuickCool', fridge.quickCool !== true)}><Wind size={18} aria-hidden="true" /><span>Quick cool<small>{fridge.quickCool === null ? 'Unknown' : fridge.quickCool ? 'On' : 'Off'}</small></span></button>
        <button type="button" role="switch" aria-label="Quick freeze preference" aria-checked={fridge.quickFreeze === true} disabled={!controllable} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'fridgeQuickFreeze', fridge.quickFreeze !== true)}><Snowflake size={18} aria-hidden="true" /><span>Quick freeze<small>{fridge.quickFreeze === null ? 'Unknown' : fridge.quickFreeze ? 'On' : 'Off'}</small></span></button>
      </div>
      <p className="refrigerator-note">Ice maker, door alarm & more in <span>•••</span></p>
    </div></div>
    <p className="refrigerator-feedback"><span>SIMULATION</span>{REFRIGERATOR_PREFERENCE_NOTE}</p>
  </section>;
}
