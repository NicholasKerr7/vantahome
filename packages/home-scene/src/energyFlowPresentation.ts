import { ENERGY_SOURCE_IDS } from './energyAccess';
import type { DeviceDefinition } from './data';
import type { DeviceState } from './simulationTypes';
import type { EnergyControllerState } from './energyController';
import { DEMO_ENERGY_CONFIG, readEnergyFlow, type EnergyRuntime } from './energySimulation';
import type { SimulationSnapshot } from './simulationBridgeProtocol';

export type EnergyFlow = ReturnType<typeof readEnergyFlow>;

/** A single description keeps native and embedded consoles honest about demonstration sizing. */
export const ENERGY_DEMO_DESCRIPTION = `Illustrative ${DEMO_ENERGY_CONFIG.solarKw} kW solar · ${DEMO_ENERGY_CONFIG.batteryKwh} kWh storage · ${DEMO_ENERGY_CONFIG.generatorKw} kW generator. Idealized estimates; active app time only.`;
export const ENERGY_LOCATION_PAUSED_DESCRIPTION = 'Power flow is paused while the property location is verified. Choose Day or Night in the time controls to use a manual scenario.';
export const ENERGY_SHARED_PAUSED_DESCRIPTION = 'Power flow is unavailable in shared-home mode. Local simulation is paused to keep household state consistent.';

/** Only a complete, local canonical snapshot can supply coordinated demonstration readings. */
export function energyFlowForSnapshot(snapshot?: SimulationSnapshot): EnergyFlow | null {
  return snapshot?.energy?.enabled && (!snapshot.energyMode || snapshot.energyMode === 'local')
    ? readEnergyFlow(snapshot.energy, snapshot.deviceStates, snapshot.night) : null;
}

/** Present source power at a readable precision without converting unknown flow into zero. */
export function formatFlowPower(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '—' : `${Math.abs(value).toFixed(2)} kW`;
}

/** Describe reserve, deferred loads and unmet demand without claiming physical service status. */
export function energyFlowSummary(flow: EnergyFlow | null, runtime?: EnergyRuntime): string {
  if (!flow) return runtime && runtime.elapsedSeconds > 0 ? 'Simulation paused · settings retained' : 'Explore a connected energy simulation';
  if (flow.unservedKw > 0.01) return `${formatFlowPower(flow.unservedKw)} demand unavailable · ${flow.deferredDeviceIds.length} loads waiting`;
  if (flow.deferredDeviceIds.length) return `${flow.deferredDeviceIds.length} loads deferred · requested settings retained`;
  return 'Requested loads supplied · simulation';
}

/** Read a human-readable generator phase rather than confusing a start request with output. */
export function generatorPhaseLabel(runtime: EnergyRuntime): string {
  const labels: Record<EnergyRuntime['generatorPhase'], string> = {
    off: 'Standby', starting: 'Starting', warming: 'Warming up', running: 'Running', cooling: 'Cooling down', failed: 'Unable to start',
  };
  return labels[runtime.generatorPhase];
}

/** Keep existing equipment artwork and preferences while replacing independent samples with one flow. */
export function coordinatedEnergyController(base: EnergyControllerState, flow: EnergyFlow | null, runtime?: EnergyRuntime, sharedPaused = false): EnergyControllerState {
  if (sharedPaused) return { ...base, status: 'Power flow paused', headline: { ...base.headline, value: null }, metrics: base.metrics.map((reading) => ({ ...reading, value: null })) };
  if (!flow || !runtime) return base;
  switch (base.kind) {
    case 'energy': return { ...base, status: flow.sourceLabel,
      headline: { label: 'Home supply · simulation', value: flow.homeKw * 1000, unit: 'W' },
      metrics: [
        { label: 'Solar now', value: flow.solarKw * 1000, unit: 'W' },
        { label: 'JPS import', value: flow.gridKw * 1000, unit: 'W' },
        { label: 'Demand', value: flow.requestedKw * 1000, unit: 'W' },
        { label: 'Storage', value: flow.batteryPercent.toFixed(0), unit: '%' },
      ] };
    case 'solar': return { ...base, status: 'Connected solar simulation', inverterStatus: 'Simulated conversion',
      headline: { label: 'Solar production · simulation', value: flow.solarKw * 1000, unit: 'W' },
      metrics: [{ label: 'This run', value: runtime.solarKwh.toFixed(3), unit: 'kWh' }, { label: 'Unused solar', value: flow.curtailedKw * 1000, unit: 'W' }] };
    case 'battery': return { ...base, storageMode: flow.storageMode, chargePercent: flow.batteryPercent, capacityKwh: DEMO_ENERGY_CONFIG.batteryKwh,
      status: flow.batteryKw > 0.01 ? 'Supplying home' : flow.batteryKw < -0.01 ? 'Charging' : base.on ? 'Holding reserve' : 'Disabled',
      headline: { label: 'Stored energy · simulation', value: Number(flow.batteryPercent.toFixed(1)), unit: '%' },
      metrics: [{ label: flow.batteryKw < 0 ? 'Charging' : 'Output', value: Math.abs(flow.batteryKw) * 1000, unit: 'W' },
        { label: 'Usable time estimate', value: flow.runtimeHours === null ? '—' : flow.runtimeHours.toFixed(1), unit: flow.runtimeHours === null ? '' : 'h' }] };
    case 'generator': return { ...base, on: !['off', 'failed'].includes(runtime.generatorPhase),
      primaryActionLabel: base.on ? 'Release manual start' : 'Request generator start',
      status: runtime.generatorPhase === 'running' && flow.generatorKw > 0 ? 'Supplying power' : generatorPhaseLabel(runtime), outputW: flow.generatorKw * 1000, fuelPercent: runtime.fuelPercent,
      headline: { label: 'Generator supply · simulation', value: flow.generatorKw * 1000, unit: 'W' },
      metrics: [{ label: 'Fuel estimate', value: runtime.fuelPercent.toFixed(1), unit: '%' }, { label: 'Sequence', value: generatorPhaseLabel(runtime), unit: '' }] };
  }
}

/** Project instantaneous advanced readings only; requested controls and daily sample histories stay untouched. */
export function energyAdvancedDisplayState(device: DeviceDefinition, state: DeviceState, snapshot?: SimulationSnapshot): DeviceState {
  if (!ENERGY_SOURCE_IDS.some((id) => id === device.id)) return state;
  const flow = energyFlowForSnapshot(snapshot);
  if (!flow || !snapshot?.energy) return state;
  switch (device.kind) {
    case 'energy': return { ...state, settings: { ...state.settings, powerW: flow.homeKw * 1000, solarW: flow.solarKw * 1000 } };
    case 'solar': return { ...state, settings: { ...state.settings, solarW: flow.solarKw * 1000, inverterStatus: 'Simulation' } };
    case 'battery': return { ...state, level: flow.batteryPercent, settings: { ...state.settings, capacityKwh: DEMO_ENERGY_CONFIG.batteryKwh } };
    // The legacy stat reader aliases output to on/level. This copy is for stat rendering only.
    case 'generator': return { ...state, on: flow.generatorKw > 0, level: flow.generatorKw * 1000 / 60,
      settings: { ...state.settings, fuelPercent: snapshot.energy.fuelPercent } };
    default: return state;
  }
}

/** Distinguish idle storage from charging and delivery instead of drawing a false active path. */
export function storageFlowLabel(flow: EnergyFlow | null): string {
  if (!flow) return 'Stored energy';
  return flow.batteryKw < -0.01 ? '← Charging' : flow.batteryKw > 0.01 ? '→ To home' : 'Holding';
}

/** An available grid with zero import is different from an intentionally isolated outage scenario. */
export function gridFlowLabel(flow: EnergyFlow | null, gridAvailable?: boolean | null): string {
  if (!flow) return 'Grid support';
  if (gridAvailable === false || flow.gridPhase === 'isolated') return 'Isolated';
  if (flow.gridPhase === 'stabilizing') return 'Verifying return';
  if (flow.gridPhase === 'restoring') return 'Staged recovery';
  return flow.gridKw > 0 ? 'Import only' : 'No import';
}
