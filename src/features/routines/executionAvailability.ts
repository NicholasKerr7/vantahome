/** This release has a foreground executor; saved settings never imply a paired, always-on hub. */
export const ROUTINE_EXECUTION = {
  summary: 'Runs while app is open · Hub not connected',
  storage: 'Saved on this device · Not synced across your household',
  detail: 'Routines are saved on this device and currently run only while VantaHome is open. Always-on hub execution and household sync are not connected in this release.',
} as const;
