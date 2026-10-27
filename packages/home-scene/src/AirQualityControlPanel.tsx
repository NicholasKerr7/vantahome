import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Ellipsis, Radar, RefreshCw, Bell } from 'lucide-react';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import { AIR_AQI_PRESETS, AIR_QUALITY_NOTE, readAirQualityControllerState } from './airQualityController';
import { useHomeStore } from './state';
import { canControlSceneDevice } from './sceneAccess';
import { PagedDeviceControls } from './PagedDeviceControls';
import { AirQualityConsoleArtwork } from './AirQualityConsoleArtwork';
import './air-quality-controller.css';

/** Expose unavailable values as unavailable, while preserving a real zero sample. */
function AirMetric({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return <div className="air-quality-metric"><span>{label}</span><strong>{value ?? '—'}{value !== null && <small>{unit}</small>}</strong></div>;
}

/** Read-only air samples and saved alert preferences share the existing guarded device state. */
export function AirQualityController({ device, current }: { device: DeviceDefinition; current: DeviceState }) {
  const [more, setMore] = useState(false);
  const changed = useRef(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const controllable = useHomeStore((state) => canControlSceneDevice(state.access, device.id));
  const reduced = useHomeStore((state) => state.motionDisabled);
  const air = readAirQualityControllerState(device, current);
  useLayoutEffect(() => { if (changed.current) (more ? backButton : moreButton).current?.focus({ preventScroll: true }); }, [more]);
  /** Restore focus after intentional navigation to or from the original advanced controls. */
  function changePanel(next: boolean) { changed.current = true; setMore(next); }
  if (!air) return null;
  if (more) return <section className="air-quality-more" aria-label="Additional air quality settings">
    <button type="button" ref={backButton} className="air-quality-return" onClick={() => changePanel(false)}><ArrowLeft size={18} aria-hidden="true" />Back to air quality console</button>
    <PagedDeviceControls device={device} current={current} />
  </section>;
  return <section className="air-quality-workspace" aria-label={`${device.name} air quality console`} data-motion-disabled={reduced}>
    <div className="air-quality-stage"><div className="air-quality-console" data-tone={air.tone}>
      <header className="air-quality-top"><span className="air-quality-mark" aria-hidden="true"><Radar size={25} /></span>
        <div className="air-quality-brand"><span>VANTAHOME</span><strong>AIR QUALITY</strong></div>
        <button type="button" ref={moreButton} className="air-quality-round" aria-label="More air quality settings" onClick={() => changePanel(true)}><Ellipsis size={22} aria-hidden="true" /></button>
      </header>
      <div className="air-quality-hero"><AirQualityConsoleArtwork air={air} /><p className="air-quality-status" aria-live="polite"><span aria-hidden="true" />{air.status}</p></div>
      <div className="air-quality-metrics" role="group" aria-label="Fixed air quality samples">
        <AirMetric label="PM2.5" value={air.pm25} unit="µg/m³" /><AirMetric label="CO₂" value={air.co2} unit="ppm" />
        <AirMetric label="VOC" value={air.voc} unit="ppb" /><AirMetric label="HUMIDITY" value={air.humidity} unit="%" />
      </div>
      <button className="air-quality-alerts" type="button" role="switch" aria-label="Air alerts preference" aria-checked={air.alertsEnabled === true} disabled={!controllable}
        onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'airAlertsEnabled', air.alertsEnabled !== true)}>
        <Bell size={17} aria-hidden="true" /><span>Alerts preference</span><strong>{air.alertsEnabled === null ? 'Unknown' : air.alertsEnabled ? 'On' : 'Off'}</strong><i aria-hidden="true" /></button>
      <div className="air-quality-section"><div className="air-quality-caption"><span>AQI ALERT PREFERENCE</span><strong>{air.aqiThreshold ?? '—'}</strong></div>
        <div className="air-quality-presets" role="group" aria-label="Saved AQI alert threshold">
          {AIR_AQI_PRESETS.map((preset) => <button key={preset.value} type="button" aria-label={`Save AQI alert threshold ${preset.label}`} aria-pressed={air.aqiThreshold === preset.value} disabled={!controllable}
            onClick={() => useHomeStore.getState().setDeviceSetting(device.id, 'airAlertAqi', preset.value)}>{preset.label}</button>)}
        </div>
      </div>
      <button className="air-quality-primary" type="button" aria-label="Check air quality sample" disabled={!controllable} onClick={() => useHomeStore.getState().toggleDevice(device.id)}><RefreshCw size={18} aria-hidden="true" />Check sample</button>
      <p className="air-quality-checked" aria-live="polite">{air.sampleChecked ? 'Sample checked · values remain simulated' : 'Fixed samples · Check does not refresh a sensor'}</p>
    </div></div>
    <p className="air-quality-feedback"><span>SIMULATION</span>{AIR_QUALITY_NOTE}</p>
  </section>;
}
