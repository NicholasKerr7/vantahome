import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, Lightbulb, Minus, Plus, Power } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { LIGHT_COLOR_PRESETS, LIGHT_WHITE_PRESETS, lightingActionId, readLightingControllerState } from './lightingController';
import './lighting-controller.css';

const DIAL_TICKS = Array.from({ length: 32 }, (_, index) => {
  const angle = index * Math.PI / 16;
  return { x1: 120 + 103 * Math.cos(angle), y1: 120 + 103 * Math.sin(angle), x2: 120 + 108 * Math.cos(angle), y2: 120 + 108 * Math.sin(angle) };
});

/** Opal glass, a dimmer arc and a bounded glow reflect the same appearance as the house lights. */
function LightDial({ color, brightness, previewBrightness }: { color: string; brightness: number; previewBrightness: number }) {
  const id = useId();
  const glow = previewBrightness / 100;
  return <svg className="lighting-dial-art" viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-halo`}><stop stopColor={color} stopOpacity={glow * .55} /><stop offset=".72" stopColor={color} stopOpacity={glow * .16} /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#D0BEDF" /><stop offset=".18" stopColor="#645570" /><stop offset=".53" stopColor="#1A1126" /><stop offset="1" stopColor="#8A739E" /></linearGradient>
      <radialGradient id={`${id}-glass`} cx=".35" cy=".2" r=".8"><stop stopColor="#4B3D59" /><stop offset=".62" stopColor="#21172E" /><stop offset="1" stopColor="#0D0816" /></radialGradient>
      <radialGradient id={`${id}-light`} cx=".5" cy=".85" r=".9"><stop stopColor={color} stopOpacity={glow * .3} /><stop offset="1" stopColor={color} stopOpacity="0" /></radialGradient>
    </defs>
    <circle cx="120" cy="120" r="120" fill={`url(#${id}-halo)`} />
    {DIAL_TICKS.map((tick, index) => <line key={index} {...tick} stroke="#9F8DAF" opacity=".35" strokeWidth="1" />)}
    <circle cx="120" cy="120" r="95" fill={`url(#${id}-rim)`} stroke="#AE95C3" strokeWidth=".7" />
    <circle cx="120" cy="120" r="89" fill={`url(#${id}-glass)`} stroke="#191021" strokeWidth="3" />
    <circle cx="120" cy="120" r="88" fill={`url(#${id}-light)`} />
    <circle cx="120" cy="120" r="94" className="lighting-ring-track" />
    <circle cx="120" cy="120" r="94" className="lighting-ring-value" stroke={previewBrightness > 0 ? color : '#7C6C8D'} pathLength="100" strokeDasharray={`${brightness} 100`} transform="rotate(-90 120 120)" />
    <path d="M61 70 Q112 33 173 72" fill="none" stroke="#FFFFFF" strokeWidth="2" opacity=".12" />
  </svg>;
}

/** Everyday lighting controls share canonical power, color and brightness with Home and Devices. */
export function LightingController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const panelChanged = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const brightnessId = useId();
  const temperatureId = useId();
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const motionDisabled = useHomeStore((state) => state.motionDisabled);
  const light = readLightingControllerState(device, current);
  const manual = light.effect === 'none';

  /** Restore keyboard focus only after a deliberate trip into or out of advanced settings. */
  useLayoutEffect(() => {
    if (panelChanged.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true });
  }, [more]);

  /** Preserve advanced controls and their existing pagination without copying device state. */
  function changePanel(next: boolean) { panelChanged.current = true; setMore(next); }

  /** Relative brightness actions read current state, so rapid taps cannot overwrite one another. */
  function run(key: Parameters<typeof lightingActionId>[0]) { useHomeStore.getState().runDeviceAction(device.id, lightingActionId(key)); }

  /** Manual colors and white temperatures clear effects while preserving the light's power. */
  function setValue(field: 'brightness' | 'color' | 'colorTempK', value: number | string) { useHomeStore.getState().setDeviceSetting(device.id, field, value); }

  if (more) return <section className="lighting-more" aria-label="Additional lighting settings">
    <button ref={backButton} type="button" className="lighting-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to lighting</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;

  return <section className="lighting-workspace" aria-label={`${device.name} lighting controller`} data-motion-disabled={motionDisabled}>
    <div className="lighting-stage"><div className="lighting-console" data-powered={light.on} data-lit={light.previewBrightness > 0}>
      <header className="lighting-top">
        <button type="button" className="lighting-key lighting-power" role="switch" aria-label={`${device.name} power`} aria-checked={light.on} disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}><Power size={21} aria-hidden="true" /></button>
        <div className="lighting-brand"><span>VANTAHOME</span><strong>LIGHTING</strong></div>
        <button ref={moreButton} type="button" className="lighting-key" aria-label="More lighting settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="lighting-dial">
        <LightDial color={light.previewColor} brightness={light.brightness} previewBrightness={light.previewBrightness} />
        <div className="lighting-reading">
          <Lightbulb size={22} className="lighting-bulb" aria-hidden="true" />
          <output aria-label="Saved brightness percentage" aria-live="polite">{light.brightness}<small>%</small></output>
          <span>BRIGHTNESS</span>
          <p>{!light.on ? 'Power off' : light.brightness === 0 ? 'On · zero brightness' : light.effectLabel ? `${light.effectLabel} effect` : light.colorMode === 'temperature' ? `${light.temperatureK} K white` : 'Color light'}</p>
        </div>
      </div>
      <div className="lighting-adjustment" role="group" aria-label="Brightness">
        <label className="sr-only" htmlFor={brightnessId}>Light brightness</label>
        <button type="button" className="lighting-key" aria-label="Dim light by 5 percent" disabled={!controllable || light.brightness === 0} onClick={() => run('dimmer')}><Minus size={21} aria-hidden="true" /></button>
        <input id={brightnessId} type="range" min="0" max="100" step="1" value={light.brightness} aria-valuetext={`${light.brightness}% brightness`} disabled={!controllable} onChange={(event) => setValue('brightness', Number(event.currentTarget.value))} />
        <button type="button" className="lighting-key" aria-label="Brighten light by 5 percent" disabled={!controllable || light.brightness === 100} onClick={() => run('brighter')}><Plus size={21} aria-hidden="true" /></button>
      </div>
      <div className="lighting-modes" role="group" aria-label="Light palette">
        <button type="button" aria-pressed={manual && light.colorMode === 'temperature'} disabled={!controllable} onClick={() => run('white')}>White</button>
        <button type="button" aria-pressed={manual && light.colorMode === 'color'} disabled={!controllable} onClick={() => run('color')}>Color</button>
      </div>
      {light.colorMode === 'temperature' ? <div className="lighting-palette lighting-white" role="group" aria-label="White temperature">
        <label className="sr-only" htmlFor={temperatureId}>White temperature</label>
        <input id={temperatureId} type="range" min="2000" max="6500" step="100" value={light.temperatureK} aria-valuetext={`${light.temperatureK} kelvin`} disabled={!controllable} onChange={(event) => setValue('colorTempK', Number(event.currentTarget.value))} />
        <div className="lighting-white-presets">{LIGHT_WHITE_PRESETS.map((preset) => <button type="button" key={preset.value} aria-pressed={manual && light.temperatureK === preset.value} disabled={!controllable} onClick={() => setValue('colorTempK', preset.value)}><span>{preset.label}</span><small>{preset.value} K</small></button>)}</div>
      </div> : <div className="lighting-palette lighting-colors" role="group" aria-label="Light colors">
        {LIGHT_COLOR_PRESETS.map((preset) => <button type="button" key={preset.value} aria-pressed={manual && light.color.toUpperCase() === preset.value.toUpperCase()} disabled={!controllable} onClick={() => setValue('color', preset.value)}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill={preset.value} /></svg><span>{preset.label}</span></button>)}
      </div>}
    </div></div>
    <p className="lighting-feedback"><span>SIMULATION</span>{!light.on ? 'Power off · Your settings are remembered' : light.effectLabel ? `${light.effectLabel} effect · Local light preview` : 'Local light preview'}</p>
  </section>;
}
