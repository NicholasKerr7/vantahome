import { getDevice } from '../../../packages/home-scene/src/data';
import { readDeviceSetting } from '../../../packages/home-scene/src/deviceCapabilities';
import type { SimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { runtimePolicy, type RuntimeMode } from '../../config/runtimeMode';
import { selectVisibleDevices, type Device, type HomeState } from '../../store/useHomeStore';
import { selectHomeNavigationAccess } from '../home-shell/homeNavigationAccess';
import { selectSimulationDeviceBindings } from '../three-d-home/simulationDeviceBindings';
import { canShareDemoDevices } from '../three-d-home/simulationSession';

/** Configured comparisons are device reports, not clinical or life-safety judgements. */
const AIR_THRESHOLDS = [
  { id: 'aqi', reading: 'airQualityIndex', limit: 'airAlertAqi', label: 'AQI', unit: 'AQI' },
  { id: 'co2', reading: 'airCo2', limit: 'airAlertCo2', label: 'CO₂', unit: 'ppm' },
  { id: 'pm25', reading: 'airPm25', limit: 'airAlertPm25', label: 'PM2.5', unit: 'µg/m³' },
  { id: 'pm10', reading: 'airPm10', limit: 'airAlertPm10', label: 'PM10', unit: 'µg/m³' },
  { id: 'voc', reading: 'airVoc', limit: 'airAlertVoc', label: 'VOC', unit: 'ppb' },
  { id: 'pollen', reading: 'airPollen', limit: 'airAlertPollen', label: 'pollen', unit: 'index' },
] as const;

/** Display threshold only: integrations do not yet supply a dependable reporting cadence. */
export const CONDITION_REPORT_FRESHNESS_MS = 15 * 60 * 1000;
export type CurrentReport = Readonly<{
  id: string;
  deviceName: string;
  title: string;
  detail: string;
  simulated: boolean;
  timeLabel: string;
  age: 'simulation' | 'unknown' | 'stale' | 'recent';
  warning: boolean;
  /** Local notices are optional; disabling them never hides a continuing condition. */
  notify?: boolean;
}>;

/** Preserve missing and invalid measurements as unknown instead of defaulting them to a safe value. */
function measurement(value: unknown, max = Infinity): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

/** A device-report timestamp is context, never a claim that a condition was independently confirmed. */
function reportTime(device: Device, simulated: boolean, now: number): Pick<CurrentReport, 'age' | 'timeLabel'> {
  if (simulated) return { age: 'simulation', timeLabel: 'Current local model · no physical report' };
  const observed = measurement(device.observedAt, now);
  if (observed === null || observed === 0 || !Number.isFinite(new Date(observed).getTime())) {
    return { age: 'unknown', timeLabel: 'Device report time unknown' };
  }
  const stale = now - observed >= CONDITION_REPORT_FRESHNESS_MS;
  const time = new Date(observed).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return { age: stale ? 'stale' : 'recent', timeLabel: `${stale ? 'Older device report' : 'Device report'} · ${time}` };
}

/** Show continuing conditions separately from dismissible history, using current device grants and source provenance. */
export function selectCurrentReports(
  home: HomeState,
  simulation: SimulationSnapshot | null,
  mode: RuntimeMode = runtimePolicy.mode,
  now = Date.now(),
): readonly CurrentReport[] {
  if (!selectHomeNavigationAccess(home, mode).notifications) return [];
  const bindings = selectSimulationDeviceBindings(home, mode);
  const demo = canShareDemoDevices(home, mode);
  const reports: CurrentReport[] = [];
  for (const device of selectVisibleDevices(home)) {
    const modelId = bindings[device.id];
    const model = modelId ? getDevice(modelId) : undefined;
    const modelState = modelId ? simulation?.deviceStates[modelId] : undefined;
    const simulated = Boolean(modelId || device.simulationOnly || demo);
    // Virtual registry defaults are not the current model; wait for its scoped snapshot.
    if ((modelId || device.simulationOnly) && !modelState) continue;
    const sourceTime = reportTime(device, simulated, now);
    /** Model defaults are allowed only for an explicitly bound simulation, never physical hardware. */
    const value = (field: keyof Device): unknown => model && modelState
      ? readDeviceSetting(model, modelState, field) : device[field];
    /** Stable current-condition identities are deliberately absent from the persistent activity journal. */
    const add = (key: string, title: string, detail: string, warning = true, notify = false) => {
      reports.push({ id: `condition:${device.id}:${key}`, deviceName: device.name, title, detail, warning,
        simulated, notify, ...sourceTime });
    };
    if (device.kind === 'energy' && value('gridAvailable') === false) {
      add('grid', simulated ? 'Simulated grid outage' : 'Grid unavailable in last report',
        'Backup supply is not confirmed by this report.', true, value('gridOutageAlerts') === true);
    }
    if (device.kind === 'water') {
      if (value('waterLeakDetected') === true) {
        add('leak', simulated ? 'Simulated water leak' : 'Leak flagged in last report',
          'Shutoff and the current physical condition are not confirmed.', true, value('waterLeakAlerts') === true);
      }
      const pressure = measurement(value('waterPressurePsi'));
      const low = measurement(value('waterPressureLowPsi'));
      const high = measurement(value('waterPressureHighPsi'));
      if (pressure !== null && high !== null && pressure > high) {
        add('pressure-high', simulated ? 'Simulated high pressure' : 'High pressure in last report',
          `${Math.round(pressure)} PSI · configured upper limit ${Math.round(high)} PSI`, true, value('waterPressureAlerts') === true);
      } else if (pressure !== null && low !== null && pressure < low) {
        add('pressure-low', simulated ? 'Simulated low pressure' : 'Low pressure in last report',
          `${Math.round(pressure)} PSI · configured lower limit ${Math.round(low)} PSI`, true, value('waterPressureAlerts') === true);
      }
      const used = measurement(value('waterTodayL'));
      const budget = measurement(value('waterBudgetL'));
      if (used !== null && budget !== null && budget > 0 && used > budget) {
        add('water-budget', simulated ? 'Simulated water budget exceeded' : 'Budget exceeded in last report',
          `${Math.round(used)} L reported · configured budget ${Math.round(budget)} L`, true, true);
      }
    }
    if (device.kind === 'air') {
      for (const metric of AIR_THRESHOLDS) {
        const current = measurement(value(metric.reading));
        const limit = measurement(value(metric.limit));
        if (current !== null && limit !== null && limit > 0 && current > limit) {
          add(`air-${metric.id}`, `${simulated ? 'Simulated' : 'Reported'} ${metric.label} above limit`,
            `${current} ${metric.unit} · configured limit ${limit} ${metric.unit}`.trim(),
            true, value('airAlertsEnabled') === true);
        }
      }
    }
    if (['door', 'window', 'garage', 'gate'].includes(device.kind)) {
      const opening = measurement(value('openPercent'), 100);
      if (opening !== null && opening > 0) {
        add('opening', simulated ? 'Model entry open' : 'Open in last report',
          `${Math.round(opening)}% open · lock and closing-zone safety are not confirmed.`, false);
      }
    }
  }
  return reports.sort((left, right) => Number(right.warning) - Number(left.warning));
}
