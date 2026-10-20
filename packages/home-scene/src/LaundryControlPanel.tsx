import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, Pause, Play, Square, WashingMachine, Wind } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState, SettingValue } from './simulationTypes';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import {
  DRYER_DRYNESS_OPTIONS, DRYER_HEAT_OPTIONS, LAUNDRY_CYCLE_OPTIONS, WASHER_SPIN_OPTIONS,
  WASHER_TEMPERATURE_OPTIONS, laundryControllerActionId, readLaundryControllerState, readLaundryInstallation,
  type LaundryControllerKey,
} from './laundryController';
import { LaundryConsoleArtwork, LaundryStackIndicator } from './LaundryConsoleArtwork';
import './laundry-controller.css';

interface PreferenceProps {
  label: string; value: string | number | null; disabled: boolean;
  options: readonly { label: string; value: string | number }[];
  onChange: (value: string | number) => void;
}

/** Native selects keep complete preference choices reachable without a second control page. */
function LaundryPreference({ label, value, options, disabled, onChange }: PreferenceProps) {
  return <label><span className="laundry-caption">{label}</span><select aria-label={label} value={value ?? ''} disabled={disabled}
    onChange={(event) => { const selected = options.find((option) => String(option.value) === event.target.value); if (selected) onChange(selected.value); }}>
    {value === null && <option value="" disabled>Unavailable</option>}
    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></label>;
}

/** A laundry station presents one independent appliance and its saved settings, even when physically stacked. */
export function LaundryController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const laundry = readLaundryControllerState(device, current);
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);

  /** Preserve every advanced control and restore focus on deliberate panel changes. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  /** Each command addresses this machine only; the reducer enforces the current grant. */
  function run(key: LaundryControllerKey) {
    if (laundry) useHomeStore.getState().runDeviceAction(device.id, laundryControllerActionId(laundry.kind, key));
  }
  /** Preferences preserve accepted activity and the other machine's independent state. */
  function choose(field: string, value: SettingValue) { useHomeStore.getState().setDeviceSetting(device.id, field, value); }

  if (!laundry) return null;
  if (more) return <section className="laundry-more" aria-label="Additional laundry settings">
    <button ref={backButton} type="button" className="laundry-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to laundry console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;
  const dryer = laundry.kind === 'dryer';
  const stacked = readLaundryInstallation(device) === 'stacked';
  const PrimaryIcon = laundry.on ? Pause : Play;
  const MachineIcon = dryer ? Wind : WashingMachine;
  const primaryLabel = laundry.on ? 'Pause cycle' : laundry.activity === 'paused' ? 'Resume cycle' : 'Start cycle';
  const lintWarning = dryer && laundry.lintFilterOk === false;
  return <section className="laundry-workspace" aria-label={`${device.name} laundry console`} data-motion-disabled={reduced}>
    <div className="laundry-stage"><div className="laundry-console">
      <header className="laundry-top">
        <span className="laundry-emblem" aria-hidden="true"><MachineIcon size={22} /></span>
        <div className="laundry-brand"><span>VANTAHOME</span><strong>LAUNDRY</strong></div>
        <button ref={moreButton} type="button" className="laundry-round" aria-label="More laundry settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="laundry-hero" data-stacked={stacked}>
        <LaundryConsoleArtwork running={laundry.on} reduced={reduced} dryer={dryer} />
        {stacked && <LaundryStackIndicator dryer={dryer} />}
        <div className="laundry-readout">
          <div><strong>{laundry.status}</strong><span>{stacked ? dryer ? 'Upper dryer · Independent controls' : 'Lower washer · Independent controls' : dryer ? 'Dryer controls' : 'Washer controls'}</span></div>
          <div className="laundry-samples"><strong>{laundry.remainingMin === null ? '—' : `${laundry.remainingMin} min`}</strong><span>{laundry.progressPercent === null ? 'Progress unavailable' : `${laundry.progressPercent}% progress`} · Sample</span></div>
        </div>
      </div>
      <div className="laundry-actions" role="group" aria-label="Laundry cycle activity">
        <button type="button" className="laundry-primary" disabled={!controllable} onClick={() => run(laundry.on ? 'pause' : 'start')}><PrimaryIcon size={18} aria-hidden="true" />{primaryLabel}</button>
        <button type="button" disabled={!controllable || (!laundry.on && laundry.activity !== 'paused')} onClick={() => run('stop')}><Square size={16} aria-hidden="true" />Stop cycle</button>
      </div>
      <div className="laundry-cycles"><span className="laundry-caption">CYCLE PREFERENCE</span><div className="laundry-cycle-rail" role="group" aria-label="Cycle preference">
        {LAUNDRY_CYCLE_OPTIONS[laundry.kind].map((option) => <button type="button" key={option.value} aria-pressed={laundry.cycle === option.value}
          disabled={!controllable} onClick={() => choose('cycle', option.value)}>{option.label}</button>)}
      </div></div>
      <div className="laundry-preferences">
        <LaundryPreference label={dryer ? 'Heat preference' : 'Temperature preference'} value={dryer ? laundry.heatLevel : laundry.washTemp}
          options={dryer ? DRYER_HEAT_OPTIONS : WASHER_TEMPERATURE_OPTIONS} disabled={!controllable} onChange={(value) => choose(dryer ? 'heatLevel' : 'washTemp', value)} />
        <LaundryPreference label={dryer ? 'Dryness preference' : 'Spin preference'} value={dryer ? laundry.drynessLevel : laundry.spinSpeedRpm}
          options={dryer ? DRYER_DRYNESS_OPTIONS : WASHER_SPIN_OPTIONS} disabled={!controllable} onChange={(value) => choose(dryer ? 'drynessLevel' : 'spinSpeedRpm', value)} />
      </div>
      <p className="laundry-note">Saved preferences · Time and progress are fixed samples.</p>
    </div></div>
    <p className="laundry-feedback" role={lintWarning ? 'status' : undefined}><span>{lintWarning ? 'MAINTENANCE SAMPLE' : 'SIMULATION'}</span>{lintWarning ? 'Dryer sample indicates the lint filter needs cleaning' : 'Separate machines · Settings remembered independently'}</p>
  </section>;
}
