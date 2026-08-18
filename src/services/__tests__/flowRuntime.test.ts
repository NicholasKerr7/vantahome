import { startFlowRuntime } from "../flowRuntime";
import {
  useHomeStore,
  type AutomationFlow,
  type AutomationRule,
  type Device,
  type Room,
  type Scene,
} from "../../store/useHomeStore";
import { deviceClient } from "../deviceClient";
import { sendLocalNotification } from "../notifications";

jest.mock("../deviceClient", () => ({
  deviceClient: {
    sendCommand: jest.fn(),
  },
}));

jest.mock("../notifications", () => ({
  sendLocalNotification: jest.fn(async () => undefined),
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
      if (action.type === "patch") return { ...action, patch: { ...action.patch } };
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

    const stop = startFlowRuntime({ flowCooldownMs: 10_000, timeTickMs: 60_000 });

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
      "VantaHome automation",
      privateMessage,
      { kind: "automation" },
    );
    expect(consoleSpy).not.toHaveBeenCalled();
    stop();
  });
});
