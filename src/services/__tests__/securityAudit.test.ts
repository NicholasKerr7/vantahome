import {
  collectAwaySecurityIssues,
  formatAwaySecuritySummary,
} from "../securityAudit";
import type { Device } from "../../store/useHomeStore";

function createDevice(overrides: Partial<Device>): Device {
  return {
    id: overrides.id ?? "d1",
    name: overrides.name ?? "Device",
    kind: overrides.kind ?? "door",
    roomId: overrides.roomId ?? "r1",
    isOn: overrides.isOn ?? true,
    ...overrides,
  };
}

describe("securityAudit", () => {
  it("collects open entry points and vulnerable cameras", () => {
    const issues = collectAwaySecurityIssues([
      createDevice({
        id: "door-1",
        name: "Front Door",
        kind: "door",
        openPercent: 35,
      }),
      createDevice({
        id: "window-1",
        name: "Kitchen Window",
        kind: "window",
        openPercent: 20,
      }),
      createDevice({
        id: "camera-1",
        name: "Driveway Cam",
        kind: "camera",
        isOn: true,
        armed: false,
      }),
      createDevice({
        id: "camera-2",
        name: "Backyard Cam",
        kind: "camera",
        isOn: false,
        armed: true,
      }),
      createDevice({
        id: "gate-1",
        name: "Front Gate",
        kind: "gate",
        openPercent: 0,
      }),
    ]);

    expect(issues).toEqual([
      expect.objectContaining({
        deviceId: "door-1",
        detail: "35% open",
      }),
      expect.objectContaining({
        deviceId: "window-1",
        detail: "20% open",
      }),
      expect.objectContaining({
        deviceId: "camera-2",
        detail: "offline",
      }),
      expect.objectContaining({
        deviceId: "camera-1",
        detail: "disarmed",
      }),
    ]);
  });

  it("formats a short away summary with truncation", () => {
    const summary = formatAwaySecuritySummary([
      {
        deviceId: "d1",
        deviceName: "Front Door",
        detail: "35% open",
        priority: 0,
      },
      {
        deviceId: "d2",
        deviceName: "Kitchen Window",
        detail: "20% open",
        priority: 0,
      },
      {
        deviceId: "d3",
        deviceName: "Driveway Cam",
        detail: "offline",
        priority: 1,
      },
      {
        deviceId: "d4",
        deviceName: "Patio Cam",
        detail: "disarmed",
        priority: 1,
      },
    ]);

    expect(summary).toBe(
      "Front Door 35% open, Kitchen Window 20% open, Driveway Cam offline, +1 more.",
    );
  });
});
