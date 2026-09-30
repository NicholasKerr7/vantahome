import { describe, expect, it } from "vitest";
import { DEVICES, type DeviceDefinition } from "./data";
import { deviceCardReading } from "./dashboardCardPresentation";

/** Resolve a real catalog fixture so tests exercise the same capability defaults as the UI. */
function device(kind: DeviceDefinition["kind"]): DeviceDefinition {
  return DEVICES.find((candidate) => candidate.kind === kind)!;
}

describe("useful model card readings", () => {
  it("shows a fan setting even when stopped without reporting measured rotation", () => {
    expect(deviceCardReading(device("fan"), { on: false, level: 72 })).toEqual({
      value: "72%",
      caption: "Fan speed · Off",
    });
  });

  it.each(["fridge", "water-heater"] as const)(
    "labels the %s setting as a target temperature",
    (kind) => {
      expect(
        deviceCardReading(device(kind), {
          on: true,
          level: 0,
          settings: { tempC: 6 },
        }),
      ).toEqual({ value: "6°C", caption: "Target temperature · On" });
    },
  );

  it.each(["speaker", "tv"] as const)(
    "shows the actual %s volume setting",
    (kind) => {
      expect(
        deviceCardReading(device(kind), {
          on: true,
          level: 0,
          settings: { volume: 43 },
        }),
      ).toEqual({ value: "43%", caption: "Volume · On" });
    },
  );

  it.each([
    ["air", "airQualityIndex", 42, "42 AQI", "Air quality"],
    ["water", "waterLpm", 3.6, "3.6 L/min", "Water flow"],
    ["energy", "powerW", 850, "850 W", "Power"],
    ["solar", "solarW", 4100, "4100 W", "Solar output"],
  ] as const)(
    "labels %s values as simulated samples",
    (kind, field, value, expected, caption) => {
      expect(
        deviceCardReading(device(kind), {
          on: true,
          level: 0,
          settings: { [field]: value },
        }),
      ).toEqual({ value: expected, caption: `${caption} · Simulation sample` });
    },
  );

  it("keeps smoke and CO indications distinct", () => {
    expect(
      deviceCardReading(device("smoke"), {
        on: true,
        level: 0,
        settings: { smokeDetected: true },
      }).value,
    ).toBe("Smoke");
    expect(
      deviceCardReading(device("smoke"), {
        on: true,
        level: 0,
        settings: { smokeDetected: false, coDetected: true },
      }).value,
    ).toBe("CO alert");
  });

  it("does not render malformed numeric data as measured telemetry", () => {
    expect(
      deviceCardReading(device("water"), {
        on: true,
        level: 0,
        settings: { waterLpm: Number.NaN },
      }).value,
    ).toBe("—");
    expect(
      deviceCardReading(device("speaker"), {
        on: true,
        level: 0,
        settings: { volume: "unknown" },
      }).value,
    ).toBe("—");
    expect(
      deviceCardReading(device("air"), { on: true, level: 0 }).caption,
    ).toContain("Simulation sample");
  });
});
