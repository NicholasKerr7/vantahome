import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, Flame, LockKeyhole, UnlockKeyhole } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { canSampleGas, formatGasSample, GAS_METER_PREVIEW_NOTE, gasMeterStatus, getGasMeterSnapshot } from './gasMeterController';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { GasMeterConsoleArtwork } from './GasMeterConsoleArtwork';
import './gas-meter-controller.css';

/** Present bounded samples and explicit valve commands without treating monitoring as switchable power. */
export function GasMeterController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null), backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const meter = getGasMeterSnapshot(current);
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);
  /** Return focus to the key that opened advanced controls. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  /** Use canonical commands so permissions and linked gas interlocks remain authoritative. */
  function run(action: string) { useHomeStore.getState().runDeviceAction(device.id, `gas-meter-${action}`); }
  if (more) return <section className="gas-meter-more" aria-label="Additional gas meter settings">
    <button ref={backButton} className="gas-meter-return" type="button" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to gas meter console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;
  return <section className="gas-meter-workspace" aria-label={`${device.name} gas meter console`} data-motion-disabled={reduced}>
    <div className="gas-meter-stage"><div className="gas-meter-console" data-interlocked={meter.interlocked === true}>
      <header className="gas-meter-top"><span className="gas-meter-mark" aria-hidden="true"><Flame size={25} /></span>
        <div className="gas-meter-brand"><span>VANTAHOME</span><strong>GAS SUPPLY</strong></div>
        <button ref={moreButton} type="button" className="gas-meter-round" aria-label="More gas meter settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <GasMeterConsoleArtwork meter={meter} />
      <div className="gas-meter-readout"><div><span>DEMO LPG REMAINING</span><output aria-label="Demo gas remaining">{formatGasSample(meter.remainingKg)}<small> kg</small></output></div><div className="gas-meter-capacity"><strong>{meter.remainingPercent ?? '—'}%</strong><small>of 12.5 kg supply</small></div></div>
      <p className="gas-meter-status" role="status">{gasMeterStatus(meter)}</p>
      <div className="gas-meter-metrics" aria-label="Gas sample readings">
        {([['Today', meter.todayKg, 'kg'], ['This month', meter.monthKg, 'kg'], ['Last sample flow', meter.flowKgH, 'kg/h']] as const).map(([label, value, unit]) => <div key={label}><span>{label}</span><output aria-label={`${label} sample`}>{formatGasSample(value)}<small>{unit}</small></output></div>)}
      </div>
      <div className="gas-meter-actions" role="group" aria-label="Preview supply valve">
        <button type="button" disabled={!controllable || meter.valveOpen !== false || meter.interlocked !== false} onClick={() => run('open-valve')}><UnlockKeyhole size={16} aria-hidden="true" />Open preview valve</button>
        <button type="button" disabled={!controllable || meter.valveOpen !== true} onClick={() => run('close-valve')}><LockKeyhole size={16} aria-hidden="true" />Close preview valve</button>
      </div>
      <div className="gas-meter-actions">
        <button type="button" className="gas-meter-primary" disabled={!controllable || !canSampleGas(meter)} onClick={() => run('use-sample')}>Simulate 30m usage</button>
        <button type="button" disabled={!controllable} onClick={() => run('refill')}>Refill demo supply</button>
      </div>
      <div className="gas-meter-alerts" role="group" aria-label="Saved gas alert preferences">
        {([['Usage alerts', 'gasUsageAlerts', meter.usageAlerts], ['Refill alerts', 'gasRefillAlerts', meter.refillAlerts]] as const).map(([label, field, enabled]) => <button key={field} type="button" role="switch" aria-checked={enabled === true} aria-label={`${label}${enabled === null ? ' unavailable' : ''}`} disabled={!controllable || enabled === null} onClick={() => useHomeStore.getState().setDeviceSetting(device.id, field, !enabled)}><span>{label}</span><strong>{enabled === null ? '—' : enabled ? 'On' : 'Off'}</strong></button>)}
      </div>
    </div></div><p className="gas-meter-feedback">{GAS_METER_PREVIEW_NOTE}</p>
  </section>;
}
