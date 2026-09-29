import { deviceClient } from "../../services/deviceClient";
import type { SceneScope } from "../../services/sceneExecution";
import { selectVisibleDevices, useHomeStore } from "../../store/useHomeStore";
import { getDevice } from "../../../packages/home-scene/src/data";
import { isModelHome } from "../three-d-home/modelHomeScope";
import { nativeRoomQuickAction } from "./roomDevicePresentation";

/** Resolve the current visible device before submitting through the authorized native command pipeline. */
export async function runNativeRoomQuickAction(
  deviceId: string,
  onOpen: () => void,
  scope: SceneScope,
): Promise<void> {
  const state = useHomeStore.getState();
  if (
    scope.userId !== state.authenticatedUserId ||
    scope.homeId !== state.activeHomeId ||
    scope.sessionEpoch !== state.sessionEpoch
  )
    throw new Error("Your home session changed. Reopen the room to continue.");
  const device = selectVisibleDevices(state).find(
    (candidate) => candidate.id === deviceId,
  );
  if (!device)
    throw new Error(
      "This device is no longer available with your home access.",
    );
  if (isModelHome(state) && getDevice(device.id)?.kind === device.kind) {
    onOpen();
    return;
  }
  const action = nativeRoomQuickAction(device);
  if (action.type === "controls") {
    onOpen();
    return;
  }
  await deviceClient.sendCommand(action.command);
}
