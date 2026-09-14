import { deviceClient, CommandAuthorizationError, type DeviceCommand } from "./deviceClient";
import { authorizeLocalDeviceCommand } from "../security/localCommandAuthorization";
import { useHomeStore, type SceneAction } from "../store/useHomeStore";

export type SceneScope = {
  userId: string | null;
  homeId: string | null;
  sessionEpoch: number;
};

export function captureSceneScope(): SceneScope {
  const state = useHomeStore.getState();
  return { userId: state.authenticatedUserId, homeId: state.activeHomeId, sessionEpoch: state.sessionEpoch };
}

export function sceneScopeIsCurrent(scope: SceneScope, signal?: AbortSignal) {
  const state = useHomeStore.getState();
  return !signal?.aborted && state.membershipReady && Boolean(scope.userId && scope.homeId) &&
    scope.userId === state.authenticatedUserId && scope.homeId === state.activeHomeId &&
    scope.sessionEpoch === state.sessionEpoch;
}

/** Send scene intent through the same authorization/biometric boundary as a button. */
export async function executeSceneCommands(actions: SceneAction[], scope: SceneScope, signal?: AbortSignal) {
  const assertCurrent = () => {
    if (!sceneScopeIsCurrent(scope, signal)) throw new CommandAuthorizationError("session_changed");
  };
  assertCurrent();
  const projected = new Map(useHomeStore.getState().devices.map((device) => [device.id, device.isOn]));
  const commands = actions.map((action): DeviceCommand => {
    if (action.type === "patch") {
      if (typeof action.patch.isOn === "boolean") projected.set(action.deviceId, action.patch.isOn);
      return { op: "set-properties", deviceId: action.deviceId, changes: action.patch };
    }
    const on = action.on ?? !projected.get(action.deviceId);
    projected.set(action.deviceId, on);
    return { op: "toggle", deviceId: action.deviceId, on };
  });
  // Reject an already-forbidden scene before sending any of its actions. The
  // device client and database still recheck each individual command later.
  for (const command of commands) {
    const authorization = authorizeLocalDeviceCommand(command);
    if (!authorization.allowed) throw new CommandAuthorizationError(authorization.reason);
  }
  for (const command of commands) {
    assertCurrent();
    await deviceClient.sendCommand(command);
    assertCurrent();
  }
}
