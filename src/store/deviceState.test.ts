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
