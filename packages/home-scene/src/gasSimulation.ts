import type { DeviceState, DeviceStates, SettingValue } from './simulationTypes';

export type GasDeviceKind = 'gas-meter' | 'gas-leak';
export type GasCommand = 'use-sample' | 'refill' | 'open-valve' | 'close-valve' | 'simulate-leak' | 'clear-leak' | 'silence' | 'self-test';
export const GAS_DEVICE_IDS = { meter: 'utility-gas-meter', detector: 'kitchen-gas-leak' } as const;
export const GAS_SAMPLE_CAPACITY_KG = 12.5;
export const GAS_METER_FIELDS = ['gasValveOpen', 'gasBudgetKg', 'gasRefillAlertPercent', 'gasUsageAlerts', 'gasRefillAlerts', 'gasFlowKgH', 'gasTodayKg', 'gasMonthKg', 'gasRemainingKg', 'gasCapacityKg', 'gasRemainingPercent', 'gasRefillDue', 'gasBudgetExceeded', 'gasLeakInterlock', 'gasLastSampleKg', 'gasLastEvent'] as const;
export const GAS_LEAK_FIELDS = ['gasLeakAlerts', 'gasAutoShutoff', 'gasLeakDetected', 'gasConcentrationPercentLel', 'gasAlarmSilenced', 'gasBatteryPercent', 'gasTestCount', 'gasTestResult', 'gasLastEvent'] as const;
export const GAS_EVENTS = ['ready', 'usage-sample', 'usage-blocked', 'empty-supply', 'refilled', 'valve-opened', 'valve-closed', 'opening-blocked', 'auto-shutoff', 'leak-scenario', 'clear-scenario', 'alarm-silenced', 'self-test'] as const;
export const GAS_DEFAULTS: Record<GasDeviceKind, Record<string, SettingValue>> = {
  'gas-meter': { gasValveOpen: true, gasBudgetKg: 25, gasRefillAlertPercent: 20, gasUsageAlerts: true, gasRefillAlerts: true, gasFlowKgH: 0, gasTodayKg: 0.75, gasMonthKg: 6.25, gasRemainingKg: 8.75, gasCapacityKg: GAS_SAMPLE_CAPACITY_KG, gasRemainingPercent: 70, gasRefillDue: false, gasBudgetExceeded: false, gasLeakInterlock: false, gasLastSampleKg: 0, gasLastEvent: 'ready' },
  'gas-leak': { gasLeakAlerts: true, gasAutoShutoff: true, gasLeakDetected: false, gasConcentrationPercentLel: 0, gasAlarmSilenced: false, gasBatteryPercent: 96, gasTestCount: 0, gasTestResult: 'not-run', gasLastEvent: 'ready' },
};

/** Narrow optional scene kinds without loading a renderer or a scene store. */
export function isGasDevice(kind: string): kind is GasDeviceKind { return kind === 'gas-meter' || kind === 'gas-leak'; }

/** Read a stored primitive or a reproducible sample default. */
function stored(kind: GasDeviceKind, state: DeviceState, field: string): SettingValue | undefined {
  return state.settings?.[field] ?? GAS_DEFAULTS[kind][field];
}

/** Resolve sample readings from their underlying quantities instead of stale copied percentages. */
export function readGasSetting(kind: GasDeviceKind, state: DeviceState, field: string): SettingValue | undefined {
  if (field === 'isOn') return true;
  if (kind === 'gas-meter') {
    if (field === 'gasCapacityKg') return GAS_SAMPLE_CAPACITY_KG;
    if (field === 'gasRemainingPercent') return Math.round(Number(stored(kind, state, 'gasRemainingKg')) / GAS_SAMPLE_CAPACITY_KG * 100);
    if (field === 'gasRefillDue') return Number(readGasSetting(kind, state, 'gasRemainingPercent')) <= Number(stored(kind, state, 'gasRefillAlertPercent'));
    if (field === 'gasBudgetExceeded') return Number(stored(kind, state, 'gasMonthKg')) >= Number(stored(kind, state, 'gasBudgetKg'));
    if (field === 'gasFlowKgH' && !stored(kind, state, 'gasValveOpen')) return 0;
  }
  if (kind === 'gas-leak' && field === 'gasAlarmSilenced' && !stored(kind, state, 'gasLeakDetected')) return false;
  return stored(kind, state, field);
}

/** Round quantities to hundredths so repeated sample usage cannot accumulate floating-point drift. */
function kilograms(value: number): number { return Math.round(value * 100) / 100; }

/** Run a finite, explicit scenario step; no timers, alarms, sensors or physical valves are operated. */
export function applyGasCommand(kind: GasDeviceKind, current: DeviceState, command: GasCommand): DeviceState {
  const settings = { ...current.settings };
  if (kind === 'gas-meter') {
    const remaining = Number(readGasSetting(kind, current, 'gasRemainingKg'));
    const open = Boolean(readGasSetting(kind, current, 'gasValveOpen'));
    const interlocked = Boolean(readGasSetting(kind, current, 'gasLeakInterlock'));
    if (command === 'use-sample') {
      const used = open ? Math.min(0.25, remaining) : 0;
      settings.gasLastSampleKg = used;
      settings.gasRemainingKg = kilograms(remaining - used);
      settings.gasTodayKg = Math.min(1000, kilograms(Number(readGasSetting(kind, current, 'gasTodayKg')) + used));
      settings.gasMonthKg = Math.min(10000, kilograms(Number(readGasSetting(kind, current, 'gasMonthKg')) + used));
      settings.gasFlowKgH = used > 0 && remaining > used ? kilograms(used * 2) : 0;
      settings.gasLastEvent = !open ? 'usage-blocked' : used === 0 ? 'empty-supply' : 'usage-sample';
    } else if (command === 'refill') {
      settings.gasRemainingKg = GAS_SAMPLE_CAPACITY_KG;
      settings.gasFlowKgH = 0;
      settings.gasLastSampleKg = 0;
      settings.gasLastEvent = 'refilled';
    } else if (command === 'close-valve') {
      Object.assign(settings, { gasValveOpen: false, gasFlowKgH: 0, gasLastEvent: 'valve-closed' });
    } else if (command === 'open-valve') {
      Object.assign(settings, { gasValveOpen: interlocked ? open : true, gasLastEvent: interlocked ? 'opening-blocked' : 'valve-opened' });
    } else return current;
  } else if (command === 'simulate-leak') {
    Object.assign(settings, { gasLeakDetected: true, gasConcentrationPercentLel: 35, gasAlarmSilenced: false, gasLastEvent: 'leak-scenario' });
  } else if (command === 'clear-leak') {
    Object.assign(settings, { gasLeakDetected: false, gasConcentrationPercentLel: 0, gasAlarmSilenced: false, gasLastEvent: 'clear-scenario' });
  } else if (command === 'silence') {
    Object.assign(settings, { gasAlarmSilenced: Boolean(readGasSetting(kind, current, 'gasLeakDetected')), gasLastEvent: 'alarm-silenced' });
  } else if (command === 'self-test') {
    Object.assign(settings, { gasTestCount: Math.min(9999, Number(readGasSetting(kind, current, 'gasTestCount')) + 1), gasTestResult: 'passed', gasLastEvent: 'self-test' });
  } else return current;
  return { ...current, on: true, settings };
}

/** Apply the linked preview interlock atomically, preserving an explicitly disabled auto-shutoff preference. */
export function synchronizeGasSafety(states: DeviceStates, previousStates: DeviceStates = states): DeviceStates {
  const meter = states[GAS_DEVICE_IDS.meter];
  const detector = states[GAS_DEVICE_IDS.detector];
  if (!meter || !detector) return states;
  const leak = Boolean(readGasSetting('gas-leak', detector, 'gasLeakDetected'));
  const autoShutoff = Boolean(readGasSetting('gas-leak', detector, 'gasAutoShutoff'));
  const open = Boolean(readGasSetting('gas-meter', meter, 'gasValveOpen'));
  const previousMeter = previousStates[GAS_DEVICE_IDS.meter] ?? meter;
  const attemptedOpening = open && !readGasSetting('gas-meter', previousMeter, 'gasValveOpen');
  const close = leak && open && (autoShutoff || attemptedOpening);
  const settings = { ...meter.settings };
  if (readGasSetting('gas-meter', meter, 'gasLeakInterlock') !== leak) settings.gasLeakInterlock = leak;
  if (close) Object.assign(settings, { gasValveOpen: false, gasFlowKgH: 0, gasLastEvent: attemptedOpening ? 'opening-blocked' : 'auto-shutoff' });
  const meterChanged = !meter.on || close || settings.gasLeakInterlock !== meter.settings?.gasLeakInterlock;
  const detectorChanged = !detector.on;
  if (!meterChanged && !detectorChanged) return states;
  return { ...states,
    [GAS_DEVICE_IDS.meter]: meterChanged ? { ...meter, on: true, settings } : meter,
    [GAS_DEVICE_IDS.detector]: detectorChanged ? { ...detector, on: true } : detector,
  };
}

/** Derive a steady visual state; a silenced preview remains visibly in alarm until cleared. */
export function gasStatusTone(kind: string, state: DeviceState): 'normal' | 'warning' | 'alarm' | 'closed' {
  if (!isGasDevice(kind)) return 'normal';
  if (kind === 'gas-leak') return readGasSetting(kind, state, 'gasLeakDetected') ? 'alarm' : 'normal';
  if (readGasSetting(kind, state, 'gasLeakInterlock')) return 'alarm';
  if (!readGasSetting(kind, state, 'gasValveOpen')) return 'closed';
  return readGasSetting(kind, state, 'gasRefillDue') || readGasSetting(kind, state, 'gasBudgetExceeded') ? 'warning' : 'normal';
}

/** Explain sample monitoring and valve state independently of the device's always-on flag. */
export function gasDeviceStatus(kind: GasDeviceKind, state: DeviceState): string {
  if (kind === 'gas-leak') {
    if (readGasSetting(kind, state, 'gasLeakDetected')) return readGasSetting(kind, state, 'gasAlarmSilenced') ? 'Leak preview · sound silenced' : 'Leak preview · alarm active';
    return Number(readGasSetting(kind, state, 'gasTestCount')) > 0 ? 'Monitoring sample · self-test passed' : 'Monitoring sample · clear';
  }
  if (readGasSetting(kind, state, 'gasLeakInterlock')) return readGasSetting(kind, state, 'gasValveOpen') ? 'Leak preview · valve still open' : 'Leak preview · valve closed';
  return `${readGasSetting(kind, state, 'gasRemainingKg')} kg sample · valve ${readGasSetting(kind, state, 'gasValveOpen') ? 'open' : 'closed'}`;
}

/** Keep scenario feedback precise when an operation is blocked or an alarm is only silenced. */
export function gasActionFeedback(kind: GasDeviceKind, state: DeviceState): string {
  const event = readGasSetting(kind, state, 'gasLastEvent');
  if (event === 'usage-sample') return `Used ${readGasSetting(kind, state, 'gasLastSampleKg')} kg in preview`;
  if (event === 'usage-blocked') return 'Preview usage blocked · valve closed';
  if (event === 'empty-supply') return 'Demo supply empty · no usage added';
  if (event === 'refilled') return 'Demo supply refilled to 12.5 kg';
  if (event === 'opening-blocked') return 'Opening blocked · leak preview active';
  if (event === 'auto-shutoff') return 'Preview auto-shutoff · valve closed';
  if (event === 'self-test') return `Preview self-test passed · ${readGasSetting(kind, state, 'gasTestCount')} tests`;
  return gasDeviceStatus(kind, state);
}
