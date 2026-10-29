import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Coffee, Ellipsis, Minus, Plus, Play, Square } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { COFFEE_CUP_BOUNDS, COFFEE_PREVIEW_NOTE, COFFEE_SIZE_PRESETS, COFFEE_STRENGTHS, coffeeControllerActionId, readCoffeeControllerState } from './coffeeController';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { CoffeeConsoleArtwork } from './CoffeeConsoleArtwork';
import './coffee-controller.css';

/** Everyday recipe preferences and a deliberate brewing preview share the original guarded device state. */
export function CoffeeController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null), backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const coffee = readCoffeeControllerState(device, current);
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);
  /** Move keyboard focus only after intentional navigation into or out of More. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  /** Relative cup steps preserve activity and resolve against the latest accepted recipe. */
  function step(key: 'cupsUp' | 'cupsDown') { useHomeStore.getState().runDeviceAction(device.id, coffeeControllerActionId(key)); }
  if (!coffee) return null;
  if (more) return <section className="coffee-more" aria-label="Additional coffee settings"><button ref={backButton} className="coffee-return" type="button" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to coffee console</button><PagedDeviceControls device={device} current={current} /></section>;
  return <section className="coffee-workspace" aria-label={`${device.name} coffee console`} data-motion-disabled={reduced}>
    <div className="coffee-stage"><div className="coffee-console" data-running={coffee.on}>
      <header className="coffee-top"><span className="coffee-mark" aria-hidden="true"><Coffee size={24} /></span><div className="coffee-brand"><span>VANTAHOME</span><strong>COFFEE ATELIER</strong></div><button ref={moreButton} type="button" className="coffee-round" aria-label="More coffee settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button></header>
      <div className="coffee-hero"><CoffeeConsoleArtwork on={coffee.on} reduced={reduced} /><p className="coffee-status" aria-live="polite"><span aria-hidden="true" />{coffee.status}</p></div>
      <div className="coffee-section"><span>STRENGTH PREFERENCE</span><div className="coffee-choices" role="group" aria-label="Coffee strength preference">{COFFEE_STRENGTHS.map((option) => <button key={option.value} type="button" disabled={!controllable} aria-pressed={coffee.strength === option.value} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'coffeeStrength', option.value)}>{option.label}</button>)}</div></div>
      <div className="coffee-section"><div className="coffee-caption"><span>CUP SIZE PREFERENCE</span><strong>{coffee.sizeOz === null ? 'Unavailable' : `${coffee.sizeOz} oz`}</strong></div><div className="coffee-choices" role="group" aria-label="Coffee size preference">{COFFEE_SIZE_PRESETS.map((size) => <button key={size} type="button" disabled={!controllable} aria-label={`Save cup size ${size} ounces`} aria-pressed={coffee.sizeOz === size} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'coffeeSizeOz', size)}>{size}<small>oz</small></button>)}</div></div>
      <div className="coffee-cups"><span>CUPS<small>Saved preference</small></span><div className="coffee-stepper" role="group" aria-label="Coffee cup count">
        <button type="button" aria-label="Decrease coffee cups" disabled={!controllable || coffee.cups === null || coffee.cups <= COFFEE_CUP_BOUNDS.min} onClick={() => step('cupsDown')}><Minus size={20} aria-hidden="true" /></button><output aria-label="Saved coffee cup count">{coffee.cups ?? '—'}</output><button type="button" aria-label="Increase coffee cups" disabled={!controllable || coffee.cups === null || coffee.cups >= COFFEE_CUP_BOUNDS.max} onClick={() => step('cupsUp')}><Plus size={20} aria-hidden="true" /></button>
      </div></div>
      <button type="button" className="coffee-primary" disabled={!controllable} onClick={() => useHomeStore.getState().runDeviceAction(device.id, coffee.on ? 'coffee-stop' : 'coffee-brew')}>{coffee.on ? <Square size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}{coffee.on ? 'Stop preview' : 'Brew preview'}</button>
    </div></div><p className="coffee-feedback"><span>SIMULATION</span>{COFFEE_PREVIEW_NOTE}</p>
  </section>;
}
