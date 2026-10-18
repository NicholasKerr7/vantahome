import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Droplets, Ellipsis, Minus, Plus, Power, Snowflake, Wind, type LucideIcon } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { CLIMATE_MODE_OPTIONS, CLIMATE_PRESET_OPTIONS, CLIMATE_SWING_OPTIONS, climateActionId, climatePresetCommand, formatClimateTemperature, readClimateControllerState } from './climateController';
import './climate-controller.css';

const MODE_ICONS: Record<string, LucideIcon> = { cold: Snowflake, fan: Wind, dry: Droplets };
const TEMPERATURE_TICKS = Array.from({ length: 14 }, (_, index) => {
  const angle = (135 + index * 270 / 13) * Math.PI / 180;
  return { x1: 110 + 94 * Math.cos(angle), y1: 110 + 94 * Math.sin(angle), x2: 110 + 100 * Math.cos(angle), y2: 110 + 100 * Math.sin(angle) };
});

interface KeyProps { label: string; disabled: boolean; onPress: () => void; children: ReactNode; }

/** A familiar button remains the precise, accessible way to adjust the sculpted dial. */
function ClimateKey({ label, disabled, onPress, children }: KeyProps) {
  return <button type="button" className="climate-key" aria-label={label} title={label} disabled={disabled} onClick={onPress}>{children}</button>;
}

/** Draw a bounded target-temperature arc; this is a setpoint, never measured room telemetry. */
function TemperatureRing({ progress, powered }: { progress: number; powered: boolean }) {
  const gradientId = useId();
  return <svg className="climate-ring" viewBox="0 0 220 220" aria-hidden="true">
    <defs><linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#70519B" /><stop offset=".55" stopColor="#B46BFF" /><stop offset="1" stopColor="#E9DAFF" /></linearGradient></defs>
    {TEMPERATURE_TICKS.map((tick, index) => <line key={index} {...tick} className={powered && index / 13 <= progress ? 'climate-tick is-active' : 'climate-tick'} />)}
    <path className="climate-ring-track" d="M50.6 169.4 A84 84 0 1 1 169.4 169.4" />
    <path className="climate-ring-value" d="M50.6 169.4 A84 84 0 1 1 169.4 169.4" pathLength="100" stroke={`url(#${gradientId})`} strokeDasharray={`${progress * 100} 100`} />
  </svg>;
}

/** Put everyday AC actions on one tactile surface over the existing guarded simulation. */
export function ClimateController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const modeChanged = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const swingId = useId();
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const motionDisabled = useHomeStore((state) => state.motionDisabled);
  const tempUnit = useHomeStore((state) => state.tempUnit);
  const climate = readClimateControllerState(device, current);
  const progress = (climate.targetC - climate.tempMin) / (climate.tempMax - climate.tempMin);
  const ModeIcon = MODE_ICONS[climate.mode];
  const modeLabel = CLIMATE_MODE_OPTIONS.find((option) => option.value === climate.mode)?.label;
  const airflow = Math.round(climate.airflowStrength * 100);

  /** Move focus on deliberate panel changes while preserving the sheet's initial heading focus. */
  useLayoutEffect(() => {
    if (modeChanged.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true });
  }, [more]);

  /** Advanced settings remain available without interrupting the everyday controller. */
  function changeMode(next: boolean) { modeChanged.current = true; setMore(next); }

  /** The reducer resolves each press against current state, including rapid repeated taps. */
  function step(key: Parameters<typeof climateActionId>[0]) { useHomeStore.getState().runDeviceAction(device.id, climateActionId(key)); }

  /** Shared preset commands keep exclusivity and Normal reset identical across entry points. */
  function setPreset(preset: Parameters<typeof climatePresetCommand>[0]) {
    const command = climatePresetCommand(preset);
    const store = useHomeStore.getState();
    if (command.type === 'action') store.runDeviceAction(device.id, command.actionId);
    else store.setDeviceSetting(device.id, command.field, command.value);
  }

  if (more) return <section className="climate-more" aria-label="Additional climate settings">
    <button ref={backButton} type="button" className="climate-return" onClick={() => changeMode(false)}><ArrowLeft size={18} aria-hidden="true" />Back to climate</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;

  return <section className="climate-workspace" aria-label={`${device.name} climate controller`} data-motion-disabled={motionDisabled}>
    <div className="climate-stage">
      <div className="climate-console" data-powered={climate.on} data-mode={climate.mode}>
        <div className="climate-top">
          <button type="button" className="climate-key climate-power" role="switch" aria-label={`${device.name} power`} aria-checked={climate.on} disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}><Power size={21} aria-hidden="true" /></button>
          <div className="climate-brand" aria-hidden="true"><span>VANTAHOME</span><strong>CLIMATE</strong></div>
          <button ref={moreButton} type="button" className="climate-key" aria-label="More climate settings" title="More climate settings" onClick={() => changeMode(true)}><Ellipsis size={22} aria-hidden="true" /></button>
        </div>
        <div className="climate-dial">
          <div className="climate-dial-face" />
          <TemperatureRing progress={progress} powered={climate.on} />
          <div className="climate-reading">
            <span className="climate-caption">TARGET TEMPERATURE</span>
            <output aria-label={`Target temperature in degrees ${tempUnit === 'F' ? 'Fahrenheit' : 'Celsius'}`} aria-live="polite">{formatClimateTemperature(climate.targetC, tempUnit)}<small>°{tempUnit}</small></output>
            <span className="climate-mode-label"><ModeIcon size={13} aria-hidden="true" />{climate.on ? `${modeLabel} mode` : 'Standby'}</span>
          </div>
          <div className="climate-temperature-keys" role="group" aria-label={tempUnit === 'F' ? 'Target temperature, steps of 1.8 degrees Fahrenheit' : 'Target temperature, steps of 1 degree Celsius'}>
            <ClimateKey label="Decrease target temperature" disabled={!controllable || climate.targetC <= climate.tempMin} onPress={() => step('temperatureDown')}><Minus size={22} aria-hidden="true" /></ClimateKey>
            <ClimateKey label="Increase target temperature" disabled={!controllable || climate.targetC >= climate.tempMax} onPress={() => step('temperatureUp')}><Plus size={22} aria-hidden="true" /></ClimateKey>
          </div>
        </div>
        <div className="climate-modes" role="group" aria-label="Climate mode">
          {CLIMATE_MODE_OPTIONS.map((option) => {
            const Icon = MODE_ICONS[option.value];
            return <button type="button" key={option.value} className="climate-mode-key" aria-pressed={climate.mode === option.value} disabled={!controllable} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'mode', option.value)}><Icon size={17} aria-hidden="true" /><span>{option.label}</span></button>;
          })}
        </div>
        <div className="climate-air-controls">
          <div className="climate-fan"><span className="climate-caption">FAN SETTING</span><div className="climate-fan-keys" role="group" aria-label="Fan speed">
            <ClimateKey label="Decrease fan speed" disabled={!controllable || climate.fanSpeed <= climate.fanMin} onPress={() => step('fanDown')}><Minus size={18} aria-hidden="true" /></ClimateKey>
            <output aria-label="Fan speed percentage">{climate.fanSpeed}<small>%</small></output>
            <ClimateKey label="Increase fan speed" disabled={!controllable || climate.fanSpeed >= climate.fanMax} onPress={() => step('fanUp')}><Plus size={18} aria-hidden="true" /></ClimateKey>
          </div></div>
          <div className="climate-swing"><label className="climate-caption" htmlFor={swingId}>SWING</label><select id={swingId} aria-label="Airflow swing" value={climate.swing} disabled={!controllable} onChange={(event) => useHomeStore.getState().setDeviceSetting(device.id, 'acSwingMode', event.currentTarget.value)}>{CLIMATE_SWING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
        </div>
        <div className="climate-presets" role="group" aria-label="Airflow preset">
          {CLIMATE_PRESET_OPTIONS.map((option) => <button type="button" key={option.value} className="climate-preset-key" aria-pressed={climate.preset === option.value} disabled={!controllable} onClick={() => setPreset(option.value)}>{option.label}</button>)}
        </div>
        <div className="climate-vent" key={`${climate.on}-${climate.mode}-${airflow}-${climate.swing}`} aria-hidden="true" data-flowing={airflow > 0}>
          <span /><span /><span /><span /><span /><span /><span /><span />
        </div>
      </div>
    </div>
    <p className="climate-feedback" aria-live="polite"><span>SIMULATION</span>{climate.on ? `Preview airflow ${airflow}% · ${modeLabel} mode` : 'Power off · Your settings are remembered'}</p>
  </section>;
}
