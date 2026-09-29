import { buildRoutineStep, createStepDraft } from "./routineEditorModel";
import type {
  FlowAction,
  FlowCondition,
  FlowTrigger,
} from "../../store/useHomeStore";

const triggers: FlowTrigger[] = [
  { type: "time", hour: 23, minute: 59 },
  { type: "device", deviceId: "light", state: "off" },
  { type: "presence", memberId: "owner", status: "away" },
  { type: "scene", sceneId: "night" },
];
const conditions: FlowCondition[] = [
  { type: "day", days: ["Tue", "Fri"] },
  {
    type: "time-range",
    startHour: 22,
    startMinute: 30,
    endHour: 6,
    endMinute: 15,
  },
  { type: "device", deviceId: "light", state: "on" },
];
const actions: FlowAction[] = [
  { type: "toggle", deviceId: "light", on: false },
  { type: "set-ac", deviceId: "ac", tempC: 23, mode: "dry" },
  { type: "set-brightness", deviceId: "light", brightness: 13 },
  { type: "run-scene", sceneId: "night" },
  { type: "delay", seconds: 300 },
  { type: "notify", message: "Close the windows" },
];

describe("routine step editor data", () => {
  it.each(triggers)(
    "round-trips existing $type triggers without changing behavior",
    (step) => {
      expect(
        buildRoutineStep("trigger", createStepDraft("trigger", step)),
      ).toEqual({ step });
    },
  );
  it.each(conditions)(
    "round-trips existing $type conditions without changing behavior",
    (step) => {
      expect(
        buildRoutineStep("condition", createStepDraft("condition", step)),
      ).toEqual({ step });
    },
  );
  it.each(actions)(
    "round-trips existing $type actions without losing parameters",
    (step) => {
      expect(
        buildRoutineStep("action", createStepDraft("action", step)),
      ).toEqual({ step });
    },
  );
  it.each(["24", "-1", "7am", "", "1.5"])(
    "rejects invalid time input %s instead of silently clamping it",
    (hour) => {
      expect(
        buildRoutineStep("trigger", { ...createStepDraft("trigger"), hour })
          .error,
      ).toBeTruthy();
    },
  );
  it("requires explicit reference and day selections", () => {
    expect(buildRoutineStep("action", createStepDraft("action")).error).toBe(
      "Choose a scene.",
    );
    expect(
      buildRoutineStep("condition", {
        ...createStepDraft("condition"),
        days: [],
      }).error,
    ).toBe("Choose at least one day.");
  });
});
