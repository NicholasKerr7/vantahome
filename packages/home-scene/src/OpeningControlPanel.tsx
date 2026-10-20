import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, DoorOpen, Ellipsis, Minus, Plus, Wind } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { openingControllerActionId, readOpeningControllerState } from './openingController';
import { OpeningConsoleArtwork } from './OpeningConsoleArtwork';
import { useOpeningPresentationMotion } from './useOpeningPresentationMotion';
import './opening-controller.css';

const PRESENTATION = {
  door: { brand: 'ENTRY', label: 'door', mechanism: 'Side-hinged door' },
  garage: { brand: 'GARAGE', label: 'garage', mechanism: 'Roller shutter' },
  window: { brand: 'WINDOW', label: 'window', mechanism: 'Awning window' },
} as const;

/** Present accepted opening positions while all mutations remain inside the guarded shared store. */
export function OpeningController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const rangeId = useId();
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const motionAllowed = useOpeningPresentationMotion(reduced);
  const opening = readOpeningControllerState(device, current);
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);

  /** Keep every advanced control accessible and restore focus after deliberate panel changes. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  /** Resolve relative steps from the latest reducer state, including rapid taps. */
  function run(key: 'open' | 'close' | 'increase' | 'decrease') {
    if (opening) useHomeStore.getState().runDeviceAction(device.id, openingControllerActionId(opening.kind, key));
  }
  /** The slider writes only the canonical opening percentage; it never grants new authority. */
  function setPosition(value: number) { useHomeStore.getState().setDeviceLevel(device.id, value); }

  if (!opening) return null;
  const presentation = PRESENTATION[opening.kind];
  if (more) return <section className="opening-more" aria-label={`Additional ${presentation.label} settings`}>
    <button ref={backButton} type="button" className="opening-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to {presentation.label} console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;

  return <section className="opening-workspace" aria-label={`${device.name} opening console`} data-motion-disabled={!motionAllowed}>
    <div className="opening-stage"><div className="opening-console">
      <header className="opening-top">
        <span className="opening-emblem" aria-hidden="true"><DoorOpen size={23} /></span>
        <div className="opening-brand"><span>VANTAHOME</span><strong>{presentation.brand}</strong></div>
        <button ref={moreButton} type="button" className="opening-round" aria-label={`More ${presentation.label} settings`} onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="opening-hero">
        <OpeningConsoleArtwork kind={opening.kind} position={opening.openPercent} />
        <div className="opening-readout"><div><span>OPEN POSITION</span><output aria-label={`${presentation.label} opening percentage`} aria-live="polite">{opening.openPercent ?? '—'}{opening.openPercent !== null && <small>%</small>}</output></div>
          <div className="opening-status"><strong>{opening.status}</strong><span>{presentation.mechanism}</span></div>
        </div>
      </div>
      <div className="opening-adjustment" role="group" aria-label="Opening position">
        <button type="button" className="opening-round" aria-label={`Decrease ${presentation.label} opening by 5 percent`} disabled={!controllable || opening.openPercent === null || !opening.canClose} onClick={() => run('decrease')}><Minus size={22} aria-hidden="true" /></button>
        <label className="sr-only" htmlFor={rangeId}>{presentation.label} opening position</label>
        <input id={rangeId} type="range" min="0" max="100" step="1" value={opening.openPercent ?? 0} aria-valuetext={opening.openPercent === null ? 'Position unavailable' : `${opening.openPercent}% open`}
          disabled={!controllable || opening.openPercent === null} onChange={(event) => setPosition(Number(event.currentTarget.value))} />
        <button type="button" className="opening-round" aria-label={`Increase ${presentation.label} opening by 5 percent`} disabled={!controllable || opening.openPercent === null || !opening.canOpen} onClick={() => run('increase')}><Plus size={22} aria-hidden="true" /></button>
      </div>
      <div className={`opening-actions${opening.kind === 'window' ? ' has-vent' : ''}`} role="group" aria-label={`${presentation.label} actions`}>
        <button type="button" disabled={!controllable || !opening.canClose} onClick={() => run('close')}><ArrowDownToLine size={17} aria-hidden="true" />Close</button>
        {opening.kind === 'window' && <button type="button" aria-pressed={opening.openPercent === 25} disabled={!controllable} onClick={() => useHomeStore.getState().runDeviceAction(device.id, 'window-vent')}><Wind size={17} aria-hidden="true" />Vent 25%</button>}
        <button type="button" className="opening-primary" disabled={!controllable || !opening.canOpen} onClick={() => run('open')}><ArrowUpFromLine size={17} aria-hidden="true" />Open</button>
      </div>
      <div className="opening-trim" aria-hidden="true"><span /><span /><span /><span /><span /></div>
    </div></div>
    <p className="opening-feedback"><span>SIMULATION</span>Saved position · Local preview</p>
  </section>;
}
