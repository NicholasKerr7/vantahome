import type { DeviceState } from './simulationTypes';

export type FanDirection = 'forward' | 'reverse';

/** A local rotor preview, not measured airflow, motor RPM or connected hardware state. */
export interface FanPreviewState {
  readonly on: boolean;
  readonly speed: number;
  readonly effectiveSpeed: number;
  readonly sleep: boolean;
  readonly direction: FanDirection;
  readonly status: string;
  /** Signed radians per second, matching the existing property's rotor animation. */
  readonly velocity: number;
}

/** Keep property animation and controls on the same bounded speed, sleep cap and direction. */
export function readFanActivity(state: DeviceState): FanPreviewState {
  const speed = typeof state.level === 'number' && Number.isFinite(state.level)
    ? Math.max(0, Math.min(100, state.level)) : 0;
  const sleep = state.settings?.fanSleepMode === true;
  const direction = state.settings?.fanDirection === 'reverse' ? 'reverse' : 'forward';
  const effectiveSpeed = state.on ? (sleep ? Math.min(speed, 35) : speed) : 0;
  const status = !state.on ? 'Off' : effectiveSpeed === 0 ? 'Stopped at 0%' : sleep ? 'Sleep preview' : 'Running preview';
  return {
    on: state.on, speed, effectiveSpeed, sleep, direction, status,
    velocity: effectiveSpeed === 0 ? 0 : effectiveSpeed * 0.13 * (direction === 'reverse' ? -1 : 1),
  };
}
