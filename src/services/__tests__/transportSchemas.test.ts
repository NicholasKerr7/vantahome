import {
  parseDeviceStateEvent,
  parseDeviceStatePatch,
  parseTransportMessage,
} from "../transportSchemas";

describe("transport schemas", () => {
  test("accepts a valid observed state event", () => {
    expect(
      parseDeviceStateEvent({
        deviceId: "light.kitchen",
        patch: { isOn: true, brightness: 64 },
        ts: 123,
      }),
    ).toEqual({
      deviceId: "light.kitchen",
      patch: { isOn: true, brightness: 64 },
      ts: 123,
    });
  });

  test.each(["id", "name", "kind", "roomId"])(
    "rejects state events that attempt to mutate immutable %s",
    (key) => {
      expect(parseDeviceStatePatch({ isOn: true, [key]: "spoofed" })).toBeNull();
    },
  );

  test("rejects malformed and non-finite values", () => {
    expect(parseDeviceStateEvent({ deviceId: "", patch: { isOn: true } })).toBeNull();
    expect(parseDeviceStatePatch({ powerW: Number.POSITIVE_INFINITY })).toBeNull();
    expect(parseDeviceStatePatch([])).toBeNull();
  });

  test("rejects an entire batch when one event is invalid", () => {
    expect(
      parseTransportMessage({
        type: "state-batch",
        events: [
          { deviceId: "d1", patch: { isOn: true } },
          { deviceId: "d2", patch: { roomId: "unauthorized" } },
        ],
      }),
    ).toBeNull();
  });

  test("normalizes presence defaults", () => {
    expect(
      parseTransportMessage({ type: "presence", roomId: "r1" }),
    ).toEqual({
      type: "presence",
      roomId: "r1",
      deviceId: undefined,
      kind: "unknown",
      source: "motion",
    });
  });
});
