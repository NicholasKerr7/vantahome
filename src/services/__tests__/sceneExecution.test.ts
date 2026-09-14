import { useHomeStore, type Scene } from "../../store/useHomeStore";
import { deviceClient } from "../deviceClient";
import { captureSceneScope, executeSceneCommands } from "../sceneExecution";

jest.mock("../../config/runtimeMode", () => ({ runtimePolicy: { requireRealTransport: true } }));
jest.mock("../deviceClient", () => ({
  deviceClient: { sendCommand: jest.fn() },
  CommandAuthorizationError: class extends Error {
    reason: string;
    constructor(reason: string) { super(reason); this.reason = reason; }
  },
}));

const scene: Scene = {
  id: "scene-test", name: "Lights", roomId: "room-a",
  actions: [
    { type: "toggle", deviceId: "light-a", on: true },
    { type: "patch", deviceId: "light-b", patch: { brightness: 40, isOn: true } },
  ],
};

describe("release scene command boundary", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (deviceClient.sendCommand as jest.Mock).mockResolvedValue({ commandId: "test", queued: false });
    useHomeStore.setState({
      authenticatedUserId: "owner-a", accountUserId: "owner-a", activeHomeId: "home-a", sessionEpoch: 10,
      membershipReady: true, activeMemberId: "owner-a", activeSceneId: null, lastSceneRun: null,
      household: [{ id: "owner-a", userId: "owner-a", name: "Owner", role: "Owner", status: "home" }],
      roomMembers: [], memberPermissionOverrides: [],
      devices: [
        { id: "light-a", name: "Light A", roomId: "room-a", kind: "light", isOn: false },
        { id: "light-b", name: "Light B", roomId: "room-a", kind: "light", isOn: false, brightness: 0 },
      ],
      scenes: [scene],
    });
  });

  test("sends every scene action without fabricating observed state", async () => {
    const before = useHomeStore.getState().devices;
    await useHomeStore.getState().runScene(scene.id);
    expect(deviceClient.sendCommand).toHaveBeenNthCalledWith(1, { op: "toggle", deviceId: "light-a", on: true });
    expect(deviceClient.sendCommand).toHaveBeenNthCalledWith(2, { op: "set-properties", deviceId: "light-b", changes: { brightness: 40, isOn: true } });
    expect(useHomeStore.getState().devices).toBe(before);
    expect(useHomeStore.getState().lastSceneRun?.sceneId).toBe(scene.id);
  });

  test("rejects an already-forbidden scene before sending its allowed first action", async () => {
    useHomeStore.setState({ scenes: [{ ...scene, actions: [scene.actions[0], { type: "toggle", deviceId: "foreign-device", on: true }] }] });
    await expect(useHomeStore.getState().runScene(scene.id)).rejects.toMatchObject({ reason: "device_not_found" });
    expect(deviceClient.sendCommand).not.toHaveBeenCalled();
    expect(useHomeStore.getState().activeSceneId).toBeNull();
  });

  test("stops remaining actions when identity changes during a command", async () => {
    (deviceClient.sendCommand as jest.Mock).mockImplementationOnce(async () => {
      useHomeStore.setState({ sessionEpoch: 11 });
    });
    await expect(useHomeStore.getState().runScene(scene.id)).rejects.toMatchObject({ reason: "session_changed" });
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(1);
    expect(useHomeStore.getState().activeSceneId).toBeNull();
  });

  test("rejects an old scope even when the same account has signed back in", async () => {
    const old = captureSceneScope();
    useHomeStore.setState({ sessionEpoch: 11 });
    await expect(executeSceneCommands(scene.actions, old)).rejects.toMatchObject({ reason: "session_changed" });
    expect(deviceClient.sendCommand).not.toHaveBeenCalled();
  });

  test("aborting an automation stops its remaining scene actions", async () => {
    const lifetime = new AbortController();
    (deviceClient.sendCommand as jest.Mock).mockImplementationOnce(async () => { lifetime.abort(); });
    await expect(useHomeStore.getState().runScene(scene.id, { signal: lifetime.signal }))
      .rejects.toMatchObject({ reason: "session_changed" });
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(1);
  });

  test("undo requests use the same command boundary without directly restoring state", async () => {
    const before = useHomeStore.getState().devices;
    await executeSceneCommands([{ type: "patch", deviceId: "light-a", patch: { isOn: false } }], captureSceneScope());
    expect(deviceClient.sendCommand).toHaveBeenCalledWith({ op: "set-properties", deviceId: "light-a", changes: { isOn: false } });
    expect(useHomeStore.getState().devices).toBe(before);
  });

  test("resolves implicit toggles sequentially without mutating the live device", async () => {
    await executeSceneCommands([
      { type: "toggle", deviceId: "light-a" }, { type: "toggle", deviceId: "light-a" },
    ], captureSceneScope());
    expect(deviceClient.sendCommand).toHaveBeenNthCalledWith(1, { op: "toggle", deviceId: "light-a", on: true });
    expect(deviceClient.sendCommand).toHaveBeenNthCalledWith(2, { op: "toggle", deviceId: "light-a", on: false });
    expect(useHomeStore.getState().devices[0].isOn).toBe(false);
  });
});
