import { deviceClient } from "../../../services/deviceClient";
import { captureSceneScope } from "../../../services/sceneExecution";
import { useHomeStore, type Device } from "../../../store/useHomeStore";
import { runNativeRoomQuickAction } from "../roomDeviceActions";

jest.mock("../../../services/deviceClient", () => ({
  deviceClient: { sendCommand: jest.fn() },
}));
jest.mock("../../../config/runtimeMode", () => ({
  runtimePolicy: { mode: "demo", allowUnauthenticatedDemo: true },
}));
const seed = useHomeStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  (deviceClient.sendCommand as jest.Mock).mockResolvedValue(undefined);
  useHomeStore.setState({
    ...seed,
    modelCatalogVersion: undefined,
    accountUserId: null,
    authenticatedUserId: null,
    accountHomeId: null,
    activeHomeId: null,
    realtime: { ...seed.realtime, enabled: false, useMqtt: false },
    household: [{ id: "owner", name: "Owner", role: "Owner", status: "home" }],
    activeMemberId: "owner",
    memberPermissionOverrides: [],
    rooms: [{ id: "living", name: "Living room" }],
    devices: [
      {
        id: "living-light",
        kind: "light",
        name: "Light",
        roomId: "living",
        isOn: false,
      },
    ],
  });
});
afterEach(() => useHomeStore.setState(seed));

test("submits current native intent through the existing authorized command service", async () => {
  const onOpen = jest.fn();
  await runNativeRoomQuickAction("living-light", onOpen, captureSceneScope());
  expect(deviceClient.sendCommand).toHaveBeenCalledWith({
    op: "set-properties",
    deviceId: "living-light",
    changes: { isOn: true },
  });
  expect(onOpen).not.toHaveBeenCalled();
});

test("opens a native sensor instead of sending a synthetic power change", async () => {
  useHomeStore.setState({
    devices: [
      {
        id: "sensor",
        kind: "smoke",
        name: "Smoke sensor",
        roomId: "living",
        isOn: true,
      },
    ],
  });
  const onOpen = jest.fn();
  await runNativeRoomQuickAction("sensor", onOpen, captureSceneScope());
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(deviceClient.sendCommand).not.toHaveBeenCalled();
});

test("does not fall through to native commands for a non-owner model member", async () => {
  useHomeStore.setState({
    modelCatalogVersion: 1,
    household: [
      { id: "member", name: "Member", role: "Member", status: "home" },
    ],
    activeMemberId: "member",
  });
  const onOpen = jest.fn();
  await runNativeRoomQuickAction("living-light", onOpen, captureSceneScope());
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(deviceClient.sendCommand).not.toHaveBeenCalled();
});

test("rejects stale room callbacks even when a different account reuses the device ID", async () => {
  const scope = captureSceneScope();
  useHomeStore.setState({
    authenticatedUserId: "another-account",
    activeHomeId: "another-home",
  });
  await expect(
    runNativeRoomQuickAction("living-light", jest.fn(), scope),
  ).rejects.toThrow("session changed");
  expect(deviceClient.sendCommand).not.toHaveBeenCalled();
});

test("rejects a device hidden by current membership and propagates delivery errors", async () => {
  useHomeStore.setState({ devices: [] });
  await expect(
    runNativeRoomQuickAction("living-light", jest.fn(), captureSceneScope()),
  ).rejects.toThrow("home access");
  expect(deviceClient.sendCommand).not.toHaveBeenCalled();
  const light: Device = {
    id: "light",
    name: "Light",
    kind: "light",
    roomId: "living",
    isOn: false,
  };
  useHomeStore.setState({ devices: [light] });
  (deviceClient.sendCommand as jest.Mock).mockRejectedValueOnce(
    new Error("Device is unavailable"),
  );
  await expect(
    runNativeRoomQuickAction("light", jest.fn(), captureSceneScope()),
  ).rejects.toThrow("Device is unavailable");
});
