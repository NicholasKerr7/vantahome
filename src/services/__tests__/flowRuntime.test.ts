import { startFlowRuntime } from "../flowRuntime";
import {
  useHomeStore,
  type AutomationFlow,
  type AutomationRule,
  type Device,
  type FlowAction,
  type Room,
  type Scene,
} from "../../store/useHomeStore";
import { deviceClient } from "../deviceClient";

jest.mock("../deviceClient", () => ({
  deviceClient: {
    sendCommand: jest.fn(),
  },
}));

jest.mock("../notifications", () => ({
  sendLocalNotification: jest.fn().mockResolvedValue(true),
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
    actions: flow.actions.map(cloneFlowAction),
  }));
}

function cloneFlowAction(action: FlowAction): FlowAction {
  if (action.type === "branch") {
    return {
      ...action,
      condition: { ...action.condition },
      ifActions: action.ifActions.map((item) => cloneFlowAction(item) as any),
      elseActions: action.elseActions?.map((item) => cloneFlowAction(item) as any),
    };
  }
  if (action.type === "patch") {
    return {
      ...action,
      patch: { ...action.patch },
    };
  }
  return { ...action };
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
    await flushPromises();
    useHomeStore.getState().setDevice("d1", { isOn: true });
    await flushPromises();
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(11_000);
    useHomeStore.getState().setDevice("d1", { isOn: false });
    await flushPromises();
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

    stop();

    jest.setSystemTime(new Date(2025, 0, 2, 6, 30, 0));
    const nextDayStop = startFlowRuntime({ timeTickMs: 1_000 });
    jest.advanceTimersByTime(1_000);
    await flushPromises();
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(2);

    nextDayStop();
  });

  it("waits for open-for conditions before running a stateful flow", async () => {
    const devices = cloneDevices(useHomeStore.getState().devices);
    const entry = devices.find((device) => device.id === "d16");
    if (entry) {
      entry.isOn = false;
      entry.openPercent = 0;
    }
    useHomeStore.setState({ devices });

    const flow: AutomationFlow = {
      id: "f-open-for",
      name: "Window Reminder",
      enabled: true,
      triggers: [{ type: "device", deviceId: "d16", state: "open" }],
      conditions: [{ type: "open-for", deviceId: "d16", minutes: 10 }],
      actions: [{ type: "toggle", deviceId: "d2", on: true }],
    };
    useHomeStore.setState({ flows: [flow] });

    const stop = startFlowRuntime({ flowCooldownMs: 1_000, timeTickMs: 1_000 });

    useHomeStore.getState().setDevice("d16", { isOn: true, openPercent: 100 });
    await flushPromises();
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(0);

    jest.setSystemTime(new Date(2025, 0, 1, 6, 39, 59));
    jest.advanceTimersByTime(1_000);
    await flushPromises();
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1_000);
    await flushPromises();
    expect(deviceClient.sendCommand).toHaveBeenCalledTimes(1);

    stop();
  });

  it("runs branch actions when the household and branch conditions match", async () => {
    const household = useHomeStore
      .getState()
      .household.map((member) => ({ ...member, status: "home" as const }));
    useHomeStore.setState({
      household,
      profile: {
        ...useHomeStore.getState().profile,
        presenceGeofenceLatitude: undefined,
        presenceGeofenceLongitude: undefined,
      },
    });

    const flow: AutomationFlow = {
      id: "f-branch",
      name: "Away Sunset Secure",
      enabled: true,
      triggers: [{ type: "presence", memberId: household[0].id, status: "away" }],
      conditions: [
        { type: "household", match: "everyone-away" },
        { type: "sun", relation: "after-sunset" },
      ],
      actions: [
        {
          type: "branch",
          condition: { type: "device", deviceId: "d16", state: "open" },
          ifActions: [
            {
              type: "patch",
              deviceId: "d16",
              patch: { openPercent: 0, isOn: false },
            },
          ],
          elseActions: [{ type: "toggle", deviceId: "d2", on: true }],
        },
      ],
    };
    useHomeStore.setState({ flows: [flow] });
    jest.setSystemTime(new Date(2025, 0, 1, 20, 30, 0));

    const stop = startFlowRuntime({ flowCooldownMs: 1_000, timeTickMs: 1_000 });

    household.forEach((member) => {
      useHomeStore.getState().setHouseholdPresence(member.id, "away");
    });
    useHomeStore.getState().setDevice("d16", { isOn: true, openPercent: 50 });
    await flushPromises();

    expect(deviceClient.sendCommand).toHaveBeenCalledWith({
      op: "patch",
      deviceId: "d16",
      patch: { openPercent: 0, isOn: false },
    });

    stop();
  });
});
