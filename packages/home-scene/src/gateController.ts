import type { DeviceDefinition } from './data';
import { readDeviceSetting } from './deviceCapabilities';
import { GATE_DEVICE_ID, GATE_PHASES, gateClosingBlockReason, gateSafetySummary } from './gateSafetySimulation';
import type { DeviceState } from './simulationTypes';

const GATE_ACTIONS = {
  open: 'gate-command-open',
  close: 'gate-command-close',
  holdOpen: 'gate-hold-open',
  releaseHold: 'gate-release-hold',
  resume: 'gate-resume',
} as const;

export type GateControllerKey = keyof typeof GATE_ACTIONS;
export type GateControllerPhase = typeof GATE_PHASES[number];
export type GateControllerSafety = 'clear' | 'blocked' | 'unknown';

/** Current local gate simulation; safety indicators never certify physical clearance. */
export interface GateControllerState {
  readonly position: number | null;
  readonly target: number | null;
  readonly phase: GateControllerPhase;
  readonly moving: boolean;
  readonly paused: boolean;
  readonly status: string;
  readonly safety: GateControllerSafety;
  readonly safetyLabel: string;
  readonly vehiclePresent: boolean | null;
  readonly beamBlocked: boolean | null;
  readonly sensorFault: boolean | null;
  readonly holdOpen: boolean;
  readonly emergencyHold: boolean;
  readonly emergencyActive: boolean;
  readonly openBlockReason: string | null;
  readonly closeBlockReason: string | null;
  readonly canOpen: boolean;
  readonly canClose: boolean;
  readonly canHoldOpen: boolean;
  readonly canReleaseHold: boolean;
  readonly canResume: boolean;
  readonly autoCloseEnabled: boolean;
  readonly autoCloseDelaySec: number;
  readonly countdownSec: number | null;
}

/** Route explicit commands through the existing catalog and current authorization guards. */
export function gateActionId(key: GateControllerKey): typeof GATE_ACTIONS[GateControllerKey] {
  return GATE_ACTIONS[key];
}

/** Missing flags use modeled defaults; malformed supplied flags cannot imply a clear zone. */
function readFlag(device: DeviceDefinition, state: DeviceState, field: string): boolean | null {
  const supplied = state.settings?.[field];
  if (supplied !== undefined && typeof supplied !== 'boolean') return null;
  return readDeviceSetting(device, state, field) === true;
}

/** Keep invalid supplied quantities unavailable instead of exposing normalization as a reading. */
function readQuantity(device: DeviceDefinition, state: DeviceState, field: string): number | null {
  const supplied = field === 'openPercent' ? state.level : state.settings?.[field];
  if (supplied !== undefined && (typeof supplied !== 'number' || !Number.isFinite(supplied))) return null;
  const value = readDeviceSetting(device, state, field);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Project the already-authorized entry gate only, matching the existing safety clock's scope. */
export function readGateControllerState(device: DeviceDefinition, state: DeviceState): GateControllerState | null {
  if (device.kind !== 'gate' || device.id !== GATE_DEVICE_ID) return null;
  const position = readQuantity(device, state, 'openPercent');
  const phase = readDeviceSetting(device, state, 'gatePhase') as GateControllerPhase;
  const suppliedPhase = state.settings?.gatePhase;
  const phaseKnown = suppliedPhase === undefined || GATE_PHASES.includes(suppliedPhase as GateControllerPhase);
  const vehiclePresent = readFlag(device, state, 'gateVehiclePresent');
  const beamBlocked = readFlag(device, state, 'gateBeamBlocked');
  const sensorFault = readFlag(device, state, 'gateSensorFault');
  const manualHold = readFlag(device, state, 'gateHoldOpen');
  const emergencyLatch = readFlag(device, state, 'gateEmergencyHold');
  const emergencyInput = readFlag(device, state, 'gateEmergencyActive');
  const holdOpen = manualHold === true;
  const emergencyHold = emergencyLatch === true;
  const emergencyActive = emergencyInput === true;
  const target = phase === 'closing' ? readQuantity(device, state, 'gateCloseTargetPercent') : null;
  const countdownSec = phase === 'countdown' ? readQuantity(device, state, 'gateCountdownSec') : null;
  const inputsKnown = [vehiclePresent, beamBlocked, sensorFault, manualHold, emergencyLatch, emergencyInput].every((value) => value !== null);
  const quantitiesKnown = (phase !== 'closing' || target !== null) && (phase !== 'countdown' || countdownSec !== null);
  const stateKnown = position !== null && phaseKnown && inputsKnown && quantitiesKnown;
  const unavailableReason = !stateKnown ? 'Gate simulation state unavailable' : null;
  const openBlockReason = unavailableReason ?? (sensorFault ? 'Safety-sensor fault' : vehiclePresent ? 'Vehicle present' : beamBlocked ? 'Safety beam blocked' : null);
  const closeBlockReason = unavailableReason ?? gateClosingBlockReason(state);
  const safety: GateControllerSafety = !stateKnown || sensorFault ? 'unknown' : vehiclePresent || beamBlocked ? 'blocked' : 'clear';
  const safetyLabel = safety === 'unknown' ? sensorFault ? 'Sensor fault · simulation' : 'Safety sample unavailable'
    : safety === 'blocked' ? 'Obstructed in simulation' : 'Clear in simulation';
  const moving = phase === 'closing' && position !== null && target !== null && target < position && closeBlockReason === null;
  const autoCloseEnabled = readDeviceSetting(device, state, 'autoCloseEnabled') === true;
  const autoCloseDelaySec = Number(readDeviceSetting(device, state, 'autoCloseDelaySec'));
  return {
    position, target, phase, moving, paused: phase === 'paused',
    status: stateKnown ? gateSafetySummary(state) : 'Gate simulation state unavailable',
    safety, safetyLabel, vehiclePresent, beamBlocked, sensorFault, holdOpen, emergencyHold, emergencyActive,
    openBlockReason, closeBlockReason,
    canOpen: position !== null && (position < 100 || phase !== 'idle') && openBlockReason === null,
    canClose: position !== null && position > 0 && closeBlockReason === null,
    canHoldOpen: stateKnown && !holdOpen && (position === 100 || openBlockReason === null),
    canReleaseHold: inputsKnown && (holdOpen || emergencyHold) && !emergencyActive,
    // Resume re-arms only the fully-open timer; a paused partial close needs an explicit Close.
    canResume: phase === 'paused' && position === 100 && autoCloseEnabled && closeBlockReason === null,
    autoCloseEnabled, autoCloseDelaySec, countdownSec,
  };
}
