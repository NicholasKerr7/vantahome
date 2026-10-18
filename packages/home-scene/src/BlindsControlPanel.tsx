import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Blinds, ChevronDown, ChevronUp, Ellipsis } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { BLINDS_POSITION_PRESETS, blindsActionId, getBlindsControllerSlats, readBlindsControllerState } from './blindsController';
import './blinds-controller.css';

/** A lightweight window illustration follows the saved position, without another WebGL scene. */
function BlindsWindow({ position }: { position: number }) {
  const id = useId();
  const slats = getBlindsControllerSlats(position);
  return <svg className="blinds-window" viewBox="0 0 240 200" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-frame`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#B4A2C7" /><stop offset=".08" stopColor="#51445E" /><stop offset=".5" stopColor="#21192D" /><stop offset="1" stopColor="#756086" /></linearGradient>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#24133E" /><stop offset=".55" stopColor="#776084" /><stop offset="1" stopColor="#D5ACA3" /></linearGradient>
      <linearGradient id={`${id}-slat`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#D5C6E3" /><stop offset=".22" stopColor="#AFA0C2" /><stop offset=".8" stopColor="#665775" /><stop offset="1" stopColor="#3E314E" /></linearGradient>
      <clipPath id={`${id}-glass`}><rect x="27" y="23" width="186" height="157" rx="5" /></clipPath>
    </defs>
    <rect x="15" y="9" width="210" height="184" rx="13" fill={`url(#${id}-frame)`} stroke="#A68CBF" />
    <rect x="24" y="19" width="192" height="163" rx="7" fill={`url(#${id}-sky)`} stroke="#140C20" strokeWidth="3" />
    <g clipPath={`url(#${id}-glass)`}>
      <circle cx="174" cy="56" r="16" fill="#EAD0CB" opacity=".72" />
      <path d="M20 141 Q65 96 111 140 T225 125 V190 H20Z" fill="#514A60" />
      <path d="M20 163 Q90 132 140 155 T225 147 V190 H20Z" fill="#292936" />
      <path d="M43 25L86 179 M62 25L105 179" stroke="#E9DAFF" strokeWidth="13" opacity=".07" />
      <path d="M120 20V184 M24 117H216" stroke="#30253E" strokeWidth="4" />
      {slats.map((slat, index) => <rect key={index} className="blinds-slat" x="27" y={27 + slat.y * 151} width="186" height={slat.height * 151} rx="1.5" fill={`url(#${id}-slat)`} stroke="#33253F" strokeWidth=".7" />)}
    </g>
    <rect x="23" y="16" width="194" height="12" rx="4" fill={`url(#${id}-frame)`} stroke="#BAA3D4" strokeWidth=".5" />
    <path d="M11 190H229L234 196H6Z" fill={`url(#${id}-frame)`} stroke="#79658B" strokeWidth=".5" />
  </svg>;
}

/** Keep blinds position and everyday actions together over the existing guarded simulation. */
export function BlindsController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changedPanel = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const rangeId = useId();
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const motionDisabled = useHomeStore((state) => state.motionDisabled);
  const blinds = readBlindsControllerState(device, current);

  /** Deliberate panel changes keep keyboard focus on the matching return control. */
  useLayoutEffect(() => {
    if (changedPanel.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true });
  }, [more]);

  /** Advanced catalog controls retain their existing pagination and configuration notices. */
  function changePanel(next: boolean) { changedPanel.current = true; setMore(next); }

  /** Relative commands resolve against current shared state, including rapid repeated presses. */
  function run(key: Parameters<typeof blindsActionId>[0]) { useHomeStore.getState().runDeviceAction(device.id, blindsActionId(key)); }

  /** A slider or preset writes the single authoritative opening percentage. */
  function setPosition(position: number) { useHomeStore.getState().setDeviceLevel(device.id, position); }

  if (more) return <section className="blinds-more" aria-label="Additional blinds settings">
    <button ref={backButton} type="button" className="blinds-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to blinds</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;

  return <section className="blinds-workspace" aria-label={`${device.name} blinds controller`} data-motion-disabled={motionDisabled}>
    <div className="blinds-stage"><div className="blinds-console">
      <header className="blinds-top">
        <span className="blinds-emblem" aria-hidden="true"><Blinds size={23} /></span>
        <div className="blinds-brand"><span>VANTAHOME</span><strong>BLINDS</strong></div>
        <button ref={moreButton} type="button" className="blinds-key" aria-label="More blinds settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="blinds-visual"><BlindsWindow position={blinds.position} /><div className="blinds-reading">
        <span>OPEN POSITION</span><output aria-label="Blinds opening percentage" aria-live="polite">{blinds.position}<small>%</small></output>
        <p>{blinds.status}</p>
      </div></div>
      <div className="blinds-adjustment" role="group" aria-label="Opening position">
        <label className="sr-only" htmlFor={rangeId}>Blinds opening position</label>
        <button type="button" className="blinds-key" aria-label="Lower blinds by 5 percent" disabled={!controllable || !blinds.canLower} onClick={() => run('lower')}><ChevronDown size={22} aria-hidden="true" /></button>
        <input id={rangeId} type="range" min="0" max="100" step="1" value={blinds.position} aria-valuetext={`${blinds.position}% open`} disabled={!controllable} onChange={(event) => setPosition(Number(event.currentTarget.value))} />
        <button type="button" className="blinds-key" aria-label="Raise blinds by 5 percent" disabled={!controllable || !blinds.canRaise} onClick={() => run('raise')}><ChevronUp size={22} aria-hidden="true" /></button>
      </div>
      <div className="blinds-actions">
        <button type="button" className="blinds-action" disabled={!controllable || !blinds.canLower} onClick={() => run('close')}><ArrowDown size={17} aria-hidden="true" />Close</button>
        <button type="button" className="blinds-action" disabled={!controllable || !blinds.canRaise} onClick={() => run('open')}><ArrowUp size={17} aria-hidden="true" />Open</button>
      </div>
      <div className="blinds-presets" role="group" aria-label="Opening presets">
        {BLINDS_POSITION_PRESETS.map((preset) => <button type="button" className="blinds-preset" key={preset.value} aria-pressed={blinds.position === preset.value} disabled={!controllable} onClick={() => setPosition(preset.value)}><span>{preset.label}</span><small>{preset.value}%</small></button>)}
      </div>
    </div></div>
    <p className="blinds-feedback"><span>SIMULATION</span>Local position preview</p>
  </section>;
}
