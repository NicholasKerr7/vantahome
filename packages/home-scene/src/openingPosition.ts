import type { DeviceState } from './simulationTypes';

export type OpeningDeviceKind = 'door' | 'garage' | 'window';

/** These fixtures share position controls, but never inherit gate safety or blinds behavior. */
export function isOpeningDeviceKind(kind: string): kind is OpeningDeviceKind {
  return kind === 'door' || kind === 'garage' || kind === 'window';
}

/** Read accepted whole-percent position; malformed data must never imply a closed entry. */
export function readOpeningPosition(state: DeviceState): number | null {
  return typeof state.level === 'number' && Number.isFinite(state.level)
    ? Math.round(Math.max(0, Math.min(100, state.level)))
    : null;
}

/** Keep every status surface aligned with position rather than a stale power bit or command. */
export function openingPositionStatus(state: DeviceState): string {
  const position = readOpeningPosition(state);
  if (position === null) return 'Position unavailable';
  if (position === 0) return 'Closed';
  return position === 100 ? 'Fully open' : `${position}% open`;
}
