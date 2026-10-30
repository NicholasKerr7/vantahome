import { GAS_DEFAULTS } from './gasSimulation';
import { validateStoredSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';

export const GAS_LEAK_PREVIEW_NOTE = 'Simulation only · no physical gas detection or protection';
export interface GasLeakSnapshot {
  leakDetected: boolean | null; alarmSilenced: boolean | null;
  concentration: number | null; batteryPercent: number | null; testCount: number | null;
  testResult: 'not-run' | 'passed' | null; leakAlerts: boolean | null; autoShutoff: boolean | null;
}

/** Default absent fields only; explicit malformed samples must not appear valid. */
function value(state: DeviceState, field: string): unknown {
  return state.settings && Object.hasOwn(state.settings, field) ? state.settings[field] : GAS_DEFAULTS['gas-leak'][field];
}

/** Accept exact catalog quantities rather than coercing, rounding or clamping unknown readings. */
function quantity(state: DeviceState, field: string): number | null {
  const candidate = value(state, field);
  return typeof candidate === 'number' && Number.isFinite(candidate) && validateStoredSetting('gas-leak', field, candidate) === candidate ? candidate : null;
}

/** Unknown booleans cannot silently become a clear detector or an enabled protection preference. */
function flag(state: DeviceState, field: string): boolean | null {
  const candidate = value(state, field);
  return typeof candidate === 'boolean' ? candidate : null;
}

/** Project accepted scenario state independently of the always-on monitor flag. */
export function getGasLeakSnapshot(state: DeviceState): GasLeakSnapshot {
  const leakDetected = flag(state, 'gasLeakDetected');
  const result = value(state, 'gasTestResult');
  return { leakDetected, alarmSilenced: leakDetected === false ? false : flag(state, 'gasAlarmSilenced'),
    concentration: quantity(state, 'gasConcentrationPercentLel'), batteryPercent: quantity(state, 'gasBatteryPercent'), testCount: quantity(state, 'gasTestCount'),
    testResult: result === 'not-run' || result === 'passed' ? result : null,
    leakAlerts: flag(state, 'gasLeakAlerts'), autoShutoff: flag(state, 'gasAutoShutoff') };
}

/** Keep known leaks prominent; missing or inconsistent samples never receive a clear visual state. */
export function gasLeakTone(detector: GasLeakSnapshot): 'alarm' | 'unknown' | 'standby' {
  if (detector.leakDetected === true) return 'alarm';
  if (detector.leakDetected === null || detector.concentration === null || detector.concentration !== 0) return 'unknown';
  return 'standby';
}

/** A preview self-test or silence affects neither the leak flag nor its primary status. */
export function gasLeakStatus(detector: GasLeakSnapshot): string {
  if (detector.leakDetected === true) return detector.alarmSilenced === null ? 'Leak preview active · alarm state unknown' : detector.alarmSilenced ? 'Leak preview active · alarm silenced' : 'Leak preview active · alarm active';
  if (detector.leakDetected === null || detector.concentration === null) return 'Leak sample unavailable';
  if (detector.concentration !== 0) return 'Sample mismatch · review scenario';
  return 'No leak in this sample';
}

/** Describe a recorded simulation test without presenting a hardware certification. */
export function gasLeakTestStatus(detector: GasLeakSnapshot): string {
  if (detector.testCount === null || detector.testResult === null || (detector.testResult === 'passed' && detector.testCount === 0)) return 'Preview test unavailable';
  return detector.testResult === 'passed' ? 'Preview test passed' : 'Preview test not run';
}
