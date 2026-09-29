/** This release has a foreground executor; saved settings never imply a paired, always-on hub. */
export const ROUTINE_EXECUTION = {
  summary: 'Runs while app is open · Hub not connected',
  detail: 'Routines currently run on this device while VantaHome is open. A paired home hub will be required for execution when the app is closed.',
} as const;
