import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, Minus, Plus, Power, RefreshCw, Repeat2 } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { formatClimateTemperature } from './climateController';
import { WATER_HEATER_MODE_OPTIONS, readWaterControllerState, waterControllerActionId } from './waterController';
import { WaterConsoleArtwork } from './WaterConsoleArtwork';
import './water-controller.css';

/** A compact readout keeps unavailable samples visibly distinct from actual zero. */
function WaterMetric({ label, value, unit }: { label: string; value: number | string | null; unit: string }) {
  return <div className="water-metric"><span>{label}</span><strong>{value ?? '—'}{value !== null && <small>{unit}</small>}</strong></div>;
}

/** Everyday water controls share the existing validated, persisted device state. */
export function WaterController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const motionDisabled = useHomeStore((state) => state.motionDisabled);
  const tempUnit = useHomeStore((state) => state.tempUnit);
  const water = readWaterControllerState(device, current);

  /** Move focus only after an intentional More/Back navigation. */
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);

  /** Keep every original advanced setting available without remounting the device. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }

  /** Relative actions resolve against the latest state, even during rapid taps. */
  function step(key: Parameters<typeof waterControllerActionId>[0]) { useHomeStore.getState().runDeviceAction(device.id, waterControllerActionId(key)); }

  /** Mode and alert preferences never change device power or measured samples. */
  function setValue(field: 'heaterMode' | 'recirculation' | 'waterLeakAlerts' | 'waterPressureAlerts', value: string | boolean) { useHomeStore.getState().setDeviceSetting(device.id, field, value); }

  if (!water) return null;
  if (more) return <section className="water-more" aria-label="Additional water settings">
    <button ref={backButton} type="button" className="water-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to water console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;

  return <section className="water-workspace" aria-label={`${device.name} water console`} data-motion-disabled={motionDisabled}>
    <div className="water-stage"><div className="water-console" data-kind={water.kind} data-powered={water.on}>
      <header className="water-top">
        {water.kind === 'water-heater' ? <button type="button" className="water-key water-power" role="switch" aria-label={`${device.name} power`} aria-checked={water.on} disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}><Power size={21} aria-hidden="true" /></button>
          : <button type="button" className="water-key water-sample-key" aria-label="Check sample" title="Check sample" disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}><RefreshCw size={17} aria-hidden="true" /><span>Sample</span></button>}
        <div className="water-brand"><span>VANTAHOME</span><strong>{water.kind === 'water-heater' ? 'HOT WATER' : 'WATER METER'}</strong></div>
        <button ref={moreButton} type="button" className="water-key" aria-label="More water settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="water-hero">
        <WaterConsoleArtwork water={water} />
        <div className="water-reading">
          <span>{water.kind === 'water-heater' ? 'TARGET TEMPERATURE' : 'FLOW SAMPLE'}</span>
          <output aria-live="off" aria-label={water.kind === 'water-heater' ? `Target temperature in degrees ${tempUnit === 'F' ? 'Fahrenheit' : 'Celsius'}` : 'Flow sample in litres per minute'}>
            {water.kind === 'water-heater' ? formatClimateTemperature(water.targetC, tempUnit) : water.flowLpm ?? '—'}
            <small>{water.kind === 'water-heater' ? `°${tempUnit}` : water.flowLpm === null ? '' : 'L/min'}</small>
          </output>
          <p>{water.status}</p>
          {water.kind === 'water-heater' && <div className="water-temperature-keys" role="group" aria-label={tempUnit === 'F' ? 'Target temperature, steps of 1.8 degrees Fahrenheit' : 'Target temperature, steps of 1 degree Celsius'}>
            <button type="button" className="water-key" aria-label="Decrease water target temperature" disabled={!controllable || water.targetC <= water.tempMin} onClick={() => step('temperatureDown')}><Minus size={21} aria-hidden="true" /></button>
            <button type="button" className="water-key" aria-label="Increase water target temperature" disabled={!controllable || water.targetC >= water.tempMax} onClick={() => step('temperatureUp')}><Plus size={21} aria-hidden="true" /></button>
          </div>}
        </div>
      </div>
      {water.kind === 'water-heater' ? <>
        <div className="water-section"><span>HEATING MODE PREFERENCE</span><div className="water-modes" role="group" aria-label="Water heater mode">
          {WATER_HEATER_MODE_OPTIONS.map((option) => <button type="button" key={option.value} aria-pressed={water.mode === option.value} disabled={!controllable} onClick={() => setValue('heaterMode', option.value)}>{option.label}</button>)}
        </div></div>
        <button type="button" className="water-preference" role="switch" aria-label="Recirculation preference" aria-checked={water.recirculation} disabled={!controllable} onClick={() => setValue('recirculation', !water.recirculation)}>
          <Repeat2 size={19} aria-hidden="true" /><span>Recirculation<small>Saved preference</small></span><strong>{water.recirculation ? 'On' : 'Off'}</strong>
        </button>
        <p className="water-note">Target and modes are saved settings.<br />No tank temperature or heat-up time is measured.</p>
      </> : <>
        <div className="water-metrics">
          <WaterMetric label="Today · sample" value={water.todayL} unit="L" />
          <WaterMetric label="Pressure · sample" value={water.pressurePsi} unit="psi" />
          <WaterMetric label="Water · sample" value={water.temperatureC === null ? null : formatClimateTemperature(water.temperatureC, tempUnit)} unit={`°${tempUnit}`} />
        </div>
        <p className="water-leak-state" data-alert={water.leakDetected === true} role="status">
          <span aria-hidden="true" />{water.leakDetected === null ? 'Leak sample unavailable' : water.leakDetected ? 'Leak detected in sample' : 'No leak detected in sample'}
        </p>
        <div className="water-budget">
          <span>USAGE BUDGET<small>Saved preference</small></span>
          <div role="group" aria-label="Water usage budget">
            <button type="button" className="water-key" aria-label="Decrease water budget" disabled={!controllable || water.budgetL <= water.budgetMin} onClick={() => step('budgetDown')}><Minus size={18} aria-hidden="true" /></button>
            <output aria-label="Water usage budget in litres" aria-live="off">{water.budgetL}<small>L</small></output>
            <button type="button" className="water-key" aria-label="Increase water budget" disabled={!controllable || water.budgetL >= water.budgetMax} onClick={() => step('budgetUp')}><Plus size={18} aria-hidden="true" /></button>
          </div>
        </div>
        <div className="water-alerts">
          <button type="button" role="switch" aria-label="Leak alert preference" aria-checked={water.leakAlerts} disabled={!controllable} onClick={() => setValue('waterLeakAlerts', !water.leakAlerts)}>Leak alerts <strong>{water.leakAlerts ? 'On' : 'Off'}</strong></button>
          <button type="button" role="switch" aria-label="Pressure alert preference" aria-checked={water.pressureAlerts} disabled={!controllable} onClick={() => setValue('waterPressureAlerts', !water.pressureAlerts)}>Pressure alerts <strong>{water.pressureAlerts ? 'On' : 'Off'}</strong></button>
        </div>
        <p className="water-note">Alerts and automatic shutoff are saved preferences.<br />No live meter or shutoff valve is connected.</p>
      </>}
    </div></div>
    <p className="water-feedback"><span>SIMULATION</span>{water.kind === 'water-heater' ? water.on ? 'Heater enabled · Saved settings preview' : 'Power off · Your settings are remembered' : 'Selected meter samples · Saved locally'}</p>
  </section>;
}
