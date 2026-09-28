/**
 * Pauses the graphics surface for recovery without removing home navigation.
 * Device controls and original app features remain reachable through the shell.
 * Unrecognized values fail closed so a configuration typo cannot enable graphics.
 */
export function isThreeDHomeEnabled(
  configured = process.env.EXPO_PUBLIC_ENABLE_3D_HOME,
): boolean {
  if (configured === undefined || configured.trim() === "") return true;
  return configured.trim().toLowerCase() === "true";
}
