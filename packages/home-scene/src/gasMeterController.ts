import { GAS_DEFAULTS, GAS_SAMPLE_CAPACITY_KG } from './gasSimulation';
import { validateStoredSetting } from './deviceCapabilities';
import type { DeviceState } from './simulationTypes';

export const GAS_METER_PREVIEW_NOTE = 'Simulation only · sample readings and preview valve';
export interface GasMeterSnapshot {
  remainingKg: number | null; remainingPercent: number | null;
  todayKg: number | null; monthKg: number | null; flowKgH: number | null;
  budgetKg: number | null; valveOpen: boolean | null; interlocked: boolean | null;
  usageAlerts: boolean | null; refillAlerts: boolean | null;
  refillDue: boolean | null; budgetExceeded: boolean | null;
}

/** Use catalog defaults only for absent fields, keeping corrupt explicit values visibly unknown. */
function value(state: DeviceState, field: string): unknown {
  return state.settings && Object.hasOwn(state.settings, field) ? state.settings[field] : GAS_DEFAULTS['gas-meter'][field];
}

/** Reject coerced, clamped or rounded sample values rather than inventing credible telemetry. */
function quantity(state: DeviceState, field: string): number | null {
  const candidate = value(state, field);
  return typeof candidate === 'number' && Number.isFinite(candidate) && validateStoredSetting('gas-meter', field, candidate) === candidate ? candidate : null;
}

/** Do not treat truthy strings or missing malformed states as an open valve or disabled interlock. */
function flag(state: DeviceState, field: string): boolean | null {
  const candidate = value(state, field);
  return typeof candidate === 'boolean' ? candidate : null;
}

/** Derive the display from accepted quantities, independent of the meter's always-on monitoring flag. */
export function getGasMeterSnapshot(state: DeviceState): GasMeterSnapshot {
  const remainingKg = quantity(state, 'gasRemainingKg');
  const remainingPercent = remainingKg === null ? null : Math.round(remainingKg / GAS_SAMPLE_CAPACITY_KG * 100);
  const monthKg = quantity(state, 'gasMonthKg'), budgetKg = quantity(state, 'gasBudgetKg');
  const threshold = quantity(state, 'gasRefillAlertPercent');
  const valveOpen = flag(state, 'gasValveOpen');
  return { remainingKg, remainingPercent, monthKg, budgetKg, valveOpen,
    todayKg: quantity(state, 'gasTodayKg'), flowKgH: valveOpen === false ? 0 : valveOpen === true ? quantity(state, 'gasFlowKgH') : null,
    interlocked: flag(state, 'gasLeakInterlock'), usageAlerts: flag(state, 'gasUsageAlerts'), refillAlerts: flag(state, 'gasRefillAlerts'),
    refillDue: remainingPercent === null || threshold === null ? null : remainingPercent <= threshold,
    budgetExceeded: monthKg === null || budgetKg === null ? null : monthKg >= budgetKg };
}

/** Keep the leak state visible even with alerts disabled or a closed preview valve. */
export function gasMeterStatus(meter: GasMeterSnapshot): string {
  if (meter.interlocked) return `Leak preview active · valve ${meter.valveOpen === null ? 'unknown' : meter.valveOpen ? 'still open' : 'closed'}`;
  if (meter.interlocked === null || meter.valveOpen === null) return 'Preview valve status unavailable';
  if (meter.refillDue) return 'Refill threshold reached';
  if (meter.budgetExceeded) return 'Monthly sample budget reached';
  return meter.valveOpen ? 'Preview valve open' : 'Preview valve closed';
}

/** Present finite sample quantities consistently across both console surfaces. */
export function formatGasSample(value: number | null): string { return value === null ? '—' : value.toFixed(2); }

/** A usage step needs complete sample counters; refilling must not erase them to repair corruption. */
export function canSampleGas(meter: GasMeterSnapshot): boolean {
  return meter.valveOpen === true && meter.interlocked === false && meter.remainingKg !== null && meter.remainingKg > 0 && meter.todayKg !== null && meter.monthKg !== null;
}
