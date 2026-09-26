import { DEVICES, getDevice } from "../../../../packages/home-scene/src/data";
import { readDeviceSetting } from "../../../../packages/home-scene/src/deviceCapabilities";
import type { SimulationSnapshot } from "../../../../packages/home-scene/src/simulationBridgeProtocol";
import type { Device } from "../../../store/useHomeStore";
import { DEMO_DEVICE_MAPPINGS, overlayDemoDevices, projectSimulationToDemo } from "../demoDeviceMapping";

/** Build independent scene samples without loading either application's store. */
function snapshot(): SimulationSnapshot {
  return {
    deviceStates: Object.fromEntries(DEVICES.map((device) => [device.id, {
      on: device.defaultOn, level: device.defaultLevel,
    }])),
    lightingMode: "auto", night: false, motionDisabled: false,
  };
}

/** Minimal typed demo fixture; identities intentionally match only the curated registry. */
function demo(id: string, kind: Device["kind"], fields: Partial<Device> = {}): Device {
  return { id, kind, name: "Demo device", roomId: "demo-room", isOn: true, ...fields };
}

/** Change one scene device without altering the prior snapshot or other references. */
function change(
  previous: SimulationSnapshot,
  id: string,
  patch: Partial<SimulationSnapshot["deviceStates"][string]>,
): SimulationSnapshot {
  return { ...previous, deviceStates: {
    ...previous.deviceStates, [id]: { ...previous.deviceStates[id], ...patch },
  } };
}

describe("explicit demo device correspondence", () => {
  test("has unique paired IDs and every target's expected kind", () => {
    expect(new Set(DEMO_DEVICE_MAPPINGS.map((mapping) => mapping.demoId)).size).toBe(DEMO_DEVICE_MAPPINGS.length);
    expect(new Set(DEMO_DEVICE_MAPPINGS.map((mapping) => mapping.sceneId)).size).toBe(DEMO_DEVICE_MAPPINGS.length);
    for (const mapping of DEMO_DEVICE_MAPPINGS) expect(getDevice(mapping.sceneId)?.kind).toBe(mapping.kind);
  });

  test("does not infer matches from device names, rooms or kinds", () => {
    const previous = snapshot();
    const devices = [demo("d1", "ac", { tempC: 15 }), demo("user-light", "light", { name: "living-light", brightness: 0 })];
    expect(overlayDemoDevices(previous, devices)).toBe(previous);
    expect(projectSimulationToDemo(change(previous, "master-ac", { on: false }), previous, devices)).toBe(devices);
  });

  test("ignores a known ID whose device kind was changed", () => {
    const previous = snapshot();
    const devices = [demo("d2", "camera", { armed: false, isOn: false })];
    expect(overlayDemoDevices(previous, devices)).toBe(previous);
    expect(projectSimulationToDemo(change(previous, "living-light", { on: false, level: 0 }), previous, devices)).toBe(devices);
  });
});

describe("dashboard controls to scene", () => {
  test("overlays only the paired light and preserves scene preferences and unrelated objects", () => {
    const previous = snapshot();
    const result = overlayDemoDevices(previous, [demo("d2", "light", { isOn: false, brightness: 31 })]);
    expect(result.deviceStates["living-light"]).toEqual({ on: false, level: 31 });
    expect(result.deviceStates["kitchen-light"]).toBe(previous.deviceStates["kitchen-light"]);
    expect(result.lightingMode).toBe(previous.lightingMode);
    expect(previous.deviceStates["living-light"].level).not.toBe(31);
    expect(overlayDemoDevices(result, [demo("d2", "light", { isOn: false, brightness: 31 })])).toBe(result);
  });

  test.each([15, 28])("preserves the full AC setpoint at %s C", (tempC) => {
    const result = overlayDemoDevices(snapshot(), [demo("d6", "ac", { tempC, mode: "dry" })]);
    const state = result.deviceStates["master-ac"];
    expect(state.settings).toEqual({ tempC, mode: "dry" });
    expect(state.level).toBeGreaterThanOrEqual(0);
    expect(state.level).toBeLessThanOrEqual(100);
    expect(readDeviceSetting(getDevice("master-ac")!, state, "tempC")).toBe(tempC);
  });

  test("uses the opening percentage as the gate's authoritative status", () => {
    const previous = snapshot();
    const open = overlayDemoDevices(previous, [demo("d26", "gate", { isOn: false, openPercent: 42 })]);
    expect(open.deviceStates["entry-gate"]).toEqual({ on: true, level: 42 });
    const closed = overlayDemoDevices(open, [demo("d26", "gate", { isOn: true, openPercent: 0 })]);
    expect(closed.deviceStates["entry-gate"]).toEqual({ on: false, level: 0 });
  });

  test("represents camera arming independently from power and never exports media URLs", () => {
    const result = overlayDemoDevices(snapshot(), [demo("d15", "camera", {
      isOn: false, armed: true, recording: false, motionSensitivity: 7,
      streamUrl: "https://private.invalid/stream", thumbnailUrl: "https://private.invalid/image",
      lastSeenAt: 123, observedAt: 456,
    })]);
    expect(result.deviceStates["entry-camera"].on).toBe(true);
    expect(result.deviceStates["entry-camera"].settings).toEqual({ armed: true, recording: false, motionSensitivity: 7 });
    expect(JSON.stringify(result)).not.toContain("private.invalid");
    expect(JSON.stringify(result)).not.toContain("observedAt");
  });

  test("shares allowed monitor preferences without power or telemetry", () => {
    const previous = change(snapshot(), "utility-energy", { on: true, settings: { sampleChecked: true } });
    const result = overlayDemoDevices(previous, [demo("d20", "energy", {
      isOn: false, powerW: 9000, gridAvailable: false, energyBudgetKwh: 160, gridOutageAlerts: false,
    })]);
    expect(result.deviceStates["utility-energy"]).toEqual({
      ...previous.deviceStates["utility-energy"],
      settings: { sampleChecked: true, energyBudgetKwh: 160, gridOutageAlerts: false },
    });
  });

  test("copies writable appliance controls but no progress readings or schedules", () => {
    const result = overlayDemoDevices(snapshot(), [demo("d18", "washer", {
      isOn: false, cycle: "Eco", spinSpeedRpm: 1200, progress: 88, remainingMin: 5, rinseCount: 3,
    })]);
    expect(result.deviceStates["laundry-washer"].settings).toEqual({ cycle: "Eco", spinSpeedRpm: 1200, rinseCount: 3 });
  });

  test("bounds finite ranges and ignores non-finite or unsupported settings", () => {
    const previous = snapshot();
    const result = overlayDemoDevices(previous, [
      demo("d2", "light", { brightness: 1000 }),
      demo("d6", "ac", { tempC: NaN }),
      demo("d18", "washer", { cycle: "Unknown", spinSpeedRpm: 900 }),
    ]);
    expect(result.deviceStates["living-light"].level).toBe(100);
    expect(result.deviceStates["master-ac"].settings).toBeUndefined();
    expect(result.deviceStates["laundry-washer"].settings).toBeUndefined();
  });
});

describe("scene controls to dashboard", () => {
  test("updates only changed fields and keeps all unrelated object references", () => {
    const previous = snapshot();
    const devices = [demo("d2", "light", { brightness: 72, color: "#123456" }), demo("d8", "light", { brightness: 83 })];
    const result = projectSimulationToDemo(change(previous, "living-light", { on: false, level: 24 }), previous, devices);
    expect(result[0]).toEqual({ ...devices[0], isOn: false, brightness: 24 });
    expect(result[1]).toBe(devices[1]);
    expect(devices[0].brightness).toBe(72);
  });

  test("does not overwrite newer dashboard edits with untouched scene defaults", () => {
    const previous = snapshot();
    const devices = [demo("d2", "light", { brightness: 91 })];
    const result = projectSimulationToDemo(change(previous, "living-light", { on: false }), previous, devices);
    expect(result[0].brightness).toBe(91);
    expect(result[0].isOn).toBe(false);
  });

  test.each([15, 28])("returns the full AC setpoint at %s C", (tempC) => {
    const previous = change(snapshot(), "master-ac", { settings: { tempC: 21 } });
    const devices = [demo("d6", "ac", { tempC: 21 })];
    const result = projectSimulationToDemo(change(previous, "master-ac", { settings: { tempC } }), previous, devices);
    expect(result[0].tempC).toBe(tempC);
  });

  test("sets gate position and open status in one update", () => {
    const previous = snapshot();
    const devices = [demo("d26", "gate", { isOn: false, openPercent: 0, autoOpenEnabled: true })];
    const opened = change(previous, "entry-gate", { on: false, level: 75 });
    const result = projectSimulationToDemo(opened, previous, devices);
    expect(result[0]).toEqual({ ...devices[0], isOn: true, openPercent: 75 });
    const closed = projectSimulationToDemo(change(opened, "entry-gate", { on: true, level: 0 }), opened, result);
    expect(closed[0].isOn).toBe(false);
  });

  test("disarms a camera without cutting power or changing its URL or timestamps", () => {
    const previous = change(snapshot(), "entry-camera", { on: true });
    const devices = [demo("d15", "camera", { armed: true, streamUrl: "private-stream", lastSeenAt: 100 })];
    const result = projectSimulationToDemo(change(previous, "entry-camera", { on: false }), previous, devices);
    expect(result[0]).toEqual({ ...devices[0], armed: false });
    expect(result[0].isOn).toBe(true);
  });

  test("does not project sensor samples, monitor power or unapproved metadata", () => {
    const previous = snapshot();
    const devices = [demo("d20", "energy", { powerW: 680, gridAvailable: true })];
    const result = projectSimulationToDemo(change(previous, "utility-energy", {
      on: false, settings: { sampleChecked: true, powerW: 99999, gridAvailable: false, streamUrl: "untrusted" },
    }), previous, devices);
    expect(result).toBe(devices);
  });

  test("projects writable monitor preferences and appliance action values", () => {
    const previous = snapshot();
    const devices = [demo("d20", "energy", { energyBudgetKwh: 120 }), demo("d19", "microwave", { isOn: false, timeRemainingSec: 0 })];
    const energy = change(previous, "utility-energy", { settings: { energyBudgetKwh: 190 } });
    const updated = change(energy, "kitchen-microwave", { on: true, settings: { timeRemainingSec: 60 } });
    const result = projectSimulationToDemo(updated, previous, devices);
    expect(result[0].energyBudgetKwh).toBe(190);
    expect(result[1]).toEqual({ ...devices[1], isOn: true, timeRemainingSec: 60 });
  });

  test("bounds changed finite controls and ignores invalid enum and non-finite controls", () => {
    const previous = snapshot();
    const devices = [demo("d2", "light", { brightness: 72 }), demo("d6", "ac", { tempC: 22, mode: "cold" })];
    const light = change(previous, "living-light", { level: -50 });
    const updated = change(light, "master-ac", { settings: { tempC: Infinity, mode: "untrusted-mode" } });
    const result = projectSimulationToDemo(updated, previous, devices);
    expect(result[0].brightness).toBe(0);
    expect(result[1]).toBe(devices[1]);
  });

  test("retains array identity for unchanged, missing and equal-valued scene states", () => {
    const previous = snapshot();
    const devices = [demo("d2", "light", { brightness: 72 })];
    expect(projectSimulationToDemo(previous, previous, devices)).toBe(devices);
    expect(projectSimulationToDemo(change(previous, "living-light", {}), previous, devices)).toBe(devices);
    const missing = { ...previous, deviceStates: {} };
    expect(projectSimulationToDemo(missing, previous, devices)).toBe(devices);
    expect(projectSimulationToDemo(previous, missing, devices)).toBe(devices);
  });

  test("round-trips paired preferences without touching unmapped devices", () => {
    const devices = [demo("d2", "light", { brightness: 17 }), demo("d6", "ac", { tempC: 27, mode: "fan" }), demo("d1", "ac", { tempC: 19 })];
    const initial = overlayDemoDevices(snapshot(), devices);
    const next = change(change(initial, "living-light", { on: false, level: 55 }), "master-ac", { settings: { tempC: 15, mode: "dry" } });
    const projected = projectSimulationToDemo(next, initial, devices);
    const roundTrip = overlayDemoDevices(next, projected);
    expect(roundTrip.deviceStates["living-light"]).toEqual(next.deviceStates["living-light"]);
    expect(roundTrip.deviceStates["master-ac"].settings).toEqual({ tempC: 15, mode: "dry" });
    expect(projected[2]).toBe(devices[2]);
  });
});
