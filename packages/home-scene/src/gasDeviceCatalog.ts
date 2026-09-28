import type { DeviceCapability } from './deviceCapabilities';
import { GAS_DEFAULTS, GAS_EVENTS, type GasCommand, type GasDeviceKind } from './gasSimulation';

/** Build an explicitly simulated action with no hardware command payload. */
function action(kind: GasDeviceKind, command: GasCommand, label: string): DeviceCapability {
  return { id: `${kind}-${command}`, type: 'action', label, group: 'controls', patch: {}, operation: { type: 'gas', command } };
}
/** Give gas sample readings an uneditable status presentation. */
function stat(kind: GasDeviceKind, field: string, label: string, unit?: string): DeviceCapability {
  return { id: `${kind}-${field}`, type: 'stat', field, label, unit, group: 'status' };
}
/** Describe bounded preferences and stored sample quantities with the same validation shape. */
function range(kind: GasDeviceKind, field: string, label: string, min: number, max: number, step = 1, unit?: string): DeviceCapability {
  return { id: `${kind}-${field}`, type: 'range', field, label, min, max, step, unit, group: 'controls' };
}
/** Store alert preferences independently from detection and simulated valve state. */
function toggle(kind: GasDeviceKind, field: string, label: string): DeviceCapability {
  return { id: `${kind}-${field}`, type: 'toggle', field, label, group: 'modes' };
}

export const gasCapabilities: Record<GasDeviceKind, DeviceCapability[]> = {
  'gas-meter': [
    action('gas-meter', 'use-sample', 'Simulate 30m usage'), action('gas-meter', 'refill', 'Refill demo supply'),
    action('gas-meter', 'open-valve', 'Open preview valve'), action('gas-meter', 'close-valve', 'Close preview valve'),
    { ...toggle('gas-meter', 'gasValveOpen', 'Preview supply valve'), onLabel: 'Open', offLabel: 'Closed' } as DeviceCapability,
    range('gas-meter', 'gasBudgetKg', 'Monthly sample budget', 5, 100, 1, 'kg'),
    range('gas-meter', 'gasRefillAlertPercent', 'Refill alert threshold', 5, 50, 1, '%'),
    toggle('gas-meter', 'gasUsageAlerts', 'Usage alert preference'), toggle('gas-meter', 'gasRefillAlerts', 'Refill alert preference'),
    stat('gas-meter', 'gasFlowKgH', 'Sample flow', 'kg/h'), stat('gas-meter', 'gasTodayKg', 'Sample usage today', 'kg'), stat('gas-meter', 'gasMonthKg', 'Sample usage this month', 'kg'),
    stat('gas-meter', 'gasRemainingKg', 'Demo LPG remaining', 'kg'), stat('gas-meter', 'gasCapacityKg', 'Demo supply capacity', 'kg'), stat('gas-meter', 'gasRemainingPercent', 'Demo supply remaining', '%'),
    stat('gas-meter', 'gasRefillDue', 'Refill threshold reached'), stat('gas-meter', 'gasBudgetExceeded', 'Sample budget reached'), stat('gas-meter', 'gasLeakInterlock', 'Leak preview interlock'),
  ],
  'gas-leak': [
    action('gas-leak', 'self-test', 'Run preview self-test'), action('gas-leak', 'simulate-leak', 'Simulate gas leak'),
    action('gas-leak', 'clear-leak', 'Clear leak scenario'), action('gas-leak', 'silence', 'Silence preview alarm'),
    toggle('gas-leak', 'gasLeakAlerts', 'Leak alert preference'), toggle('gas-leak', 'gasAutoShutoff', 'Preview valve auto-shutoff'),
    stat('gas-leak', 'gasLeakDetected', 'Sample leak detected'), stat('gas-leak', 'gasConcentrationPercentLel', 'Sample concentration', '% LEL'), stat('gas-leak', 'gasAlarmSilenced', 'Preview alarm silenced'),
    stat('gas-leak', 'gasBatteryPercent', 'Sample battery', '%'), stat('gas-leak', 'gasTestCount', 'Preview self-tests'), stat('gas-leak', 'gasTestResult', 'Preview test result'),
  ],
};

/** Persist only bounded scenario outputs; these schemas are not editable controls. */
function eventSchema(kind: GasDeviceKind): DeviceCapability {
  return { id: `${kind}-gasLastEvent`, type: 'enum', field: 'gasLastEvent', label: '', options: GAS_EVENTS.map((value) => ({ label: value, value })) };
}
export const gasStoredFields: Record<GasDeviceKind, DeviceCapability[]> = {
  'gas-meter': [
    range('gas-meter', 'gasFlowKgH', '', 0, 2, 0.01), range('gas-meter', 'gasTodayKg', '', 0, 1000, 0.01), range('gas-meter', 'gasMonthKg', '', 0, 10000, 0.01),
    range('gas-meter', 'gasRemainingKg', '', 0, 12.5, 0.01),
    range('gas-meter', 'gasLastSampleKg', '', 0, 0.25, 0.01), toggle('gas-meter', 'gasLeakInterlock', ''), eventSchema('gas-meter'),
  ],
  'gas-leak': [
    toggle('gas-leak', 'gasLeakDetected', ''), toggle('gas-leak', 'gasAlarmSilenced', ''), range('gas-leak', 'gasConcentrationPercentLel', '', 0, 100),
    range('gas-leak', 'gasBatteryPercent', '', 0, 100), range('gas-leak', 'gasTestCount', '', 0, 9999),
    { id: 'gas-leak-gasTestResult', type: 'enum', field: 'gasTestResult', label: '', options: ['not-run', 'passed'].map((value) => ({ label: value, value })) }, eventSchema('gas-leak'),
  ],
};
export const gasDefaults = GAS_DEFAULTS;
