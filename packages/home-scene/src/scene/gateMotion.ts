import { GATE_CLOSING_PERCENT_PER_SECOND } from '../gateSafetySimulation';
import type { DeviceState } from '../simulationTypes';

const CLOSE_INHIBITORS = ['gateHoldOpen', 'gateVehiclePresent', 'gateBeamBlocked', 'gateEmergencyHold', 'gateEmergencyActive'] as const;

/** Smooth confirmed gate samples without predicting movement ahead of the safety clock.
 * Closing uses the simulator's constant travel speed: exponential easing would slow
 * at each one-second sample and surge at the next. Opening retains its responsive
 * easing. A new close must never continue an unfinished opening animation, and a
 * stop/fault must cancel visual catch-up immediately. This never changes device state.
 */
export function advanceGateMotion(current: number, target: number, gate: DeviceState, delta: number): number {
  const position = Number.isFinite(current) ? Math.max(0, Math.min(100, current)) : 0;
  const destination = Number.isFinite(target) ? Math.max(0, Math.min(100, target)) : position;
  const seconds = Number.isFinite(delta) ? Math.max(0, Math.min(0.08, delta)) : 0;
  const settings = gate.settings;
  if (settings?.gatePhase === 'paused' || settings?.gateSensorFault === true) return position;
  if (destination < position) {
    if (CLOSE_INHIBITORS.some((field) => settings?.[field] === true)) return position;
    return Math.max(destination, position - GATE_CLOSING_PERCENT_PER_SECOND * seconds);
  }
  if (settings?.gatePhase === 'closing') return position;
  const next = position + (destination - position) * -Math.expm1(-2 * seconds);
  return Math.abs(next - destination) < 0.01 ? destination : next;
}
