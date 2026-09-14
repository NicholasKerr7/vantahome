import fs from "fs";
import path from "path";
import { getDeviceCapabilities } from "../../src/data/deviceCapabilities";
import type { Device, DeviceKind } from "../../src/store/useHomeStore";

type Descriptor = [string, ...Array<string | number | boolean>];
const migration = fs.readFileSync(
  path.resolve(__dirname, "../migrations/012_security_review_remediation.sql"),
  "utf8",
);
const schema = JSON.parse(migration.split("$schema$")[1]) as Record<
  DeviceKind,
  Record<string, Descriptor>
>;
const kinds: DeviceKind[] = [
  "ac", "light", "tv", "coffee", "fridge", "gate", "garage", "fan", "door",
  "vacuum", "camera", "window", "stove", "washer", "dryer", "dishwasher",
  "microwave", "energy", "water", "water-heater", "air", "sprinkler", "speaker", "smoke",
];

describe("authoritative command schema compatibility", () => {
  test("defines every supported device kind without registry identity fields", () => {
    expect(Object.keys(schema).sort()).toEqual([...kinds].sort());
    for (const properties of Object.values(schema)) {
      for (const field of ["id", "name", "kind", "roomId", "streamUrl", "reportedCapabilityIds"]) {
        expect(properties).not.toHaveProperty(field);
      }
    }
  });

  test.each(kinds)("preserves the declared %s controls and their bounds", (kind) => {
    const device: Device = { id: "fixture", name: "Fixture", roomId: "fixture", kind, isOn: false };
    const properties: Record<string, Descriptor> = { isOn: ["boolean"], ...schema[kind] };
    for (const capability of getDeviceCapabilities(device, "detail")) {
      if (capability.type === "stat") continue;
      if (capability.type === "action") {
        for (const [field, value] of Object.entries(capability.patch)) {
          expect(properties[field]).toBeDefined();
          if (typeof value === "boolean") expect(properties[field][0]).toBe("boolean");
          if (typeof value === "string") expect(properties[field].slice(1)).toContain(value);
        }
        continue;
      }
      const descriptor = properties[capability.field];
      expect(descriptor).toBeDefined();
      if (capability.type === "toggle") expect(descriptor[0]).toBe("boolean");
      if (capability.type === "range") {
        expect(["number", "integer"]).toContain(descriptor[0]);
        expect(descriptor[1]).toBeLessThanOrEqual(capability.min);
        expect(descriptor[2]).toBeGreaterThanOrEqual(capability.max);
      }
      if (capability.type === "enum") {
        if (descriptor[0] === "string") continue; // Bounded, provider-defined zone names.
        expect(descriptor[0]).toBe("enum");
        for (const option of capability.options) expect(descriptor.slice(1)).toContain(option.value);
      }
    }
  });
});
