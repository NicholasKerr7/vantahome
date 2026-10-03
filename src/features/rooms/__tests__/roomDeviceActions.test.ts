import { deviceClient } from "../../../services/deviceClient";
import { captureSceneScope } from "../../../services/sceneExecution";
import { useHomeStore, type Device } from "../../../store/useHomeStore";
import { runNativeRoomQuickAction } from "../roomDeviceActions";
import { SimulationControlClient } from "../../three-d-home/simulationControlClient";
import { SimulationSession } from "../../three-d-home/simulationSession";
import { SimulationPersistence } from "../../three-d-home/simulationPersistence";
import { executeVoiceCommand } from "../../home-voice/executeVoiceCommand";
import { parseHomeVoiceCommand } from "../../home-voice/voiceCommandParser";
import { roomDevicePresentation } from "../roomDevicePresentation";

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

/** Flush bridge hydration and transaction acknowledgements without a hardware transport. */
async function settleSimulation(): Promise<void> {
  for (let index = 0; index < 24; index += 1) await Promise.resolve();
}

/** Bind a virtual cloud light in an assigned room with independent registry placeholders. */
function configureVirtualGuest() {
  useHomeStore.setState({
    accountUserId: 'guest', authenticatedUserId: 'guest', accountHomeId: 'home', activeHomeId: 'home',
    activeMemberId: 'guest', membershipReady: true, sessionEpoch: 1,
    household: [{ id: 'guest', name: 'Guest', role: 'Guest', status: 'home' }],
    rooms: [{ id: 'bedroom', name: 'Bedroom', modelRoomId: 'master' }],
    roomMembers: [{ memberId: 'guest', roomIds: ['bedroom'] }], memberPermissionOverrides: [],
    devices: [{ id: 'cloud-light', name: 'Bedside light', kind: 'light', roomId: 'bedroom', modelDeviceId: 'master-light', simulationOnly: true, isOn: false }],
  });
}

test('authenticated room quick actions, voice and scene share local state without writing registry observations', async () => {
  configureVirtualGuest();
  const registry = useHomeStore.getState().devices;
  const persistence = new SimulationPersistence({ getItem: async () => null, setItem: async () => undefined });
  const factory = (deliver: ConstructorParameters<typeof SimulationSession>[0], status: ConstructorParameters<typeof SimulationSession>[1]) =>
    new SimulationSession(deliver, status, { persistence, mode: 'demo' });
  const room = new SimulationControlClient(factory);
  const voice = new SimulationControlClient(factory);
  const scene = new SimulationControlClient(factory);
  try {
    for (const client of [room, voice, scene]) client.connect();
    await settleSimulation();
    voice.setPower(['master-light'], true);
    await settleSimulation();
    await runNativeRoomQuickAction('cloud-light', jest.fn(), captureSceneScope(), room);
    await settleSimulation();
    for (const client of [room, voice, scene]) {
      expect(client.getSnapshot().state.deviceStates['master-light'].on).toBe(false);
    }
    expect(roomDevicePresentation(registry[0], room.getSnapshot().state.deviceStates['master-light'], 'master-light'))
      .toMatchObject({ value: 'Off', active: false, quickActionLabel: 'Turn on' });

    const parsed = parseHomeVoiceCommand('turn on primary suite lights');
    if ('error' in parsed) throw new Error(parsed.error);
    expect(executeVoiceCommand(voice, parsed.command)).toEqual({ status: 'scoped' });
    await settleSimulation();
    expect(roomDevicePresentation(registry[0], room.getSnapshot().state.deviceStates['master-light'], 'master-light').active).toBe(true);
    expect(useHomeStore.getState().devices).toBe(registry);
    expect(deviceClient.sendCommand).not.toHaveBeenCalled();

    useHomeStore.setState({ memberPermissionOverrides: [{ memberId: 'guest', permission: 'light.control', allowed: false }] });
    await expect(runNativeRoomQuickAction('cloud-light', jest.fn(), captureSceneScope(), room)).rejects.toThrow('view-only');
    expect(executeVoiceCommand(voice, parsed.command)).toEqual({ status: 'denied' });
    useHomeStore.setState({ roomMembers: [] });
    await expect(runNativeRoomQuickAction('cloud-light', jest.fn(), captureSceneScope(), room)).rejects.toThrow('home access');
    expect(room.getSnapshot().access?.deviceIds).toEqual([]);
  } finally { for (const client of [room, voice, scene]) client.dispose(); }
});

test('virtual quick actions never fall through to physical delivery when a mapping is removed', async () => {
  configureVirtualGuest();
  useHomeStore.setState({ devices: useHomeStore.getState().devices.map((entry) => ({ ...entry, modelDeviceId: null })) });
  await expect(runNativeRoomQuickAction('cloud-light', jest.fn(), captureSceneScope())).rejects.toThrow('model connection');
  expect(deviceClient.sendCommand).not.toHaveBeenCalled();
});
