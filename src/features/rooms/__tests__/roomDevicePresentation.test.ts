import { getDevice } from "../../../../packages/home-scene/src/data";
import { createDefaultSimulationSnapshot } from "../../../../packages/home-scene/src/simulationBridgeProtocol";
import {
  nativeRoomQuickAction,
  roomDevicePresentation,
} from "../roomDevicePresentation";
import type { Device } from "../../../store/useHomeStore";

/** Use a native catalog record without assuming a canonical-looking ID is a model binding. */
function device(kind: Device["kind"], patch: Partial<Device> = {}): Device {
  return {
    id: "fixture",
    name: "Test device",
    roomId: "room",
    kind,
    isOn: false,
    ...patch,
  };
}

const state = createDefaultSimulationSnapshot();

test("uses the shared model reading and light quick action only with explicit model state", () => {
  const definition = getDevice("living-light")!;
  const native = device("light", {
    id: definition.id,
    brightness: 25,
    isOn: true,
  });
  expect(roomDevicePresentation(native).value).toBe("25%");
  expect(
    roomDevicePresentation(native, {
      ...state.deviceStates[definition.id],
      on: true,
      level: 82,
    }),
  ).toMatchObject({
    value: "82%",
    caption: "Brightness · On",
    quickActionLabel: "Turn off",
    active: true,
  });
});

test.each([
  ["utility-gas-meter", "Refresh sample"],
  ["kitchen-gas-leak", "Run self-test"],
  ["master-smoke", "Run self-test"],
  ["utility-energy", "Refresh sample"],
  ["entry-camera", "Disarm"],
])("keeps shared model quick-action semantics for %s", (id, label) => {
  const definition = getDevice(id)!;
  const presentation = roomDevicePresentation(
    device(definition.kind, { id }),
    state.deviceStates[id],
  );
  expect(presentation.quickActionLabel).toBe(label);
});

test.each([
  "gas-meter",
  "gas-leak",
  "energy",
  "water",
  "air",
  "smoke",
] as const)(
  "opens native %s readings without inventing a power command",
  (kind) => {
    expect(nativeRoomQuickAction(device(kind))).toEqual({
      type: "controls",
      label: "View readings",
    });
  },
);

test("retains camera arm and cover position commands", () => {
  expect(
    nativeRoomQuickAction(device("camera", { armed: true })),
  ).toMatchObject({ label: "Disarm", command: { changes: { armed: false } } });
  expect(
    nativeRoomQuickAction(device("gate", { openPercent: 40, isOn: true })),
  ).toMatchObject({
    label: "Close",
    command: { changes: { openPercent: 0, isOn: false } },
  });
  expect(
    nativeRoomQuickAction(device("door", { openPercent: 0 })),
  ).toMatchObject({
    label: "Open",
    command: { changes: { openPercent: 100, isOn: true } },
  });
});

test("does not invent an observation when a native sensor has no reading", () => {
  expect(roomDevicePresentation(device("energy"))).toMatchObject({
    value: "—",
    caption: "Power reading",
  });
});
