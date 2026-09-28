import { deviceClient } from "../../services/deviceClient";
import { useHomeStore } from "../../store/useHomeStore";
import { addMissingGasDemoDevices, createGasDemoDevices } from "./gasDemoDevices";
import { reduceGasDemoIntent, runGasDemoIntent } from "./gasDemoControls";

const seed = useHomeStore.getState();

/** Install isolated local demo ownership before testing simulation actions. */
beforeEach(() => {
  useHomeStore.setState({
    ...seed, accountUserId: null, authenticatedUserId: null, accountHomeId: null, activeHomeId: null,
    realtime: { enabled: false, useMqtt: false, wsUrl: "" }, activeMemberId: "gas-owner",
    household: [{ id: "gas-owner", name: "Demo", role: "Owner", status: "home", avatarColor: "#000000" }],
    devices: createGasDemoDevices(),
  });
});
afterEach(() => { deviceClient.resetSession(); useHomeStore.setState(seed); });

test("usage and refill use the shared sample quantities and preserve identity", () => {
  const initial = createGasDemoDevices();
  const used = reduceGasDemoIntent(initial, "d40", { type: "action", actionId: "gas-meter-use-sample" });
  expect(used[0]).toMatchObject({ id: "d40", gasRemainingKg: 8.5, gasTodayKg: 1, gasMonthKg: 6.5, gasRemainingPercent: 68 });
  expect(used[1]).toBe(initial[1]);
  const filled = reduceGasDemoIntent(used, "d40", { type: "action", actionId: "gas-meter-refill" });
  expect(filled[0]).toMatchObject({ gasRemainingKg: 12.5, gasRemainingPercent: 100, gasTodayKg: 1 });
  expect(initial[0].gasRemainingKg).toBe(8.75);
});

test("leak, silence and self-test preserve active detection and keep the supply closed", () => {
  let devices = reduceGasDemoIntent(createGasDemoDevices(), "d41", { type: "action", actionId: "gas-leak-simulate-leak" });
  expect(devices[0]).toMatchObject({ gasValveOpen: false, gasLeakInterlock: true });
  expect(devices[1]).toMatchObject({ gasLeakDetected: true, gasConcentrationPercentLel: 35 });
  devices = reduceGasDemoIntent(devices, "d41", { type: "action", actionId: "gas-leak-silence" });
  expect(devices[1]).toMatchObject({ gasLeakDetected: true, gasAlarmSilenced: true });
  devices = reduceGasDemoIntent(devices, "d41", { type: "action", actionId: "gas-leak-self-test" });
  expect(devices[1]).toMatchObject({ gasLeakDetected: true, gasTestCount: 1, gasTestResult: "passed" });
  devices = reduceGasDemoIntent(devices, "d40", { type: "action", actionId: "gas-meter-open-valve" });
  expect(devices[0].gasValveOpen).toBe(false);
  devices = reduceGasDemoIntent(devices, "d41", { type: "action", actionId: "gas-leak-clear-leak" });
  expect(devices[1]).toMatchObject({ gasLeakDetected: false, gasAlarmSilenced: false });
  expect(devices[0]).toMatchObject({ gasValveOpen: false, gasLeakInterlock: false });
});

test("preferences affect derived outcomes while unknown controls and devices are ignored", () => {
  const initial = createGasDemoDevices();
  const next = reduceGasDemoIntent(initial, "d40", { type: "setting", field: "gasBudgetKg", value: 5 });
  expect(next[0]).toMatchObject({ gasBudgetKg: 5, gasBudgetExceeded: true });
  expect(reduceGasDemoIntent(initial, "unknown", { type: "action", actionId: "gas-meter-refill" })).toBe(initial);
  expect(reduceGasDemoIntent(initial, "d40", { type: "setting", field: "roomId", value: "other" })).toBe(initial);
  expect(reduceGasDemoIntent(initial, "d40", { type: "setting", field: "gasBudgetKg", value: Number.NaN })).toBe(initial);
});

test("actions update the original demo immediately without sending a hardware command", () => {
  const send = jest.spyOn(deviceClient, "sendCommand");
  expect(runGasDemoIntent("d41", { type: "action", actionId: "gas-leak-self-test" })).toBe(true);
  expect(useHomeStore.getState().devices[1].gasTestCount).toBe(1);
  expect(send).not.toHaveBeenCalled();
  send.mockRestore();
});

test.each([
  { accountUserId: "account" }, { authenticatedUserId: "account" }, { activeHomeId: "home" },
  { accountHomeId: "home" }, { realtime: { enabled: true, useMqtt: false, wsUrl: "" } },
  { realtime: { enabled: false, useMqtt: true, wsUrl: "" } }, { activeMemberId: "other" },
])("refuses gas actions after the local demo scope changes %#", (change) => {
  useHomeStore.setState(change);
  const devices = useHomeStore.getState().devices;
  expect(runGasDemoIntent("d41", { type: "action", actionId: "gas-leak-simulate-leak" })).toBe(false);
  expect(useHomeStore.getState().devices).toBe(devices);
});

test.each(["d40", "d41"])("rejects generic power commands before a transport for %s", async (deviceId) => {
  const transport = jest.fn();
  const clear = deviceClient.setCommandTransport(transport);
  await expect(deviceClient.sendCommand({ op: "toggle", deviceId, on: false })).rejects.toMatchObject({ reason: "simulation_only_device" });
  expect(transport).not.toHaveBeenCalled();
  expect(deviceClient.getRetryStatus().pending).toBe(0);
  clear();
});

test("demo upgrade appends missing gas samples once without replacing saved device data", () => {
  const initial = [{ ...createGasDemoDevices()[0], gasRemainingKg: 3 }];
  const upgraded = addMissingGasDemoDevices(initial);
  expect(upgraded.map((device) => device.id)).toEqual(["d40", "d41"]);
  expect(upgraded[0]).toBe(initial[0]);
  expect(addMissingGasDemoDevices(upgraded)).toBe(upgraded);
});

test("version 5 migration adds gas only to local demos and never re-adds deleted version 6 samples", () => {
  const migrate = useHomeStore.persist.getOptions().migrate!;
  expect(migrate({ accountUserId: null, devices: [] }, 5)).toMatchObject({ devices: createGasDemoDevices() });
  const account = { accountUserId: "real-account", devices: [] };
  expect(migrate(account, 5)).toBe(account);
  const edited = { accountUserId: null, devices: [] };
  expect(migrate(edited, 6)).toBe(edited);
});

test.each([2, 3, 4])("version %s local demo migration also receives the gas pair", (version) => {
  const migrate = useHomeStore.persist.getOptions().migrate!;
  expect(migrate({ accountUserId: null, devices: [] }, version)).toMatchObject({ devices: createGasDemoDevices() });
  expect(migrate({ accountUserId: "real-account", devices: [] }, version)).toMatchObject({ devices: [] });
});
