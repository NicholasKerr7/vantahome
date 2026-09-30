import type { DeviceState, DeviceStates, SettingValue } from './simulationTypes';

export const GATE_DEVICE_ID = 'entry-gate';
export const GATE_CLOSING_PERCENT_PER_SECOND = 25;
export const GATE_PHASES = ['idle', 'countdown', 'closing', 'paused'] as const;
export const GATE_EVENTS = ['ready', 'opened', 'closing', 'closed', 'positioned', 'held', 'released', 'resumed', 'close-blocked', 'open-blocked', 'obstruction-reopened', 'sensor-fault', 'restored-paused', 'emergency-hold'] as const;
export type GateCommand = 'open' | 'close' | 'hold-open' | 'release-hold' | 'resume';
export const GATE_SAFETY_DEFAULTS: Record<string, SettingValue> = {
  autoCloseEnabled: false, autoCloseDelaySec: 30, gateHoldOpen: false,
  gateVehiclePresent: false, gateBeamBlocked: false, gateSensorFault: false,
  gateEmergencyActive: false, gateEmergencyHold: false,
  gatePhase: 'idle', gateCountdownSec: 0, gateCloseTargetPercent: 0, gateLastEvent: 'ready',
};
const BOOLEAN_FIELDS = ['autoCloseEnabled', 'gateHoldOpen', 'gateVehiclePresent', 'gateBeamBlocked', 'gateSensorFault', 'gateEmergencyActive', 'gateEmergencyHold'] as const;
const EDITABLE_BOOLEAN_FIELDS = ['autoCloseEnabled', 'gateHoldOpen', 'gateVehiclePresent', 'gateBeamBlocked', 'gateSensorFault'] as const;

/** Keep numeric simulation inputs finite without coercing arbitrary strings or booleans. */
function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

/** Reuse unchanged references so idle one-second ticks do not persist or render new snapshots. */
function unchangedOrNext(current: DeviceState, next: DeviceState): DeviceState {
  const keys = Object.keys(next.settings ?? {});
  return current.on === next.on && current.level === next.level
    && keys.length === Object.keys(current.settings ?? {}).length
    && keys.every((key) => current.settings?.[key] === next.settings?.[key]) ? current : next;
}

/** Missing default fields are equivalent to explicit defaults at idle persistence and tick boundaries. */
function unchangedGateOrNext(current: DeviceState, next: DeviceState): DeviceState {
  const keys = new Set([...Object.keys(current.settings ?? {}), ...Object.keys(next.settings ?? {})]);
  return current.on === next.on && current.level === next.level
    && [...keys].every((key) => (current.settings?.[key] ?? GATE_SAFETY_DEFAULTS[key]) === (next.settings?.[key] ?? GATE_SAFETY_DEFAULTS[key])) ? current : next;
}

/** Normalize only gate fields, retaining unrelated preferences and an honest position/on pair. */
function normalized(current: DeviceState): DeviceState {
  const settings = { ...current.settings };
  const level = bounded(current.level, 0, 0, 100);
  for (const field of BOOLEAN_FIELDS) settings[field] = typeof settings[field] === 'boolean' ? settings[field] : false;
  settings.autoCloseDelaySec = Math.round(bounded(settings.autoCloseDelaySec, 30, 5, 120));
  settings.gateCountdownSec = bounded(settings.gateCountdownSec, 0, 0, 120);
  settings.gateCloseTargetPercent = bounded(settings.gateCloseTargetPercent, 0, 0, level);
  settings.gatePhase = GATE_PHASES.includes(settings.gatePhase as typeof GATE_PHASES[number]) ? settings.gatePhase : 'idle';
  settings.gateLastEvent = GATE_EVENTS.includes(settings.gateLastEvent as typeof GATE_EVENTS[number]) ? settings.gateLastEvent : 'ready';
  return unchangedOrNext(current, { ...current, on: level > 0, level, settings });
}

/** Update a gate atomically; all settings remain plain serializable primitives. */
function update(current: DeviceState, settings: Record<string, SettingValue>, level = current.level): DeviceState {
  return unchangedOrNext(current, { ...current, on: level > 0, level, settings: { ...current.settings, ...settings } });
}

/** Read only the gate's modeled fields, leaving other capability fallbacks to the caller. */
export function readGateSetting(current: DeviceState, field: string): SettingValue | undefined {
  if (field === 'openPercent') return bounded(current.level, 0, 0, 100);
  if (!Object.hasOwn(GATE_SAFETY_DEFAULTS, field)) return undefined;
  return normalized(current).settings?.[field];
}

/** A vehicle or broken beam is a simulated occupied closing zone, never camera proof of clearance. */
function zoneBlocked(state: DeviceState): boolean {
  return state.settings?.gateVehiclePresent === true || state.settings?.gateBeamBlocked === true;
}

/** Holds and unknown safety-sensor health inhibit every requested closing movement. */
function closingBlocked(state: DeviceState): boolean {
  return zoneBlocked(state) || state.settings?.gateSensorFault === true || state.settings?.gateHoldOpen === true
    || state.settings?.gateEmergencyHold === true || state.settings?.gateEmergencyActive === true;
}

/** Explain why even a manual close request is unavailable in the current local scenario. */
export function gateClosingBlockReason(current: DeviceState): string | null {
  const settings = normalized(current).settings!;
  if (settings.gateSensorFault) return 'Safety-sensor fault';
  if (settings.gateEmergencyActive || settings.gateEmergencyHold) return 'Emergency hold';
  if (settings.gateHoldOpen) return 'Hold open';
  if (settings.gateVehiclePresent) return 'Vehicle present';
  if (settings.gateBeamBlocked) return 'Safety beam blocked';
  return null;
}

/** Start a new full clearance interval only at fully open, after all inhibitors are removed. */
function armCountdown(state: DeviceState): DeviceState {
  if (state.settings?.gatePhase === 'paused' || state.settings?.gatePhase === 'closing') return state;
  const eligible = state.level === 100 && state.settings?.autoCloseEnabled === true && !closingBlocked(state);
  if (!eligible) return update(state, { gatePhase: 'idle', gateCountdownSec: 0 });
  if (state.settings?.gatePhase === 'countdown') return state;
  return update(state, { gatePhase: 'countdown', gateCountdownSec: Number(state.settings?.autoCloseDelaySec) });
}

/** Stop on a fault, or reopen an obstructed closing preview before any further elapsed-time movement. */
function enforceInterlocks(state: DeviceState): DeviceState {
  if (state.settings?.gateSensorFault) {
    return update(state, { gatePhase: state.settings.gatePhase === 'closing' ? 'paused' : state.settings.gatePhase === 'paused' ? 'paused' : 'idle', gateCountdownSec: 0, gateLastEvent: 'sensor-fault' });
  }
  if (state.settings?.gatePhase === 'closing' && zoneBlocked(state)) {
    return update(state, { gatePhase: 'idle', gateCountdownSec: 0, gateCloseTargetPercent: 100, gateLastEvent: 'obstruction-reopened' }, 100);
  }
  if (state.settings?.gatePhase === 'closing' && closingBlocked(state)) {
    return update(state, { gatePhase: 'paused', gateCountdownSec: 0, gateLastEvent: 'close-blocked' });
  }
  return armCountdown(state);
}

/** Route every slider, action, and direct position request through the same movement interlocks. */
function requestPosition(current: DeviceState, target: number): DeviceState {
  const state = normalized(current);
  if (target < state.level) {
    if (closingBlocked(state)) return update(state, { gateCountdownSec: 0, gatePhase: 'idle', gateLastEvent: 'close-blocked' });
    return update(state, { gatePhase: 'closing', gateCountdownSec: 0, gateCloseTargetPercent: target, gateLastEvent: 'closing' });
  }
  if (target > state.level && (state.settings?.gateSensorFault || zoneBlocked(state))) {
    return update(state, { gateCountdownSec: 0, gatePhase: 'idle', gateLastEvent: 'open-blocked' });
  }
  return armCountdown(update(state, {
    gatePhase: 'idle', gateCountdownSec: 0, gateCloseTargetPercent: target,
    gateLastEvent: target === 100 ? 'opened' : target === 0 ? 'closed' : 'positioned',
  }, target));
}

/** Apply an explicit local action; releasing a hold cannot override an ongoing emergency scenario. */
export function applyGateCommand(current: DeviceState, command: GateCommand): DeviceState {
  const state = normalized(current);
  if (command === 'open') return requestPosition(state, 100);
  if (command === 'close') return requestPosition(state, 0);
  if (command === 'hold-open') {
    const held = update(state, { gateHoldOpen: true, gatePhase: 'idle', gateCountdownSec: 0, gateLastEvent: 'held' });
    return held.level === 100 ? held : requestPosition(held, 100);
  }
  if (command === 'release-hold') {
    if (state.settings?.gateEmergencyActive) return state;
    return enforceInterlocks(update(state, { gateHoldOpen: false, gateEmergencyHold: false, gatePhase: 'idle', gateCountdownSec: 0, gateLastEvent: 'released' }));
  }
  return enforceInterlocks(update(state, { gatePhase: 'idle', gateCountdownSec: 0, gateLastEvent: 'resumed' }));
}

/** Accept only editable simulation inputs; countdown, emergency state, and movement phase are read-only. */
export function applyGateSetting(current: DeviceState, field: string, input: SettingValue): DeviceState {
  if (field === 'openPercent') return typeof input === 'number' && Number.isFinite(input) ? requestPosition(current, bounded(input, 0, 0, 100)) : current;
  if (field === 'isOn') return typeof input === 'boolean' ? applyGateCommand(current, input ? 'open' : 'close') : current;
  if (field === 'gateReleaseHold') return input === true ? applyGateCommand(current, 'release-hold') : current;
  if (field === 'gateResume') return input === true ? applyGateCommand(current, 'resume') : current;
  if (field === 'gateHoldOpen' && typeof input === 'boolean') return applyGateCommand(current, input ? 'hold-open' : 'release-hold');
  if ((EDITABLE_BOOLEAN_FIELDS as readonly string[]).includes(field) && typeof input === 'boolean') {
    return enforceInterlocks(update(normalized(current), { [field]: input }));
  }
  if (field === 'autoCloseDelaySec' && typeof input === 'number' && Number.isFinite(input)) {
    return enforceInterlocks(update(normalized(current), { autoCloseDelaySec: Math.round(bounded(input, 30, 5, 120)), gateCountdownSec: 0, gatePhase: current.settings?.gatePhase === 'countdown' ? 'idle' : current.settings?.gatePhase ?? 'idle' }));
  }
  return current;
}

/** Latch a fire-preview hold and request opening only with healthy, clear simulated movement zones. */
function applyEmergencyInput(current: DeviceState, emergencyActive: boolean): DeviceState {
  let state = update(current, { gateEmergencyActive: emergencyActive });
  if (!emergencyActive) return state;
  state = update(state, { gateEmergencyHold: true, gatePhase: 'idle', gateCountdownSec: 0, gateLastEvent: 'emergency-hold' });
  if (state.settings?.gateSensorFault || zoneBlocked(state)) return state;
  return update(state, { gateCloseTargetPercent: 100 }, 100);
}

/** Advance only explicitly supplied active-preview time; the caller pauses by not ticking, with no wall-clock catch-up. */
export function advanceGateSafety(current: DeviceState, deltaSeconds: number, emergencyActive = false): DeviceState {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current;
  const state = enforceInterlocks(applyEmergencyInput(normalized(current), emergencyActive));
  if (state.settings?.gatePhase === 'countdown') {
    const remaining = Math.max(0, Number(state.settings.gateCountdownSec) - deltaSeconds);
    // Expiry starts an observable phase; excess time never skips the opportunity to obstruct closing.
    return update(state, remaining > 0 ? { gateCountdownSec: remaining } : { gateCountdownSec: 0, gatePhase: 'closing', gateCloseTargetPercent: 0, gateLastEvent: 'closing' });
  }
  if (state.settings?.gatePhase === 'closing') {
    const target = Number(state.settings.gateCloseTargetPercent);
    const level = Math.max(target, Math.round((state.level - GATE_CLOSING_PERCENT_PER_SECOND * deltaSeconds) * 1000) / 1000);
    return update(state, level === target ? { gatePhase: 'idle', gateLastEvent: target === 0 ? 'closed' : 'positioned' } : {}, level);
  }
  return unchangedGateOrNext(current, state);
}

/** Guard direct scene/snapshot patches as well as reducers; unrelated devices retain their references. */
export function synchronizeGateSafety(states: DeviceStates, previousStates: DeviceStates = states, emergencyActive = false): DeviceStates {
  const candidate = states[GATE_DEVICE_ID];
  if (!candidate) return states;
  const previous = normalized(previousStates[GATE_DEVICE_ID] ?? candidate);
  // Sparse replacement patches retain safety inputs and latches, rather than treating omission as clearance.
  const retainedSettings = Object.fromEntries(Object.entries(previousStates[GATE_DEVICE_ID]?.settings ?? {})
    .filter(([field]) => Object.hasOwn(GATE_SAFETY_DEFAULTS, field)));
  let next = normalized({ ...candidate, settings: { ...retainedSettings, ...candidate.settings } });
  if (candidate.settings?.gateLastEvent !== 'released') {
    const retainedHolds = Object.fromEntries(['gateHoldOpen', 'gateEmergencyHold']
      .filter((field) => previous.settings?.[field] === true).map((field) => [field, true]));
    next = update(next, retainedHolds);
  }
  if (next.level !== previous.level) {
    // A scene replacement cannot erase an existing inhibitor and move in the same patch.
    // Explicitly clearing a scenario input is a separate stationary setting action.
    const inhibitors = ['gateHoldOpen', 'gateVehiclePresent', 'gateBeamBlocked', 'gateSensorFault', 'gateEmergencyActive', 'gateEmergencyHold'];
    const retained = Object.fromEntries(inhibitors.filter((field) => previous.settings?.[field] === true).map((field) => [field, true]));
    next = update(next, retained);
  }
  if (next.level < previous.level) {
    if (closingBlocked(previous) || closingBlocked(next)) {
      next = update(next, { gatePhase: previous.settings?.gatePhase === 'closing' ? 'closing' : 'idle', gateCountdownSec: 0, gateLastEvent: 'close-blocked' }, previous.level);
    } else if (previous.settings?.gatePhase !== 'closing') {
      next = requestPosition(update(next, {}, previous.level), next.level);
    }
  } else if (next.level > previous.level && (next.settings?.gateSensorFault || zoneBlocked(next))) {
    const reversing = previous.settings?.gatePhase === 'closing' && !next.settings?.gateSensorFault;
    if (!reversing) next = update(next, { gatePhase: 'idle', gateCountdownSec: 0, gateLastEvent: 'open-blocked' }, previous.level);
  }
  next = enforceInterlocks(applyEmergencyInput(next, emergencyActive));
  next = unchangedGateOrNext(candidate, next);
  return next === candidate ? states : { ...states, [GATE_DEVICE_ID]: next };
}

/** Never resume persisted motion or a stale countdown after reload; retain holds and require an explicit fresh action. */
export function normalizeRestoredGateState(current: DeviceState): DeviceState {
  const state = normalized(current);
  const interrupted = state.settings?.gatePhase === 'countdown' || state.settings?.gatePhase === 'closing';
  return unchangedGateOrNext(current, update(state, {
    gatePhase: interrupted ? 'paused' : state.settings!.gatePhase,
    gateCountdownSec: 0, gateCloseTargetPercent: interrupted ? state.level : state.settings!.gateCloseTargetPercent,
    gateEmergencyHold: Boolean(state.settings?.gateEmergencyHold || state.settings?.gateEmergencyActive),
    ...(interrupted ? { gateLastEvent: 'restored-paused' } : {}),
  }));
}

/** Describe the local scenario without implying camera intelligence, certified safety, or physical confirmation. */
export function gateSafetySummary(current: DeviceState): string {
  const state = normalized(current);
  const settings = state.settings!;
  if (settings.gateSensorFault) return `${settings.gateEmergencyHold ? 'Emergency hold · ' : ''}Sensor fault · movement blocked`;
  if (settings.gateEmergencyHold) return `Emergency hold${zoneBlocked(state) && state.level < 100 ? ' · opening blocked' : ' · release manually'}`;
  if (settings.gateHoldOpen) return `Hold open${zoneBlocked(state) && state.level < 100 ? ' · opening blocked' : ' · release manually'}`;
  if (settings.gatePhase === 'paused') return 'Preview paused · resume manually';
  if (settings.gateVehiclePresent) return 'Vehicle present · closing blocked';
  if (settings.gateBeamBlocked) return 'Safety beam blocked · closing blocked';
  if (settings.gatePhase === 'closing') return `Closing preview · ${Math.round(state.level)}% open`;
  if (settings.gatePhase === 'countdown') return `Auto-close preview in ${Math.ceil(Number(settings.gateCountdownSec))}s`;
  return state.level === 0 ? 'Closed preview' : `${Math.round(state.level)}% open · ${settings.autoCloseEnabled ? 'fully open to start timer' : 'auto-close off'}`;
}
