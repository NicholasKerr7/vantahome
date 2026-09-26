import { startDeviceRealtime } from "../realtime";
import { deviceClient, type DeviceStateEvent } from "../deviceClient";
import { startMqttBridge } from "../mqttBridge";
import { startSupabaseDeviceRealtime } from "../supabaseRealtime";
import { runtimePolicy, type RuntimeMode } from "../../config/runtimeMode";
import { useHomeStore, type HomeState } from "../../store/useHomeStore";

jest.mock("../mqttBridge", () => ({ startMqttBridge: jest.fn() }));
jest.mock("../supabaseClient", () => ({ supabase: null }));
jest.mock("../supabaseRealtime", () => ({ startSupabaseDeviceRealtime: jest.fn() }));
jest.mock("../cloudRegistry", () => ({ logDeviceAuditEvent: jest.fn(async () => undefined) }));
jest.mock("../../security/biometricConfirmation", () => ({ confirmSensitiveAction: jest.fn(async () => undefined) }));
jest.mock("../../config/runtimeMode", () => ({
  runtimePolicy: {
    mode: "demo", allowUnauthenticatedDemo: true, allowMockTelemetry: true,
    allowDirectMqtt: true, requireRealTransport: false,
  },
  isAllowedDirectWebSocketUrl: () => true,
}));

// Only this module's policy mock is mutable; the real runtime policy is frozen.
const policy = runtimePolicy as { mode: RuntimeMode; allowUnauthenticatedDemo: boolean };
const seed = useHomeStore.getState();
let cleanup: (() => void) | undefined;

/** Restore one offline Owner and a known light without introducing a real household. */
function restoreDemo() {
  useHomeStore.setState({
    accountUserId: null, authenticatedUserId: null,
    accountHomeId: null, activeHomeId: null, sessionEpoch: 0,
    activeMemberId: "demo-owner", membershipReady: false,
    household: [{ id: "demo-owner", name: "Owner", role: "Owner", status: "home" }],
    devices: [{ id: "demo-light", name: "Light", kind: "light", roomId: "living", isOn: false, brightness: 30 }],
    roomMembers: [], memberPermissionOverrides: [],
    realtime: { enabled: false, useMqtt: false, wsUrl: "ws://localhost:8088" },
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  policy.mode = "demo";
  policy.allowUnauthenticatedDemo = true;
  deviceClient.resetSession();
  restoreDemo();
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  deviceClient.resetSession();
  useHomeStore.setState(seed, true);
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
});

test("offline dashboard commands update the store without starting transports or telemetry", async () => {
  const connect = jest.spyOn(deviceClient, "connect");
  cleanup = startDeviceRealtime({ enabled: false, enableMockTelemetry: true });
  expect(jest.getTimerCount()).toBe(0);
  const command = deviceClient.sendCommand({ op: "toggle", deviceId: "demo-light", on: true });
  await jest.advanceTimersByTimeAsync(80);
  await command;
  expect(useHomeStore.getState().devices[0].isOn).toBe(true);
  expect(connect).not.toHaveBeenCalled();
  expect(startMqttBridge).not.toHaveBeenCalled();
  expect(startSupabaseDeviceRealtime).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test("the local subscription validates patches and ignores devices absent from this demo", () => {
  const subscribe = jest.spyOn(deviceClient, "subscribeState");
  cleanup = startDeviceRealtime({ enabled: false });
  const receive = subscribe.mock.calls[0][0];
  const originalDevices = useHomeStore.getState().devices;
  for (const event of [
    { deviceId: "unknown", patch: { isOn: true } },
    { deviceId: "demo-light", patch: { id: "replacement", isOn: true } },
    { deviceId: "demo-light", patch: { brightness: Infinity } },
    { deviceId: "demo-light", patch: JSON.parse('{"__proto__":{"isOn":true}}') },
    { deviceId: "demo-light", patch: [] },
  ]) receive(event as DeviceStateEvent);
  expect(useHomeStore.getState().devices).toBe(originalDevices);
  deviceClient.pushState("demo-light", { isOn: true, brightness: 65 });
  expect(useHomeStore.getState().devices[0]).toMatchObject({ isOn: true, brightness: 65 });
});

test.each<RuntimeMode>(["development", "alpha", "production"])(
  "disabled realtime does not subscribe in %s mode", (mode) => {
    policy.mode = mode;
    const subscribe = jest.spyOn(deviceClient, "subscribeState");
    cleanup = startDeviceRealtime({ enabled: false });
    deviceClient.pushState("demo-light", { isOn: true });
    expect(subscribe).not.toHaveBeenCalled();
    expect(useHomeStore.getState().devices[0].isOn).toBe(false);
  },
);

test.each([
  { userId: "signed-in" }, { homeId: "real-home" },
  { useMqtt: true }, { useSupabase: true },
])("disabled realtime rejects supplied network or account scope %j", (options) => {
  const subscribe = jest.spyOn(deviceClient, "subscribeState");
  cleanup = startDeviceRealtime({ enabled: false, ...options });
  expect(subscribe).not.toHaveBeenCalled();
  expect(startMqttBridge).not.toHaveBeenCalled();
  expect(startSupabaseDeviceRealtime).not.toHaveBeenCalled();
});

const outsideDemo: Array<[string, Partial<HomeState>]> = [
  ["account", { accountUserId: "account" }],
  ["authentication", { authenticatedUserId: "account" }],
  ["account home", { accountHomeId: "household" }],
  ["active home", { activeHomeId: "household" }],
  ["realtime enabled", { realtime: { enabled: true, useMqtt: false, wsUrl: "" } }],
  ["MQTT enabled", { realtime: { enabled: false, useMqtt: true, wsUrl: "" } }],
  ["non-owner", { household: [{ id: "demo-owner", name: "Member", role: "Member", status: "home" }] }],
];

test.each(outsideDemo)("does not subscribe with an existing %s scope", (_, patch) => {
  useHomeStore.setState(patch);
  const subscribe = jest.spyOn(deviceClient, "subscribeState");
  cleanup = startDeviceRealtime({ enabled: false });
  expect(subscribe).not.toHaveBeenCalled();
});

test.each([
  ...outsideDemo,
  ["session epoch", { sessionEpoch: 1 }],
  ["active member", { activeMemberId: "someone-else" }],
] as Array<[string, Partial<HomeState>]>) (
  "a %s transition closes old listeners even after the original scope returns", (_, patch) => {
    const subscribeEvents = deviceClient.subscribeState.bind(deviceClient);
    const stopEvents = jest.fn();
    const subscribe = jest.spyOn(deviceClient, "subscribeState").mockImplementation((listener) => {
      const unsubscribe = subscribeEvents(listener);
      return () => { stopEvents(); return unsubscribe(); };
    });
    const subscribeStore = useHomeStore.subscribe.bind(useHomeStore);
    const stopStore = jest.fn();
    jest.spyOn(useHomeStore, "subscribe").mockImplementation((listener) => {
      const unsubscribe = subscribeStore(listener);
      return () => { stopStore(); unsubscribe(); };
    });
    cleanup = startDeviceRealtime({ enabled: false });
    const lateCallback = subscribe.mock.calls[0][0];
    useHomeStore.setState(patch);
    expect(stopEvents).toHaveBeenCalledTimes(1);
    expect(stopStore).toHaveBeenCalledTimes(1);
    restoreDemo();
    lateCallback({ deviceId: "demo-light", patch: { isOn: true }, ts: Date.now() });
    deviceClient.pushState("demo-light", { isOn: true });
    expect(useHomeStore.getState().devices[0].isOn).toBe(false);
    cleanup();
    expect(stopEvents).toHaveBeenCalledTimes(1);
    expect(stopStore).toHaveBeenCalledTimes(1);
  },
);

test("cleanup stops patches and a fresh subscription can resume this offline demo", () => {
  const stop = startDeviceRealtime({ enabled: false });
  stop();
  stop();
  deviceClient.pushState("demo-light", { isOn: true });
  expect(useHomeStore.getState().devices[0].isOn).toBe(false);
  cleanup = startDeviceRealtime({ enabled: false });
  deviceClient.pushState("demo-light", { isOn: true });
  expect(useHomeStore.getState().devices[0].isOn).toBe(true);
});
