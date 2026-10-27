import type { DeviceDefinition } from './data';
import { getCapabilities, readDeviceSetting, validateSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';

/** These are editable notification preferences, not air-quality classifications. */
export const AIR_AQI_PRESETS = [
  { label: '75', value: 75 },
  { label: '100', value: 100 },
  { label: '150', value: 150 },
] as const;
export const AIR_QUALITY_NOTE = 'Fixed simulation samples · no live sensor connection';

/** The monitor presents fixed samples independently of power and notification preferences. */
export interface AirQualityControllerState {
  readonly aqi: number | null;
  readonly pm25: number | null;
  readonly co2: number | null;
  readonly voc: number | null;
  readonly humidity: number | null;
  readonly alertsEnabled: boolean | null;
  readonly aqiThreshold: number | null;
  readonly sampleChecked: boolean;
  readonly tone: 'within' | 'exceeded' | 'unknown';
  readonly status: string;
  readonly exceededLabels: readonly string[];
}

/** Use the same six configured comparisons as the existing current-condition reports. */
const THRESHOLDS = [
  { sample: 'airQualityIndex', threshold: 'airAlertAqi', label: 'AQI' },
  { sample: 'airCo2', threshold: 'airAlertCo2', label: 'CO₂' },
  { sample: 'airPm25', threshold: 'airAlertPm25', label: 'PM2.5' },
  { sample: 'airPm10', threshold: 'airAlertPm10', label: 'PM10' },
  { sample: 'airVoc', threshold: 'airAlertVoc', label: 'VOC' },
  { sample: 'airPollen', threshold: 'airAlertPollen', label: 'Pollen' },
] as const;

/** Missing fields use established simulation defaults; explicit invalid fields remain unknown. */
function storedOrSampleDefault(device: DeviceDefinition, state: DeviceState, field: string): unknown {
  return state.settings && Object.hasOwn(state.settings, field)
    ? state.settings[field] : readDeviceSetting(device, state, field);
}

/** Keep finite nonnegative readings, including zero, without assigning an official AQI scale. */
function sampleValue(device: DeviceDefinition, state: DeviceState, field: string, max = Infinity): number | null {
  const value = storedOrSampleDefault(device, state, field);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

/** Validate a saved limit exactly, without silently clamping corrupt values into plausible preferences. */
function thresholdValue(device: DeviceDefinition, state: DeviceState, field: string): number | null {
  const value = storedOrSampleDefault(device, state, field);
  const capability = getCapabilities('air').find((item) => 'field' in item && item.field === field);
  return typeof value === 'number' && capability && validateSetting(capability, value) === value ? value : null;
}

/** Read only this selected simulation monitor; never infer sensor freshness or purifier operation. */
export function readAirQualityControllerState(device: DeviceDefinition, state: DeviceState): AirQualityControllerState | null {
  if (device.kind !== 'air') return null;
  const comparisons = THRESHOLDS.map((metric) => ({
    label: metric.label,
    sample: sampleValue(device, state, metric.sample),
    limit: thresholdValue(device, state, metric.threshold),
  }));
  const humidity = sampleValue(device, state, 'humidity', 100);
  const hasUnknown = humidity === null || comparisons.some(({ sample, limit }) => sample === null || limit === null);
  // Existing activity reports use strict greater-than; reaching a limit is not exceeding it.
  const exceededLabels = comparisons.filter(({ sample, limit }) => sample !== null && limit !== null && sample > limit)
    .map(({ label }) => label);
  const atLimit = comparisons.some(({ sample, limit }) => sample !== null && limit !== null && sample === limit);
  const tone = exceededLabels.length ? 'exceeded' : hasUnknown ? 'unknown' : 'within';
  const alerts = storedOrSampleDefault(device, state, 'airAlertsEnabled');
  return {
    aqi: comparisons[0].sample,
    co2: comparisons[1].sample,
    pm25: comparisons[2].sample,
    voc: comparisons[4].sample,
    humidity,
    alertsEnabled: typeof alerts === 'boolean' ? alerts : null,
    aqiThreshold: comparisons[0].limit,
    sampleChecked: state.settings?.sampleChecked === true,
    tone,
    status: tone === 'unknown' ? 'Sample unavailable' : tone === 'exceeded' ? (hasUnknown ? 'Saved limit exceeded · some samples unavailable' : 'Saved limit exceeded')
      : atLimit ? 'At saved limit' : 'Below saved limits',
    exceededLabels,
  };
}
