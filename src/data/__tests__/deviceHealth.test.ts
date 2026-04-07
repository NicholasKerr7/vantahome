import { buildDeviceHealthSnapshot } from "../deviceHealth";
import type { Device } from "../../store/useHomeStore";

describe("deviceHealth", () => {
  it("groups low battery, offline cameras, stale sensors, connectivity, and maintenance", () => {
    const now = new Date("2026-04-06T18:00:00Z").getTime();
    const devices: Device[] = [
      {
        id: "door-1",
        name: "Front Door",
        kind: "door",
        roomId: "r1",
        isOn: false,
        battery: 14,
      },
      {
        id: "cam-1",
        name: "Entry Camera",
        kind: "camera",
        roomId: "r1",
        isOn: false,
      },
      {
        id: "cam-2",
        name: "Patio Camera",
        kind: "camera",
        roomId: "r6",
        isOn: true,
        lastSeenAt: now - 20 * 60 * 1000,
      },
      {
        id: "air-1",
        name: "Air Quality",
        kind: "air",
        roomId: "r2",
        isOn: true,
        airLastUpdatedAt: now - 8 * 60 * 60 * 1000,
        airFilterLife: 9,
      },
      {
        id: "coffee-1",
        name: "Kitchen Coffee",
        kind: "coffee",
        roomId: "r3",
        isOn: true,
        coffeeDescaleNeeded: true,
      },
    ];

    const snapshot = buildDeviceHealthSnapshot({
      devices,
      now,
      realtimeEnabled: true,
      useMqtt: false,
      connectionStatus: "error",
      connectionUrl: "ws://localhost:8088",
    });

    expect(snapshot.counts.total).toBe(7);
    expect(snapshot.counts.critical).toBeGreaterThanOrEqual(4);
    expect(snapshot.byCategory.battery).toHaveLength(1);
    expect(snapshot.byCategory["offline-camera"]).toHaveLength(2);
    expect(snapshot.byCategory["stale-sensor"]).toHaveLength(1);
    expect(snapshot.byCategory.connectivity).toHaveLength(1);
    expect(snapshot.byCategory.maintenance).toHaveLength(2);
    expect(snapshot.byCategory.connectivity[0]?.title).toBe("Realtime connection");
  });

  it("stays clean when everything is healthy", () => {
    const now = Date.now();
    const devices: Device[] = [
      {
        id: "cam-ok",
        name: "Entry Camera",
        kind: "camera",
        roomId: "r1",
        isOn: true,
        armed: true,
        lastSeenAt: now,
      },
      {
        id: "air-ok",
        name: "Air Quality",
        kind: "air",
        roomId: "r2",
        isOn: true,
        airLastUpdatedAt: now,
        airFilterLife: 88,
      },
    ];

    const snapshot = buildDeviceHealthSnapshot({
      devices,
      now,
      realtimeEnabled: false,
      useMqtt: false,
      connectionStatus: "disconnected",
    });

    expect(snapshot.issues).toEqual([]);
    expect(snapshot.counts.total).toBe(0);
  });
});
