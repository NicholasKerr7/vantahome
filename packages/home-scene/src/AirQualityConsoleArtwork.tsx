import { useId } from 'react';
import type { AirQualityControllerState } from './airQualityController';
import { createAirQualityEquipmentArtwork } from './airQualityArtwork';
import { EquipmentArtworkSvg } from './EquipmentArtworkSvg';

/** Keep the actual sample in accessible text, aligned with the shared sensor's recessed display. */
export function AirQualityConsoleArtwork({ air }: { air: AirQualityControllerState }) {
  const prefix = `${useId().replace(/:/g, '')}-air-sensor`;
  return <div className="air-quality-artwork" data-tone={air.tone}>
    <svg viewBox="0 0 280 220" aria-hidden="true" focusable="false"><EquipmentArtworkSvg drawing={createAirQualityEquipmentArtwork(prefix, air.tone)} /></svg>
    <div className="air-quality-display"><span>AQI SAMPLE</span><output aria-label="Air quality index sample">{air.aqi ?? '—'}</output><small>SENSOR PREVIEW</small></div>
  </div>;
}
