import { startFlowRuntime } from "../flowRuntime";
import {
  useHomeStore,
  type AutomationFlow,
  type AutomationRule,
  type Device,
  type Room,
  type Scene,
} from "../../store/useHomeStore";
import { canManageRoutines, routineId } from "../../store/routines";
import { deviceClient } from "../deviceClient";
import { sendLocalNotification } from "../notifications";

jest.mock("../deviceClient", () => ({
  deviceClient: {
    sendCommand: jest.fn(),
  },
}));

jest.mock("../notifications", () => ({
  sendLocalNotification: jest.fn<Promise<void>, Parameters<typeof import("../notifications").sendLocalNotification>>(async () => undefined),
}));

function cloneRooms(rooms: Room[]) {
  return rooms.map((room) => ({ ...room }));
}

function cloneDevices(devices: Device[]) {
  return devices.map((device) => ({ ...device }));
}

function cloneRules(rules: AutomationRule[]) {
  return rules.map((rule) => ({
    ...rule,
    trigger: { ...rule.trigger },
    action: { ...(rule.action as any) },
  }));
}

function cloneFlows(flows: AutomationFlow[]) {
  return flows.map((flow) => ({
    ...flow,
    triggers: flow.triggers.map((trigger) => ({ ...trigger })),
    conditions: flow.conditions.map((condition) => ({ ...condition })),
    actions: flow.actions.map((action) => ({ ...action })),
  }));
}

function cloneScenes(scenes: Scene[]) {
  return scenes.map((scene) => ({
    ...scene,
    actions: scene.actions.map((action) => {
      if (action.type === "patch")
        return { ...action, patch: { ...action.patch } };
      return { ...action };
    }),
  }));
}

const seed = useHomeStore.getState();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2025, 0, 1, 6, 30, 0));
  jest.clearAllMocks();

  useHomeStore.setState({
    accountUserId: seed.accountUserId,
    authenticatedUserId: seed.authenticatedUserId,
    activeHomeId: seed.activeHomeId,
    membershipReady: seed.membershipReady,
    sessionEpoch: seed.sessionEpoch,
    memberPermissionOverrides: [],
    userName: seed.userName,
    profile: { ...seed.profile },
    outdoor: { ...seed.outdoor },
    indoor: { ...seed.indoor },
    rooms: cloneRooms(seed.rooms),
    devices: cloneDevices(seed.devices),
    rules: [],
    flows: cloneFlows(seed.flows),
    scenes: cloneScenes(seed.scenes),
    activeSceneId: seed.activeSceneId,
    lastSceneRun: seed.lastSceneRun,
    integrations: { ...seed.integrations },
    preferences: { ...seed.preferences },
    realtime: { ...seed.realtime },
    household: seed.household.map((member) => ({ ...member })),
    roomMembers: seed.roomMembers.map((member) => ({ ...member })),
    activeMemberId: seed.activeMemberId,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const flushPromises = () => Promise.resolve();

describe("flowRuntime", () => {
  it("executes visible routines for a read-only member without evaluating hidden-room references", async () => {
    const visible = seed.devices.find((device) => device.id === "d2")!;
    const hidden = seed.devices.find((device) => device.roomId !== visible.roomId)!;
    useHomeStore.setState({
      household: [{ id: "guest", name: "Guest", role: "Guest", status: "home" }],
      activeMemberId: "guest", roomMembers: [{ memberId: "guest", roomIds: [visible.roomId] }],
      scenes: [{ id: "private-scene", roomId: hidden.roomId, name: "Private", actions: [] }],
      flows: [
        { id: "visible", name: "Visible", enabled: true, triggers: [{ type: "time", hour: 6, minute: 30 }],
          conditions: [], actions: [{ type: "notify", message: "Visible routine" }] },
        { id: "hidden-device", name: "Hidden device", enabled: true,
          triggers: [{ type: "device", deviceId: hidden.id, state: hidden.isOn ? "off" : "on" }],
          conditions: [], actions: [{ type: "notify", message: "Private device state" }] },
        { id: "hidden-condition", name: "Hidden condition", enabled: true,
          triggers: [{ type: "time", hour: 6, minute: 30 }],
          conditions: [{ type: "device", deviceId: hidden.id, state: hidden.isOn ? "on" : "off" }],
          actions: [{ type: "notify", message: "Private condition" }] },
        { id: "hidden-scene", name: "Hidden scene", enabled: true,
          triggers: [{ type: "scene", sceneId: "private-scene" }], conditions: [],
          actions: [{ type: "notify", message: "Private scene activity" }] },
      ],
    });
    expect(canManageRoutines(useHomeStore.getState())).toBe(false);
    const stop = startFlowRuntime();
    useHomeStore.getState().setDevice(hidden.id, { isOn: !hidden.isOn });
    useHomeStore.setState({ lastSceneRun: { sceneId: "private-scene", ts: Date.now() } });
    await flushPromises();
    expect(sendLocalNotification).toHaveBeenCalledTimes(1);
    expect(jest.mocked(sendLocalNotification).mock.calls[0][1]).toBe("Visible routine");
    stop();
  });

  it("permanently fences a pending notification when household viewing permission is revoked", async () => {
    let finishNotification!: () => void;
    jest.mocked(sendLocalNotification).mockImplementationOnce(() => new Promise<void>((resolve) => { finishNotification = resolve; }));
    useHomeStore.setState({
      household: [{ id: "member", name: "Member", role: "Member", status: "home" }], activeMemberId: "member",
      flows: [{ id: "permission", name: "Permission", enabled: true,
        triggers: [{ type: "time", hour: 6, minute: 30 }], conditions: [],
        actions: [{ type: "notify", message: "Private notification" }] }],
    });
    const stop = startFlowRuntime();
    const guard = jest.mocked(sendLocalNotification).mock.calls[0][3]!;
    expect(guard.shouldSend()).toBe(true);
    useHomeStore.setState({ memberPermissionOverrides: [{ memberId: "member", permission: "device.view", allowed: false }] });
    expect(guard.shouldSend()).toBe(false);
    useHomeStore.setState({ memberPermissionOverrides: [] });
    expect(guard.shouldSend()).toBe(false);
    finishNotification();
    await flushPromises();
    stop();
  });

  it("fences notifications when verified membership disappears during an asynchronous permission request", async () => {
    let finishNotification!: () => void;
    jest.mocked(sendLocalNotification).mockImplementationOnce(() => new Promise<void>((resolve) => { finishNotification = resolve; }));
    useHomeStore.setState({
      accountUserId: "account", authenticatedUserId: "account", activeHomeId: "home", membershipReady: true,
      flows: [{ id: "membership", name: "Membership", enabled: true,
        triggers: [{ type: "time", hour: 6, minute: 30 }], conditions: [],
        actions: [{ type: "notify", message: "Private notification" }] }],
    });
    const stop = startFlowRuntime();
    const guard = jest.mocked(sendLocalNotification).mock.calls[0][3]!;
    expect(guard.shouldSend()).toBe(true);
    useHomeStore.setState({ membershipReady: false });
    expect(guard.shouldSend()).toBe(false);
    useHomeStore.setState({ membershipReady: true });
    expect(guard.shouldSend()).toBe(false);
    finishNotification();
    await flushPromises();
    stop();
  });

  it("runs legacy schedules and same-ID flows once each through one dispatcher", async () => {
    useHomeStore.setState({
      rules: [{ id: "shared", name: "Schedule", enabled: true,
        trigger: { type: "time", hour: 6, minute: 30 },
        action: { type: "toggle", deviceId: "d2", on: true } }],
      flows: [{ id: "shared", name: "Routine", enabled: true,
        triggers: [{ type: "time", hour: 6, minute: 30 }, { type: "time", hour: 6, minute: 30 }],
        conditions: [], actions: [{ type: "set-brightness", deviceId: "d2", brightness: 70 }] }],
    });
    const stop = startFlowRuntime({ timeTickMs: 1_000, flowCooldownMs: 0 });
    await jest.advanceTimersByTimeAsync(20_000);
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(2);
    expect(deviceClient.sendCommand).toHaveBeenCalledWith({ op: "toggle", deviceId: "d2", on: true });
    expect(deviceClient.sendCommand).toHaveBeenCalledWith({ op: "set-brightness", deviceId: "d2", value: 70 });
    stop();
  });

  it("does not rerun a schedule promoted to richer steps within the same minute", async () => {
    useHomeStore.setState({ flows: [], rules: [{ id: "upgrade", name: "Upgrade", enabled: true,
      trigger: { type: "time", hour: 6, minute: 30 }, action: { type: "toggle", deviceId: "d2", on: true } }] });
    const stop = startFlowRuntime({ timeTickMs: 1_000, flowCooldownMs: 0 });
    await flushPromises();
    useHomeStore.getState().updateRoutine(routineId("rule", "upgrade"), {
      actions: [{ type: "toggle", deviceId: "d2", on: true }, { type: "notify", message: "Ready" }],
    });
    await jest.advanceTimersByTimeAsync(20_000);
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(1);
    expect(sendLocalNotification).not.toHaveBeenCalled();
    jest.setSystemTime(new Date(2025, 0, 2, 6, 30, 0));
    await jest.advanceTimersByTimeAsync(1_000);
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(2);
    expect(sendLocalNotification).toHaveBeenCalledTimes(1);
    stop();
  });

  it("honors day conditions after a schedule is upgraded", async () => {
    useHomeStore.setState({ flows: [], rules: [{ id: "weekday", name: "Weekday", enabled: true,
      trigger: { type: "time", hour: 6, minute: 30 }, action: { type: "toggle", deviceId: "d2", on: true } }] });
    useHomeStore.getState().updateRoutine(routineId("rule", "weekday"), { conditions: [{ type: "day", days: ["Thu"] }] });
    const stop = startFlowRuntime({ timeTickMs: 1_000 });
    await flushPromises();
    expect(deviceClient.sendCommand).not.toHaveBeenCalled();
    jest.setSystemTime(new Date(2025, 0, 2, 6, 30, 0));
    await jest.advanceTimersByTimeAsync(1_000);
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(1);
    stop();
  });

  it("fences pending steps when the account/home session changes", async () => {
    useHomeStore.setState({ flows: [{ id: "scoped", name: "Scoped", enabled: true,
      triggers: [{ type: "time", hour: 6, minute: 30 }], conditions: [],
      actions: [{ type: "delay", seconds: 5 }, { type: "toggle", deviceId: "d2", on: true }, { type: "notify", message: "Private" }] }] });
    const stop = startFlowRuntime();
    useHomeStore.setState({ sessionEpoch: useHomeStore.getState().sessionEpoch + 1 });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(deviceClient.sendCommand).not.toHaveBeenCalled();
    expect(sendLocalNotification).not.toHaveBeenCalled();
    stop();
  });

  it("permanently cancels a delayed run even if the routine is immediately re-enabled", async () => {
    useHomeStore.setState({ flows: [{ id: "disabled", name: "Disabled", enabled: true,
      triggers: [{ type: "time", hour: 6, minute: 30 }], conditions: [],
      actions: [{ type: "delay", seconds: 5 }, { type: "toggle", deviceId: "d2", on: true }] }] });
    const stop = startFlowRuntime();
    useHomeStore.getState().toggleRoutine(routineId("flow", "disabled"));
    useHomeStore.getState().toggleRoutine(routineId("flow", "disabled"));
    await jest.advanceTimersByTimeAsync(10_000);
    expect(deviceClient.sendCommand).not.toHaveBeenCalled();
    stop();
  });

  it("retains command authorization failures and stops dependent actions", async () => {
    jest.mocked(deviceClient.sendCommand).mockRejectedValueOnce(new Error("action_permission_denied"));
    useHomeStore.setState({ flows: [{ id: "denied", name: "Denied", enabled: true,
      triggers: [{ type: "time", hour: 6, minute: 30 }], conditions: [],
      actions: [{ type: "toggle", deviceId: "d2", on: true }, { type: "notify", message: "Must not report success" }] }] });
    const stop = startFlowRuntime();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(1);
    expect(sendLocalNotification).not.toHaveBeenCalled();
    stop();
  });

  it("cancels delayed commands and notifications when the session runtime stops", async () => {
    useHomeStore.setState({
      flows: [
        {
          id: "delayed",
          name: "Delayed",
          enabled: true,
          triggers: [{ type: "time", hour: 6, minute: 30 }],
          conditions: [],
          actions: [
            { type: "delay", seconds: 30 },
            { type: "toggle", deviceId: "d1", on: true },
            { type: "notify", message: "Private household event" },
          ],
        },
      ],
    });
    const stop = startFlowRuntime();
    stop();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(deviceClient.sendCommand).not.toHaveBeenCalled();
    expect(sendLocalNotification).not.toHaveBeenCalled();
  });
  it("runs device-triggered flows and respects cooldown", async () => {
    const devices = cloneDevices(useHomeStore.getState().devices);
    const d1 = devices.find((device) => device.id === "d1");
    if (d1) d1.isOn = false;
    useHomeStore.setState({ devices });

    const flow: AutomationFlow = {
      id: "f-test",
      name: "Test Flow",
      enabled: true,
      triggers: [{ type: "device", deviceId: "d1", state: "on" }],
      conditions: [],
      actions: [{ type: "toggle", deviceId: "d2", on: true }],
    };
    useHomeStore.setState({ flows: [flow] });

    const stop = startFlowRuntime({
      flowCooldownMs: 10_000,
      timeTickMs: 60_000,
    });

    useHomeStore.getState().setDevice("d1", { isOn: true });
    await flushPromises();
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(1);

    useHomeStore.getState().setDevice("d1", { isOn: false });
    useHomeStore.getState().setDevice("d1", { isOn: true });
    await flushPromises();
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date(2025, 0, 1, 6, 30, 11));
    useHomeStore.getState().setDevice("d1", { isOn: false });
    useHomeStore.getState().setDevice("d1", { isOn: true });
    await flushPromises();
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(2);

    stop();
  });

  it("fires time triggers once per minute", async () => {
    const flow: AutomationFlow = {
      id: "f-time",
      name: "Morning",
      enabled: true,
      triggers: [{ type: "time", hour: 6, minute: 30 }],
      conditions: [],
      actions: [{ type: "set-brightness", deviceId: "d2", brightness: 75 }],
    };
    useHomeStore.setState({ flows: [flow] });

    const stop = startFlowRuntime({ timeTickMs: 1_000 });
    jest.advanceTimersByTime(1_000);
    await flushPromises();
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1_000);
    await flushPromises();
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date(2025, 0, 2, 6, 30, 0));
    jest.advanceTimersByTime(1_000);
    await flushPromises();
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(2);

    stop();
  });

  it("keeps notification delivery fenced while OS permission is pending", async () => {
    useHomeStore.setState({ flows: [{ id: "notify-scope", name: "Notify scope", enabled: true,
      triggers: [{ type: "time", hour: 6, minute: 30 }], conditions: [],
      actions: [{ type: "notify", message: "Private routine event" }] }] });
    const stop = startFlowRuntime();
    const options = jest.mocked(sendLocalNotification).mock.calls[0][3];
    expect(options?.shouldSend()).toBe(true);
    useHomeStore.setState({ activeHomeId: "different-home" });
    expect(options?.shouldSend()).toBe(false);
    stop();
  });

  it("delivers notification actions without logging their private message", async () => {
    const privateMessage = "Resident arrived at the private entrance";
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const devices = cloneDevices(useHomeStore.getState().devices);
    const d1 = devices.find((device) => device.id === "d1");
    if (d1) d1.isOn = false;
    useHomeStore.setState({
      devices,
      flows: [
        {
          id: "f-notify",
          name: "Arrival",
          enabled: true,
          triggers: [{ type: "device", deviceId: "d1", state: "on" }],
          conditions: [],
          actions: [{ type: "notify", message: privateMessage }],
        },
      ],
    });

    const stop = startFlowRuntime({ timeTickMs: 60_000 });
    useHomeStore.getState().setDevice("d1", { isOn: true });
    await flushPromises();

    expect(sendLocalNotification).toHaveBeenCalledWith(
      "VantaHome routine",
      privateMessage,
      { kind: "automation" },
      { shouldSend: expect.any(Function) },
    );
    expect(consoleSpy).not.toHaveBeenCalled();
    stop();
  });
});
