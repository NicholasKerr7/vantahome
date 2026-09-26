/**
 * Enables the optional simulation on this integration branch. Explicitly set
 * EXPO_PUBLIC_ENABLE_3D_HOME=false to omit its dashboard entry and stack route.
 * Unrecognized values fail closed so a configuration typo cannot enable it.
 */
export function isThreeDHomeEnabled(
  configured = process.env.EXPO_PUBLIC_ENABLE_3D_HOME,
): boolean {
  if (configured === undefined || configured.trim() === "") return true;
  return configured.trim().toLowerCase() === "true";
}
