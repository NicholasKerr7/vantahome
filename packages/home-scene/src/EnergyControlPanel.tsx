import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, BatteryCharging, Ellipsis, Power, RefreshCw, ShieldCheck, Sun, Zap } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { EnergyConsoleArtwork } from './EnergyConsoleArtwork';
import { BATTERY_RESERVE_PRESETS, BATTERY_STORAGE_OPTIONS, GENERATOR_MODE_OPTIONS, energyActionId, formatEnergyReading, readEnergyControllerState, type EnergyReading } from './energyController';
import './energy-controller.css';

const TITLES = { energy: 'ENERGY', solar: 'SOLAR', battery: 'STORAGE', generator: 'GENERATOR' } as const;
const ICONS = { energy: Zap, solar: Sun, battery: BatteryCharging, generator: Power } as const;

/** Keep each reading's units and provenance visible without implying a total from unrelated sources. */
function EnergyMetric({ reading }: { reading: EnergyReading }) {
  const formatted = formatEnergyReading(reading);
  return <div className="energy-metric"><span>{reading.label}</span><strong>{formatted.value}<small>{formatted.unit}</small></strong></div>;
}

/** Present saved choices with native buttons, allowing selection without changing device power. */
function EnergyChoices({ label, choices, selected, disabled, onChoose }: {
  label: string; choices: readonly { label: string; value: string | number }[]; selected: string | number;
  disabled: boolean; onChoose: (value: string | number) => void;
}) {
  return <div className="energy-choice-group"><span>{label}</span><div className="energy-choices" role="group" aria-label={label}>
    {choices.map((choice) => <button type="button" key={choice.value} aria-pressed={selected === choice.value} disabled={disabled} onClick={() => onChoose(choice.value)}>{choice.label}</button>)}
  </div></div>;
}

/** A selected-device energy console reads existing samples and dispatches only guarded simulation commands. */
export function EnergyController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const reserveId = useId();
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const motionDisabled = useHomeStore((state) => state.motionDisabled);
  const energy = readEnergyControllerState(device, current);

  /** Restore focus after the user intentionally enters or leaves the advanced controls. */
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);

  /** Retain every existing advanced setting in its original inspector. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }

  /** Preference writes preserve sampled charge, output, power and unrelated device settings. */
  function setValue(field: 'storageMode' | 'reservePercent' | 'generatorMode', value: number | string) { useHomeStore.getState().setDeviceSetting(device.id, field, value); }

  /** Outage and restore are local meter scenarios, not a backup transfer or hardware command. */
  function gridAction(key: Parameters<typeof energyActionId>[0]) { useHomeStore.getState().runDeviceAction(device.id, energyActionId(key)); }

  if (!energy) return null;
  if (more) return <section className="energy-more" aria-label="Additional energy settings">
    <button ref={backButton} type="button" className="energy-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to energy console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;
  const headline = formatEnergyReading(energy.headline);
  const Icon = ICONS[energy.kind];
  const preferenceNote = energy.kind === 'battery' ? 'Reserve & storage mode are saved preferences.' : energy.kind === 'generator' ? 'Start mode is saved only; it does not auto-start.' : 'Selected device samples · No live meter connected';

  return <section className="energy-workspace" aria-label={`${device.name} energy console`} data-motion-disabled={motionDisabled}>
    <div className="energy-stage"><div className="energy-console" data-kind={energy.kind} data-powered={energy.on}>
      <header className="energy-top">
        {energy.kind === 'battery' ? <button type="button" className="energy-key energy-battery-power" role="switch" aria-label={energy.on ? 'Disable battery preview' : 'Enable battery preview'} aria-checked={energy.on} disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}><Power size={21} aria-hidden="true" /></button>
          : <span className="energy-emblem"><Icon size={22} aria-hidden="true" /></span>}
        <div className="energy-brand"><span>VANTAHOME</span><strong>{TITLES[energy.kind]}</strong></div>
        <button ref={moreButton} type="button" className="energy-key" aria-label="More energy settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="energy-hero">
        <EnergyConsoleArtwork energy={energy} />
        <div className="energy-reading"><span>{energy.headline.label}</span><output aria-label={energy.headline.label} aria-live="polite">{headline.value}<small>{headline.unit}</small></output><p>{energy.status}</p></div>
      </div>
      <div className="energy-metrics">{energy.metrics.map((reading) => <EnergyMetric key={reading.label} reading={reading} />)}</div>
      {energy.kind === 'battery' && <>
        <div className="energy-reserve"><label htmlFor={reserveId}><ShieldCheck size={15} aria-hidden="true" />Backup reserve preference<strong>{energy.reservePercent}%</strong></label>
          <input id={reserveId} type="range" min="10" max="100" step="1" value={energy.reservePercent} aria-valuetext={`${energy.reservePercent}% reserve preference`} disabled={!controllable} onChange={(event) => setValue('reservePercent', Number(event.currentTarget.value))} />
          <EnergyChoices label="Reserve presets" choices={BATTERY_RESERVE_PRESETS} selected={energy.reservePercent} disabled={!controllable} onChoose={(value) => setValue('reservePercent', value)} />
        </div>
        <EnergyChoices label="Storage preference" choices={BATTERY_STORAGE_OPTIONS} selected={energy.storageMode} disabled={!controllable} onChoose={(value) => setValue('storageMode', value)} />
      </>}
      {energy.kind === 'generator' && <EnergyChoices label="Start preference" choices={GENERATOR_MODE_OPTIONS} selected={energy.mode} disabled={!controllable} onChoose={(value) => setValue('generatorMode', value)} />}
      {energy.primaryActionLabel && <button type="button" className="energy-primary" disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}>
        {energy.kind === 'generator' ? <Power size={18} aria-hidden="true" /> : <RefreshCw size={18} aria-hidden="true" />}{energy.primaryActionLabel}
      </button>}
      {energy.kind === 'energy' && <div className="energy-grid-actions" role="group" aria-label="Grid simulation">
        <button type="button" disabled={!controllable || energy.gridAvailable === false} onClick={() => gridAction('outage')}>Simulate outage</button>
        <button type="button" disabled={!controllable || energy.gridAvailable === true} onClick={() => gridAction('restoreGrid')}>Restore grid sample</button>
      </div>}
      <p className="energy-note">{preferenceNote}</p>
    </div></div>
    <p className="energy-feedback"><span>SIMULATION</span>{energy.kind === 'energy' ? 'Grid scenarios do not start backup equipment.' : energy.kind === 'battery' ? 'Reserve changes do not change the charge sample.' : energy.kind === 'solar' ? 'Sample generation does not follow live sunlight.' : 'Local generator preview'}</p>
  </section>;
}
