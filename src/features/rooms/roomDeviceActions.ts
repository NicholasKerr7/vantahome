import { deviceClient } from "../../services/deviceClient";
import type { SceneScope } from "../../services/sceneExecution";
import { selectVisibleDevices, useHomeStore } from "../../store/useHomeStore";
import { getDevice } from "../../../packages/home-scene/src/data";
import { isModelHome } from "../three-d-home/modelHomeScope";
import { nativeRoomQuickAction } from "./roomDevicePresentation";
import { selectSimulationDeviceBindings } from "../three-d-home/simulationDeviceBindings";
import { canControlModelDevice } from "../three-d-home/modelDeviceControls";
import type { SimulationControlClient } from "../three-d-home/simulationControlClient";

/** Resolve the current visible device before submitting through the authorized native command pipeline. */
export async function runNativeRoomQuickAction(
  deviceId: string,
  onOpen: () => void,
  scope: SceneScope,
  simulation?: SimulationControlClient,
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
  const modelId = selectSimulationDeviceBindings(state)[deviceId];
  if (modelId) {
    if (!simulation) { onOpen(); return; }
    const snapshot = simulation.getSnapshot();
    if (!snapshot.ready) throw new Error("Model controls are reconnecting. Try again in a moment.");
    if (!canControlModelDevice(modelId) || !snapshot.access?.controllableDeviceIds.includes(modelId)) {
      throw new Error("This device is view-only with your current home access.");
    }
    simulation.toggle(modelId);
    return;
  }
  if (device.simulationOnly) {
    throw new Error("This simulated device has no available model connection. Ask your homeowner to review it.");
  }
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
