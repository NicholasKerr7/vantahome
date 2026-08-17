import { getDeviceCapabilities } from "./deviceCapabilities";
import type { Device } from "../store/useHomeStore";

describe("driver capability intersection", () => {
  const light: Device = {
    id: "d1",
    name: "Light",
    kind: "light",
    roomId: "r1",
    isOn: true,
  };

  test("keeps the full Vanta profile for seeded demo devices", () => {
    expect(getDeviceCapabilities(light, "detail").map((cap) => cap.id)).toContain(
      "light-brightness",
    );
  });

  test("shows only controls reported by the physical driver", () => {
    expect(
      getDeviceCapabilities(
        { ...light, reportedCapabilityIds: [] },
        "detail",
      ),
    ).toEqual([]);
  });
});
