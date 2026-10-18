import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, ChevronLeft, ChevronRight, Ellipsis, Hand, Play, ShieldCheck } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { canControlSceneDevice } from './sceneAccess';
import { useHomeStore } from './state';
import { PagedDeviceControls } from './PagedDeviceControls';
import { gateActionId, readGateControllerState, type GateControllerKey } from './gateController';
import './gate-controller.css';

/** A single sliding leaf follows accepted position, matching the property's existing gate mechanism. */
function GateArtwork({ position }: { position: number | null }) {
  const id = useId();
  return <svg className="gate-artwork" viewBox="0 0 280 160" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-metal`} gradientUnits="userSpaceOnUse" x1="40" y1="35" x2="230" y2="130"><stop stopColor="#BCABD2" /><stop offset=".13" stopColor="#665174" /><stop offset=".56" stopColor="#2F223D" /><stop offset="1" stopColor="#80658D" /></linearGradient>
      <linearGradient id={`${id}-road`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#37283D" /><stop offset="1" stopColor="#110B1C" /></linearGradient>
      <radialGradient id={`${id}-glow`}><stop stopColor="#B48ADA" stopOpacity=".3" /><stop offset="1" stopColor="#B48ADA" stopOpacity="0" /></radialGradient>
      <clipPath id={`${id}-opening`}><rect x="59" y="38" width="162" height="94" /></clipPath>
    </defs>
    <ellipse cx="140" cy="119" rx="131" ry="38" fill={`url(#${id}-glow)`} />
    <path d="M86 29H194L264 155H16Z" fill={`url(#${id}-road)`} stroke="#7D618637" />
    <path d="M97 45H183M85 67H195M72 92H208M58 121H222M113 30L91 153M167 30L189 153" fill="none" stroke="#BA9FC51C" />
    <path d="M111 30V14L140 4L170 14V30M117 29V18H163V29" fill="#302039" stroke="#866994" strokeWidth="1" />
    <path d="M16 126H264M16 130H264" stroke="#9E84B0" strokeWidth="1" opacity=".5" />
    <g clipPath={`url(#${id}-opening)`} opacity={position === null ? .3 : 1}>
      <g transform={`translate(${-162 * (position ?? 0) / 100} 0)`} data-testid="gate-sliding-leaf">
        <rect x="59" y="44" width="162" height="82" rx="2" fill="#251A32" stroke="#B49BC7" strokeWidth="2" />
        {Array.from({ length: 20 }, (_, index) => <path key={index} d={`M${65 + index * 8} 49V122`} stroke={`url(#${id}-metal)`} strokeWidth="4" />)}
        <path d="M60 46H221M60 118H221" stroke="#C2A6D7" strokeWidth="2" />
        <rect x="207" y="77" width="5" height="15" rx="2" fill="#D7C3E5" />
      </g>
    </g>
    <path d="M8 77H42V128H8ZM238 77H272V128H238Z" fill="#29202E" stroke="#675071" />
    {[42, 222].map((x) => <g key={x}>
      <rect x={x} y="36" width="16" height="94" rx="2" fill={`url(#${id}-metal)`} stroke="#A28AAF" />
      <path d={`M${x - 3} 36H${x + 19}L${x + 16} 31H${x}Z`} fill="#AB91BF" />
      <rect x={x + 3} y="45" width="10" height="4" rx="1" fill="#E3C8FB" />
      <rect x={x + 4} y="88" width="8" height="13" rx="2" fill="#1C1426" stroke="#876D99" />
    </g>)}
    <path d="M45 137H236" stroke="#B78CD3" strokeWidth="1" opacity=".4" />
  </svg>;
}

/** Keep local sensor scenarios explicit; unknown values never look like verified clearance. */
function GateIndicator({ label, value, clear, blocked }: { label: string; value: boolean | null; clear: string; blocked: string }) {
  return <div className="gate-indicator" data-alert={value !== false}><span>{label}</span><strong>{value === null ? 'Unknown' : value ? blocked : clear}</strong></div>;
}

/** Present current gate state and existing guarded commands without adding a second motion clock. */
export function GateController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const motionDisabled = useHomeStore((state) => state.motionDisabled);
  const gate = readGateControllerState(device, current);

  /** Return keyboard focus only after a deliberate More/Back transition. */
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);

  /** Preserve all precise position, timer and safety-scenario settings in the existing inspector. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }

  /** Resolve authority at dispatch through the same store path as other gate controls. */
  function run(key: GateControllerKey) { useHomeStore.getState().runDeviceAction(device.id, gateActionId(key)); }

  if (!gate) return null;
  if (more) return <section className="gate-more" aria-label="Additional gate settings"><button ref={backButton} type="button" className="gate-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to gate console</button><PagedDeviceControls device={device} current={current} /></section>;
  const held = gate.holdOpen || gate.emergencyHold;
  const timer = gate.countdownSec !== null ? `${Math.ceil(gate.countdownSec)}s` : gate.paused ? 'Paused' : gate.autoCloseEnabled ? `${gate.autoCloseDelaySec}s delay` : 'Off';
  return <section className="gate-workspace" aria-label={`${device.name} gate console`} data-motion-disabled={motionDisabled}>
    <div className="gate-stage"><div className="gate-console">
      <header className="gate-top"><span className="gate-emblem"><ArrowLeftRight size={23} aria-hidden="true" /></span><div className="gate-brand"><span>VANTAHOME</span><strong>ARRIVAL</strong></div><button ref={moreButton} type="button" className="gate-key" aria-label="More gate settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button></header>
      <div className="gate-visual"><GateArtwork position={gate.position} /><div className="gate-reading"><div><span>OPEN POSITION</span><output aria-label="Gate opening percentage" aria-live="off">{gate.position === null ? '—' : Math.round(gate.position)}<small>%</small></output></div><p>{gate.status}</p></div></div>
      <div className="gate-sensors" role="group" aria-label="Simulated safety inputs"><GateIndicator label="Safety beam" value={gate.beamBlocked} clear="Clear" blocked="Blocked" /><GateIndicator label="Vehicle zone" value={gate.vehiclePresent} clear="Clear" blocked="Occupied" /><GateIndicator label="Sensor" value={gate.sensorFault} clear="Ready" blocked="Fault" /></div>
      <div className="gate-timer"><ShieldCheck size={18} aria-hidden="true" /><div><span>Auto-close preview</span><small>{held ? gate.emergencyHold ? 'Emergency hold' : 'Held open' : gate.countdownSec !== null ? 'Clearance countdown' : 'Runs only while preview is active'}</small></div><strong>{timer}</strong></div>
      <div className="gate-actions" role="group" aria-label="Gate movement"><button type="button" disabled={!controllable || !gate.canOpen} onClick={() => run('open')}><ChevronLeft size={20} aria-hidden="true" />Open</button><button type="button" disabled={!controllable || !gate.canClose} onClick={() => run('close')}>Close<ChevronRight size={20} aria-hidden="true" /></button></div>
      <div className="gate-secondary"><button type="button" className="gate-hold" aria-pressed={held} disabled={!controllable || (held ? !gate.canReleaseHold : !gate.canHoldOpen)} onClick={() => run(held ? 'releaseHold' : 'holdOpen')}><Hand size={17} aria-hidden="true" />{held ? 'Release hold' : 'Hold open'}</button>{gate.canResume && <button type="button" disabled={!controllable} onClick={() => run('resume')}><Play size={17} aria-hidden="true" />Resume auto-close</button>}</div>
    </div></div>
    <p className="gate-feedback" data-safety={gate.safety}><span>LOCAL SIMULATION</span>{gate.closeBlockReason ?? gate.safetyLabel}</p>
  </section>;
}
