import * as LocalAuthentication from "expo-local-authentication";
import { runtimePolicy } from "../config/runtimeMode";
import type { ActionPermission } from "./permissions";

const BIOMETRIC_PERMISSIONS = new Set<ActionPermission>([
  "lock.unlock",
  "garage.open",
  "alarm.arm",
  "alarm.disarm",
  "camera.manage",
]);

export class BiometricConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BiometricConfirmationError";
  }
}

export function requiresProtectedAccess() {
  return runtimePolicy.requireRealTransport;
}

export async function confirmProtectedAccess(promptMessage: string) {
  // Seeded demo/development controls remain usable in Expo Go and simulators.
  // Alpha and production fail closed when strong local authentication is absent.
  if (!requiresProtectedAccess()) return;

  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  if (!hasHardware || !isEnrolled) {
    throw new BiometricConfirmationError(
      "Biometric confirmation is required for this action.",
    );
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });
  if (!result.success) {
    throw new BiometricConfirmationError("Sensitive action was not confirmed.");
  }
}

export async function confirmSensitiveAction(permission: ActionPermission) {
  if (!BIOMETRIC_PERMISSIONS.has(permission)) return;
  await confirmProtectedAccess("Confirm sensitive VantaHome action");
}
