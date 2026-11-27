import { DEVICES, getDevice, isPositionDevice, type DeviceDefinition } from './data';
import { readDeviceSetting, type DeviceKind } from './deviceCapabilities';
import type { DeviceState, DeviceStates } from './simulationTypes';
import { getFireIncident } from './fireSafetySimulation';
import { FIRE_PREVIEW_LIGHT_IDS } from './safetySimulation';

/** Illustrative, lossless planning samples, not equipment ratings or measured property telemetry. */
export const DEMO_ENERGY_CONFIG = {
  solarKw: 12, batteryKwh: 24, inverterKw: 8, batteryKw: 5, generatorKw: 6, gridImportKw: 12,
  emergencyFloorPercent: 10, generatorStartPercent: 25, generatorStopPercent: 60,
  generatorStartSeconds: 5, generatorWarmSeconds: 8, generatorCoolSeconds: 10, generatorMinimumRunSeconds: 30,
  gridStableSeconds: 15, gridComfortSeconds: 25, gridFlexibleSeconds: 35,
} as const;

export interface EnergyRuntime {
  enabled: boolean;
  elapsedSeconds: number;
  batteryKwh: number;
  generatorPhase: 'off' | 'starting' | 'warming' | 'running' | 'cooling' | 'failed';
  phaseSeconds: number;
  fuelPercent: number;
  solarKwh: number;
  gridKwh: number;
  generatorKwh: number;
  loadKwh: number;
  /** Foreground time since JPS returned; absent in older saves until the next step. */
  gridRecoverySeconds?: number;
  /** Only loads actually deferred during the cut need staged restoration. */
  gridRestorePendingIds?: string[];
}

export interface EnergyFlow {
  solarKw: number;
  homeKw: number;
  requestedKw: number;
  /** Positive means discharge; negative means charging. */
  batteryKw: number;
  gridKw: number;
  generatorKw: number;
  curtailedKw: number;
  unservedKw: number;
  batteryPercent: number;
  runtimeHours: number | null;
  deferredDeviceIds: string[];
  sourceLabel: string;
  storageMode: 'backup' | 'self-use' | 'charge';
  gridPhase: 'isolated' | 'stabilizing' | 'restoring' | 'connected';
}

type Demand = { id: string; kw: number; priority: number };
type EnergyPreferences = { grid: boolean; battery: boolean; reserveKwh: number; storage: EnergyFlow['storageMode']; autoGenerator: boolean; manualGenerator: boolean };
const CONFIG = DEMO_ENERGY_CONFIG;
const EPSILON = 1e-9;
const MAX_COUNTER = 1_000_000_000;
const PHASES: readonly EnergyRuntime['generatorPhase'][] = ['off', 'starting', 'warming', 'running', 'cooling', 'failed'];
const PROTECTED_KINDS: readonly DeviceKind[] = ['smoke', 'gas-meter', 'gas-leak'];
const RUNTIME_FIELDS = ['enabled', 'elapsedSeconds', 'batteryKwh', 'generatorPhase', 'phaseSeconds', 'fuelPercent', 'solarKwh', 'gridKwh', 'generatorKwh', 'loadKwh'] as const;

/** Clamp finite sample input without propagating corrupt fixture readings into the balance. */
function bounded(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

/** Read only the authored plant's existing allowlisted preferences. Added fixtures remain loads. */
function setting(states: DeviceStates, id: string, field: string): unknown {
  const device = getDevice(id);
  const state = states[id];
  return device && state ? readDeviceSetting(device, state, field) : undefined;
}

/** Resolve absent plant components conservatively; a missing grid sample never invents a connection. */
function preferences(states: DeviceStates): EnergyPreferences {
  // New coordinated demonstrations start solar-first; explicit saved choices still win.
  const mode = states['utility-battery']?.settings?.storageMode ?? 'self-use';
  return {
    grid: setting(states, 'utility-energy', 'gridAvailable') === true,
    battery: states['utility-battery']?.on === true,
    reserveKwh: CONFIG.batteryKwh * bounded(setting(states, 'utility-battery', 'reservePercent'), 25, 10, 100) / 100,
    storage: mode === 'self-use' || mode === 'charge' ? mode : 'backup',
    autoGenerator: !!states['utility-generator'] && setting(states, 'utility-generator', 'generatorMode') === 'auto',
    manualGenerator: states['utility-generator']?.on === true,
  };
}

/** Seed once from current battery/fuel samples; subsequent readings belong to the saved runtime. */
export function createEnergyRuntime(states: DeviceStates): EnergyRuntime {
  return {
    enabled: true, elapsedSeconds: 0,
    batteryKwh: CONFIG.batteryKwh * bounded(states['utility-battery']?.level, 78, 0, 100) / 100,
    generatorPhase: 'off', phaseSeconds: 0,
    fuelPercent: bounded(setting(states, 'utility-generator', 'fuelPercent'), 82, 0, 100),
    solarKwh: 0, gridKwh: 0, generatorKwh: 0, loadKwh: 0,
    gridRecoverySeconds: preferences(states).grid ? CONFIG.gridFlexibleSeconds : 0,
  };
}

/** Accept precisely the saved schema with finite, physically bounded values; never repair bad data silently. */
export function parseEnergyRuntime(input: unknown): EnergyRuntime | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (RUNTIME_FIELDS.some((field) => !Object.hasOwn(value, field))
    || Object.keys(value).some((field) => !(RUNTIME_FIELDS as readonly string[]).includes(field) && field !== 'gridRecoverySeconds' && field !== 'gridRestorePendingIds')) return null;
  if (Object.hasOwn(value, 'gridRecoverySeconds')
    && (typeof value.gridRecoverySeconds !== 'number' || !Number.isFinite(value.gridRecoverySeconds)
      || value.gridRecoverySeconds < 0 || value.gridRecoverySeconds > CONFIG.gridFlexibleSeconds)) return null;
  if (Object.hasOwn(value, 'gridRestorePendingIds')) {
    const ids = value.gridRestorePendingIds;
    if (!Array.isArray(ids) || ids.length > 128 || new Set(ids).size !== ids.length
      || !ids.every((id) => typeof id === 'string' && /^[a-z0-9-]{1,128}$/.test(id))) return null;
  }
  if (typeof value.enabled !== 'boolean' || !PHASES.includes(value.generatorPhase as EnergyRuntime['generatorPhase'])) return null;
  for (const field of RUNTIME_FIELDS) {
    if (field === 'enabled' || field === 'generatorPhase') continue;
    const maximum = field === 'batteryKwh' ? CONFIG.batteryKwh : field === 'fuelPercent' ? 100 : MAX_COUNTER;
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field]) || value[field] < 0 || value[field] > maximum) return null;
  }
  return { ...value } as unknown as EnergyRuntime;
}

/** Ignore opening position and self-contained solar poles; use reproducible operating-load samples. */
function deviceDemand(device: DeviceDefinition, state: DeviceState | undefined): Demand | null {
  if (!state || !state.on || isPositionDevice(device) || device.model === 'solar-streetlight') return null;
  const level = bounded(state.level, 50, 0, 100) / 100;
  let kw = 0;
  let priority = 1;
  switch (device.kind) {
    case 'smoke': case 'gas-meter': case 'gas-leak': kw = 0.002; priority = 0; break;
    case 'camera': kw = 0.008; priority = 0; break;
    case 'fridge': kw = 0.18; priority = 0; break;
    case 'water': kw = 0.35; priority = 0; break;
    case 'air': kw = 0.006; priority = 0; break;
    case 'light': kw = 0.035 * level; priority = 0; break;
    case 'fan': kw = 0.015 + 0.06 * level; break;
    case 'ac': kw = 0.6 + 1.2 * level; break;
    case 'tv': kw = 0.12; break;
    case 'speaker': kw = 0.012 + 0.045 * level; break;
    case 'coffee': kw = 1.2; priority = 2; break;
    case 'stove': kw = 2.4; priority = 2; break;
    case 'microwave': kw = 1.4; priority = 2; break;
    case 'washer': kw = 0.6; priority = 2; break;
    case 'dryer': kw = 2.8; priority = 2; break;
    case 'dishwasher': kw = 1.2; priority = 2; break;
    case 'water-heater': kw = 3; priority = 2; break;
    case 'vacuum': kw = 0.055; priority = 2; break;
    case 'sprinkler': kw = 0.35; priority = 2; break;
  }
  return kw > 0 ? { id: device.id, kw, priority } : null;
}

/** Stable priority then ID ordering makes every observer choose the same whole loads to defer. */
function demand(states: DeviceStates): Demand[] {
  return DEVICES.flatMap((device) => {
    const load = deviceDemand(device, states[device.id]);
    return load ? [load] : [];
  }).sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id, 'en'));
}

/** Return a fixed daylight sample; the night flag is a scenario input, not a solar forecast. */
function availableSolar(states: DeviceStates, night: boolean): number {
  return !night && states['utility-solar']?.on ? CONFIG.solarKw * bounded(states['utility-solar'].level, 70, 0, 100) / 100 : 0;
}

/** Old saves begin connected only when their current JPS sample is available. */
function recoverySeconds(runtime: EnergyRuntime, gridAvailable: boolean): number {
  return gridAvailable ? runtime.gridRecoverySeconds ?? CONFIG.gridFlexibleSeconds : 0;
}

/** JPS must remain available for the sample delay before its feed can support the property. */
function gridReady(runtime: EnergyRuntime, pref: EnergyPreferences): boolean {
  return pref.grid && recoverySeconds(runtime, pref.grid) >= CONFIG.gridStableSeconds;
}

/** Alarm inputs and latched incident lighting stay visible independently of this power demonstration. */
function protectedPresentation(device: DeviceDefinition, incidentActive: boolean): boolean {
  return isPositionDevice(device) || device.model === 'solar-streetlight' || PROTECTED_KINDS.includes(device.kind)
    || (incidentActive && (FIRE_PREVIEW_LIGHT_IDS as readonly string[]).includes(device.id));
}

/** Project a bounded AC balance over a short step, with no grid export or generator/grid paralleling. */
function calculateFlow(runtime: EnergyRuntime, states: DeviceStates, night: boolean, seconds: number): EnergyFlow {
  const pref = preferences(states);
  const connected = gridReady(runtime, pref);
  const recovering = recoverySeconds(runtime, pref.grid);
  const gridPhase: EnergyFlow['gridPhase'] = !pref.grid ? 'isolated' : !connected ? 'stabilizing'
    : recovering < CONFIG.gridFlexibleSeconds ? 'restoring' : 'connected';
  const restoredPriority = gridPhase !== 'restoring' ? 2 : recovering < CONFIG.gridComfortSeconds ? 0 : 1;
  const pendingRestoration = new Set(runtime.gridRestorePendingIds ?? []);
  const incidentActive = getFireIncident(states).active;
  const loads = demand(states);
  const requestedKw = loads.reduce((sum, load) => sum + load.kw, 0);
  const hours = seconds / 3600;
  const potentialSolar = availableSolar(states, night);
  const solarLimit = Math.min(potentialSolar, CONFIG.inverterKw);
  const floor = connected ? pref.reserveKwh : CONFIG.batteryKwh * CONFIG.emergencyFloorPercent / 100;
  const storedAboveFloor = Math.max(0, runtime.batteryKwh - floor);
  const dischargeAllowed = pref.battery && (!connected || pref.storage === 'self-use');
  const dischargeLimit = dischargeAllowed ? Math.min(CONFIG.batteryKw, storedAboveFloor / hours, Math.max(0, CONFIG.inverterKw - solarLimit)) : 0;
  const generatorAvailable = !connected && runtime.generatorPhase === 'running' && runtime.fuelPercent > 0;
  const fuelPowerLimit = Math.max(0, (runtime.fuelPercent / hours - 1) * CONFIG.generatorKw / 5);
  const generatorLimit = generatorAvailable ? Math.min(CONFIG.generatorKw, fuelPowerLimit) : 0;
  const firmLimit = connected ? CONFIG.gridImportKw : generatorLimit;
  let remaining = solarLimit + dischargeLimit + firmLimit;
  let homeKw = 0;
  const deferredDeviceIds: string[] = [];
  for (const load of loads) {
    if ((!pendingRestoration.has(load.id) || load.priority <= restoredPriority) && load.kw <= remaining + EPSILON) { homeKw += load.kw; remaining = Math.max(0, remaining - load.kw); }
    else {
      const device = getDevice(load.id);
      if (device && !protectedPresentation(device, incidentActive)) deferredDeviceIds.push(load.id);
    }
  }
  const solarToHome = Math.min(solarLimit, homeKw);
  let deficit = Math.max(0, homeKw - solarToHome);
  // Self-use takes the battery before the grid; generator operation supplies the bus before storage.
  const batteryToHome = connected && pref.storage === 'self-use' ? Math.min(dischargeLimit, deficit)
    : Math.min(dischargeLimit, Math.max(0, deficit - firmLimit));
  deficit -= batteryToHome;
  const firmToHome = Math.min(firmLimit, Math.max(0, deficit));
  const chargeLimit = pref.battery && batteryToHome <= EPSILON
    ? Math.min(CONFIG.batteryKw, Math.max(0, CONFIG.batteryKwh - runtime.batteryKwh) / hours) : 0;
  const solarToBattery = Math.min(Math.max(0, solarLimit - solarToHome), chargeLimit);
  // Grid charging is explicit; an operating backup generator uses spare capacity to rebuild storage.
  const firmToBattery = (!connected || pref.storage === 'charge')
    ? Math.min(Math.max(0, firmLimit - firmToHome), Math.max(0, chargeLimit - solarToBattery)) : 0;
  const batteryKw = batteryToHome - solarToBattery - firmToBattery;
  const solarKw = solarToHome + solarToBattery;
  const gridKw = connected ? firmToHome + firmToBattery : 0;
  const generatorKw = connected ? 0 : firmToHome + firmToBattery;
  const sources = [solarKw > EPSILON ? 'Solar' : '', batteryKw > EPSILON ? 'Battery' : '', generatorKw > EPSILON ? 'Generator' : '', gridKw > EPSILON ? 'JPS grid' : ''].filter(Boolean);
  return {
    solarKw, homeKw, requestedKw, batteryKw, gridKw, generatorKw,
    curtailedKw: Math.max(0, potentialSolar - solarKw), unservedKw: Math.max(0, requestedKw - homeKw),
    batteryPercent: runtime.batteryKwh / CONFIG.batteryKwh * 100,
    runtimeHours: batteryKw > EPSILON ? storedAboveFloor / batteryKw : null,
    deferredDeviceIds, gridPhase,
    storageMode: pref.storage,
    sourceLabel: sources.length ? sources.join(' + ') : requestedKw > EPSILON ? 'Supply unavailable' : 'Standby',
  };
}

/** Read current simulated power; this does not advance time, mutate requested controls or save anything. */
export function readEnergyFlow(runtime: EnergyRuntime, states: DeviceStates, night: boolean): EnergyFlow {
  return calculateFlow(runtime, states, night, 1);
}

/** Change generator phases without losing saved energy counters or implying instant usable output. */
function withPhase(runtime: EnergyRuntime, generatorPhase: EnergyRuntime['generatorPhase']): EnergyRuntime {
  return generatorPhase === runtime.generatorPhase ? runtime : { ...runtime, generatorPhase, phaseSeconds: 0 };
}

/** Apply explicit start/stop and auto hysteresis before spending a foreground simulation second. */
function reconcileGenerator(runtime: EnergyRuntime, states: DeviceStates, night: boolean): EnergyRuntime {
  const pref = preferences(states);
  const connected = gridReady(runtime, pref);
  const low = !pref.battery || runtime.batteryKwh <= CONFIG.batteryKwh * CONFIG.generatorStartPercent / 100;
  const needsSupply = demand(states).reduce((sum, load) => sum + load.kw, 0) > Math.min(CONFIG.inverterKw, availableSolar(states, night)) + EPSILON;
  const automaticStart = pref.autoGenerator && !connected && low && needsSupply;
  const recovered = runtime.batteryKwh >= CONFIG.batteryKwh * CONFIG.generatorStopPercent / 100;
  const continuingAuto = pref.autoGenerator && !connected && (!recovered || runtime.phaseSeconds < CONFIG.generatorMinimumRunSeconds);
  // A manual exercise can run isolated from a healthy grid; it never closes the generator feed onto JPS.
  const wanted = pref.manualGenerator || (runtime.generatorPhase === 'off' || runtime.generatorPhase === 'failed' ? automaticStart : continuingAuto);
  if (runtime.fuelPercent <= EPSILON && (wanted || runtime.generatorPhase !== 'off')) return withPhase(runtime, 'failed');
  if (runtime.generatorPhase === 'failed') return runtime;
  if (!wanted && ['starting', 'warming', 'running'].includes(runtime.generatorPhase)) return withPhase(runtime, 'cooling');
  if (wanted && runtime.generatorPhase === 'off') return withPhase(runtime, 'starting');
  return runtime;
}

/** Integrate a single bounded step using the same conserved power balance displayed by the consoles. */
function advanceStep(runtime: EnergyRuntime, states: DeviceStates, night: boolean, seconds: number): EnergyRuntime {
  const pref = preferences(states);
  const observed = { ...runtime, gridRecoverySeconds: recoverySeconds(runtime, pref.grid) };
  // Preserve loads already supported by backup; delay only those that were actually waiting.
  if (!pref.grid || observed.gridRecoverySeconds === 0) {
    observed.gridRestorePendingIds = calculateFlow(observed, states, night, seconds).deferredDeviceIds;
  }
  const current = reconcileGenerator(observed, states, night);
  const flow = calculateFlow(current, states, night, seconds);
  const hours = seconds / 3600;
  const rotating = ['starting', 'warming', 'running', 'cooling'].includes(current.generatorPhase);
  const fuelUsed = rotating ? (1 + flow.generatorKw / CONFIG.generatorKw * 5) * hours : 0;
  const next: EnergyRuntime = {
    ...current,
    gridRecoverySeconds: pref.grid ? Math.min(CONFIG.gridFlexibleSeconds, recoverySeconds(current, true) + seconds) : 0,
    elapsedSeconds: Math.min(MAX_COUNTER, current.elapsedSeconds + seconds),
    batteryKwh: Math.max(0, Math.min(CONFIG.batteryKwh, current.batteryKwh - flow.batteryKw * hours)),
    phaseSeconds: Math.min(MAX_COUNTER, current.phaseSeconds + seconds),
    fuelPercent: Math.max(0, current.fuelPercent - fuelUsed),
    solarKwh: Math.min(MAX_COUNTER, current.solarKwh + flow.solarKw * hours),
    gridKwh: Math.min(MAX_COUNTER, current.gridKwh + flow.gridKw * hours),
    generatorKwh: Math.min(MAX_COUNTER, current.generatorKwh + flow.generatorKw * hours),
    loadKwh: Math.min(MAX_COUNTER, current.loadKwh + flow.homeKw * hours),
  };
  if ((next.gridRecoverySeconds ?? 0) >= CONFIG.gridFlexibleSeconds) delete next.gridRestorePendingIds;
  if (rotating && next.fuelPercent <= EPSILON) return withPhase(next, 'failed');
  if (next.generatorPhase === 'starting' && next.phaseSeconds >= CONFIG.generatorStartSeconds) return withPhase(next, 'warming');
  if (next.generatorPhase === 'warming' && next.phaseSeconds >= CONFIG.generatorWarmSeconds) return withPhase(next, 'running');
  if (next.generatorPhase === 'cooling' && next.phaseSeconds >= CONFIG.generatorCoolSeconds) return withPhase(next, 'off');
  return next;
}

/** Advance at most five foreground seconds; callers must not replay background elapsed time. */
export function advanceEnergySimulation(runtime: EnergyRuntime, states: DeviceStates, night: boolean, seconds: number): EnergyRuntime {
  if (!runtime.enabled || !Number.isFinite(seconds) || seconds <= 0) return runtime;
  let remaining = Math.min(5, seconds);
  let next = runtime;
  while (remaining > EPSILON) {
    const step = Math.min(1, remaining);
    next = advanceStep(next, states, night, step);
    remaining -= step;
  }
  return next;
}

/** Display unavailable ordinary loads without changing saved intent, openings, independent poles or alarm inputs. */
export function projectEnergyDeviceStates(states: DeviceStates, flow: EnergyFlow, runtime?: EnergyRuntime): DeviceStates {
  let projected = states;
  const incidentActive = getFireIncident(states).active;
  for (const id of flow.deferredDeviceIds) {
    const device = getDevice(id);
    const state = states[id];
    if (!device || !state?.on || protectedPresentation(device, incidentActive)) continue;
    if (projected === states) projected = { ...states };
    projected[id] = { ...state, on: false };
  }
  if (runtime) {
    const generator = states['utility-generator'];
    const battery = states['utility-battery'];
    projected = { ...projected,
      ...(generator ? { 'utility-generator': { ...generator, on: ['starting', 'warming', 'running', 'cooling'].includes(runtime.generatorPhase) } } : {}),
      ...(battery ? { 'utility-battery': { ...battery, level: flow.batteryPercent } } : {}),
    };
  }
  return projected;
}

/** Record even a brief outage command immediately, before the next foreground tick. */
export function synchronizeEnergyInputs(runtime: EnergyRuntime | null | undefined, states: DeviceStates, night: boolean): EnergyRuntime | null | undefined {
  if (!runtime || !runtime.enabled || preferences(states).grid || runtime.gridRecoverySeconds === 0) return runtime;
  const isolated = { ...runtime, gridRecoverySeconds: 0 };
  return { ...isolated, gridRestorePendingIds: readEnergyFlow(isolated, states, night).deferredDeviceIds };
}
