import { applyDeviceStatePatch } from "./deviceState";
import type { Device } from "./useHomeStore";

describe("applyDeviceStatePatch", () => {
  test("preserves camera observation metadata", () => {
    const camera: Device = {
      id: "camera-1",
      name: "Entry",
      kind: "camera",
      roomId: "r1",
      isOn: true,
      thumbnailUrl: "old.jpg",
      lastSeenAt: 10,
    };

    const [next] = applyDeviceStatePatch(
      [camera],
      camera.id,
      { thumbnailUrl: "new.jpg" },
      100,
    );
    expect(next.lastSeenAt).toBe(100);
    expect(next.lastThumbnailUrl).toBe("new.jpg");
  });

  test("keeps the last camera observation when it goes offline", () => {
    const camera: Device = {
      id: "camera-1",
      name: "Entry",
      kind: "camera",
      roomId: "r1",
      isOn: true,
      thumbnailUrl: "cached.jpg",
      lastThumbnailUrl: "cached.jpg",
      lastSeenAt: 100,
    };

    const [next] = applyDeviceStatePatch(
      [camera],
      camera.id,
      { isOn: false },
      200,
    );
    expect(next.isOn).toBe(false);
    expect(next.lastSeenAt).toBe(100);
    expect(next.lastThumbnailUrl).toBe("cached.jpg");
  });

  test("keeps a bounded air-quality history", () => {
    const air: Device = {
      id: "air-1",
      name: "Air",
      kind: "air",
      roomId: "r1",
      isOn: true,
      airQualityIndex: 20,
      airHistory: [],
    };
    const [next] = applyDeviceStatePatch(
      [air],
      air.id,
      { airQualityIndex: 30 },
      1_000,
    );
    expect(next.airHistory).toEqual([
      expect.objectContaining({ ts: 1_000, aqi: 30 }),
    ]);
  });
});
