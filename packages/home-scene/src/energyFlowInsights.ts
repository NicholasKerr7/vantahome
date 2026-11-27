import { getDevice } from './data';
import type { EnergyFlow, EnergyRuntime } from './energySimulation';

export type EnergySourceId = 'solar' | 'battery' | 'grid' | 'generator';

export interface EnergyFlowInsight {
  title: string;
  body: string;
  tone: 'calm' | 'attention';
  waitingNames: string[];
}

const SOURCE_POWER: Record<EnergySourceId, keyof Pick<EnergyFlow, 'solarKw' | 'batteryKw' | 'gridKw' | 'generatorKw'>> = {
  solar: 'solarKw', battery: 'batteryKw', grid: 'gridKw', generator: 'generatorKw',
};
const SOURCE_NAMES: Record<EnergySourceId, string> = { solar: 'solar', battery: 'battery', grid: 'JPS', generator: 'generator' };
const STORAGE_MODE_NAMES: Record<EnergyFlow['storageMode'], string> = {
  backup: 'Backup', 'self-use': 'Self-use', charge: 'Charge',
};

/** Create a fresh result so consumers cannot mutate a shared presentation object. */
function insight(title: string, body: string, tone: EnergyFlowInsight['tone'] = 'calm', waitingNames: string[] = []): EnergyFlowInsight {
  return { title, body, tone, waitingNames };
}

/** Format known finite sample power without exposing invalid readings as ordinary zeroes. */
function power(value: number): string {
  return `${Math.abs(value).toFixed(2)} kW`;
}

/** Bound user-defined names for the compact explanation while preserving full names in the result. */
function compactName(name: string): string {
  const readable = name.trim().replace(/\s+/g, ' ') || 'Unnamed device';
  return readable.length > 16 ? `${readable.slice(0, 15).trimEnd()}…` : readable;
}

/** Describe directional power only; source availability by itself must never animate a live path. */
export function sourceFlowDirection(flow: EnergyFlow | null, source: EnergySourceId): 'in' | 'out' | 'idle' {
  if (!flow) return 'idle';
  const value = flow[SOURCE_POWER[source]];
  if (!Number.isFinite(value) || value === 0) return 'idle';
  if (source === 'battery' && value < 0) return 'out';
  return value > 0 ? 'in' : 'idle';
}

/** Explain the storage mode without guessing whether an idle battery is disabled or at its reserve. */
function describeBattery(flow: EnergyFlow): EnergyFlowInsight {
  if (!Number.isFinite(flow.batteryKw)) return insight('Storage reading unavailable', 'The simulation has no usable battery reading. Your requested settings are retained.', 'attention');
  const mode = STORAGE_MODE_NAMES[flow.storageMode];
  if (flow.batteryKw < 0) return insight('Storage is charging', `Simulation: charging at ${power(flow.batteryKw)}. ${mode} mode remains selected.`);
  if (flow.batteryKw > 0) return insight('Storage is supplying the home', `Simulation: ${power(flow.batteryKw)} from stored energy. ${mode} mode; reserve limits still apply.`);
  const explanation: Record<EnergyFlow['storageMode'], string> = {
    backup: 'Backup mode preserves storage while JPS is connected; reserve and demand still apply.',
    'self-use': 'Self-use mode; demand, reserve or battery availability may be limiting flow.',
    charge: 'Charge mode; capacity, supply or battery availability may be limiting charging.',
  };
  return insight('Storage is holding', `No simulated battery flow. ${explanation[flow.storageMode]}`);
}

/** Show used and curtailed solar separately without implying a measured weather forecast. */
function describeSolar(flow: EnergyFlow): EnergyFlowInsight {
  if (!Number.isFinite(flow.solarKw) || !Number.isFinite(flow.curtailedKw)) {
    return insight('Solar reading unavailable', 'The simulation has no usable solar reading. No production is being assumed.', 'attention');
  }
  if (flow.curtailedKw > 0) return insight('Solar is being limited', `Simulation uses ${power(flow.solarKw)}; ${power(flow.curtailedKw)} is unused because of demand, storage or inverter limits.`);
  if (flow.solarKw > 0) return insight('Solar is supplying the system', `Simulation delivers ${power(flow.solarKw)} to home demand or storage. No solar export is modeled.`);
  return insight('Solar is resting', 'No simulated solar output. Night, disabled generation or no available demand can leave solar idle.');
}

/** Explain JPS recovery as modeled sequencing, never as confirmation of physical grid isolation. */
function describeGrid(flow: EnergyFlow): EnergyFlowInsight {
  switch (flow.gridPhase) {
    case 'isolated': return insight('JPS is isolated in simulation', 'No JPS import. The simulation uses available solar, storage and generator power.', 'attention');
    case 'stabilizing': return insight('Checking the JPS return', 'Simulation waits for a stable return before importing JPS power. Requested settings are retained.', 'attention');
    case 'restoring': return insight('Restoring demand in stages', 'JPS has returned in simulation. Previously deferred loads rejoin in stages; requested settings stay saved.');
    case 'connected':
      if (!Number.isFinite(flow.gridKw)) return insight('JPS reading unavailable', 'The simulation has no usable JPS import reading. No supply amount is being assumed.', 'attention');
      return flow.gridKw > 0
        ? insight('JPS is supporting the system', `Simulation imports ${power(flow.gridKw)} for demand or charging. Grid export is not modeled.`)
        : insight('JPS is available, with no import', 'JPS is available in simulation, but current demand does not require an import.');
  }
}

/** Keep generator sequence, fuel and electrical output distinct during simulated transitions. */
function describeGenerator(flow: EnergyFlow, runtime?: EnergyRuntime | null): EnergyFlowInsight {
  if (!runtime) return insight('Generator sequence unavailable', 'Generator sequence and fuel are unavailable. This view does not infer a start from output alone.', 'attention');
  switch (runtime.generatorPhase) {
    case 'starting': return insight('Generator is starting', 'Simulation start sequence is underway. Output stays at zero until warming finishes.');
    case 'warming': return insight('Generator is warming up', 'Simulation warm-up is underway. The generator has not yet begun supplying power.');
    case 'cooling': return insight('Generator is cooling down', 'Simulation output is disconnected while the engine cools. Cooling does not supply the home.');
    case 'failed': return insight('Generator could not start', runtime.fuelPercent <= 0
      ? 'The simulated fuel supply is empty. Requested settings are retained; there is no generator output.'
      : 'The simulation could not complete a start. Requested settings are retained; no output is assumed.', 'attention');
    case 'off': return insight(runtime.fuelPercent <= 0 ? 'Generator has no fuel' : 'Generator is on standby', runtime.fuelPercent <= 0
      ? 'The simulated fuel supply is empty. A start request cannot produce power until fuel is restored.'
      : 'The simulated generator is stopped. Available solar, storage or JPS serve demand.', runtime.fuelPercent <= 0 ? 'attention' : 'calm');
    case 'running':
      if (runtime.fuelPercent <= 0) return insight('Generator has no fuel', 'The simulated fuel supply is empty. No further generator supply is available.', 'attention');
      if (!Number.isFinite(flow.generatorKw)) return insight('Generator reading unavailable', 'The simulation has no usable generator output reading. Running does not confirm electrical supply.', 'attention');
      if (flow.generatorKw > 0) return insight('Generator is supplying power', `Simulation delivers ${power(flow.generatorKw)} to demand or storage. Fuel is an illustrative estimate.`);
      return flow.gridPhase === 'connected' || flow.gridPhase === 'restoring'
        ? insight('Generator output is isolated', 'JPS has returned in simulation. Generator output is isolated; it does not run in parallel with JPS.')
        : insight('Generator is running, no output', 'The simulated engine is running, but demand and storage currently take no generator power.');
  }
}

/** Explain deferred requests without changing their saved state or revealing unknown device identifiers. */
function describeWaiting(flow: EnergyFlow, runtime?: EnergyRuntime | null): EnergyFlowInsight {
  const ids = [...new Set(flow.deferredDeviceIds)];
  const waitingNames = ids.slice(0, 2).map((id) => getDevice(id)?.name ?? 'Unnamed device');
  const more = ids.length > 2 ? ` +${ids.length - 2}` : '';
  const pending = runtime?.gridRestorePendingIds;
  const restoring = flow.gridPhase === 'restoring';
  const recovering = restoring && ids.every((id) => pending?.includes(id));
  // A missing recovery list or a mixture of held and newly deferred requests has no single known cause.
  const mixedRecovery = restoring && (!runtime || ids.some((id) => pending?.includes(id)));
  const reason = recovering ? 'Staged recovery' : mixedRecovery ? 'Recovery or supply limits' : 'Limited supply';
  return insight(`${ids.length} ${ids.length === 1 ? 'device is' : 'devices are'} waiting`,
    `Simulation: ${waitingNames.map(compactName).join(', ')}${more}. ${reason}; ${flow.homeKw.toFixed(2)} of ${power(flow.requestedKw)} served; settings retained.`,
    recovering ? 'calm' : 'attention', waitingNames);
}

/** Describe an authorized flow snapshot; null flow is a privacy boundary, even if runtime was supplied. */
export function describeEnergyFlow(flow: EnergyFlow | null, runtime?: EnergyRuntime | null, selected?: EnergySourceId | null): EnergyFlowInsight {
  if (!flow) return insight('Power flow is unavailable', 'The simulation may be paused or unavailable. No device state or source supply is being inferred.');
  if (runtime?.enabled === false) return insight('Power simulation is paused', 'Your requested settings are retained. Resume the simulation to see current source flow.');
  if (selected === 'battery') return describeBattery(flow);
  if (selected === 'solar') return describeSolar(flow);
  if (selected === 'grid') return describeGrid(flow);
  if (selected === 'generator') return describeGenerator(flow, runtime);
  if (![flow.homeKw, flow.requestedKw, flow.unservedKw].every(Number.isFinite)) {
    return insight('Power reading unavailable', 'The simulation has no usable demand balance. Your requested settings are retained.', 'attention');
  }
  if (flow.deferredDeviceIds.length > 0) return describeWaiting(flow, runtime);
  if (flow.unservedKw > 0) return insight('Some demand is waiting', `Simulation supplies ${power(flow.homeKw)} of ${power(flow.requestedKw)} requested. Saved settings are retained.`, 'attention');
  if (flow.requestedKw <= 0) return insight('The home is on standby', 'The simulation has no home demand. Available source power may still be charging storage.');
  const sources = (Object.keys(SOURCE_POWER) as EnergySourceId[]).filter((source) => sourceFlowDirection(flow, source) === 'in');
  if (!sources.length) return insight('No source supply available', 'The simulation shows demand but no active source. Requested settings are retained.', 'attention');
  return insight('Requested loads are supplied', `Simulation supplies ${power(flow.homeKw)} from ${sources.map((source) => SOURCE_NAMES[source]).join(' + ')}.`);
}
