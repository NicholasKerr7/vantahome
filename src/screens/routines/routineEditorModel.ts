import type {
  Device,
  DeviceMode,
  FlowAction,
  FlowCondition,
  FlowTrigger,
  Weekday,
} from "../../store/useHomeStore";
import { AC_TEMP_MAX_C, AC_TEMP_MIN_C } from "../../store/useHomeStore";

export type RoutineSection = "trigger" | "condition" | "action";
export type RoutineStep = FlowTrigger | FlowCondition | FlowAction;
export type StepDraft = {
  type: string;
  deviceId: string;
  sceneId: string;
  memberId: string;
  on: boolean;
  hour: string;
  minute: string;
  endHour: string;
  endMinute: string;
  days: Weekday[];
  value: string;
  message: string;
  mode: DeviceMode;
};
export const WEEK_DAYS: Weekday[] = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];
export const STEP_CHOICES = {
  trigger: [
    { id: "time", label: "At a time" },
    { id: "device", label: "Device changes" },
    { id: "presence", label: "Someone arrives or leaves" },
    { id: "scene", label: "A scene runs" },
  ],
  condition: [
    { id: "day", label: "On these days" },
    { id: "time-range", label: "Within a time window" },
    { id: "device", label: "Device state" },
  ],
  action: [
    { id: "run-scene", label: "Run a scene" },
    { id: "toggle", label: "Control a device" },
    { id: "set-ac", label: "Set temperature" },
    { id: "set-brightness", label: "Set brightness" },
    { id: "delay", label: "Wait between actions" },
    { id: "notify", label: "Send a notification" },
  ],
} as const;

/** Avoid offering a power command for meters and read-only environmental sensors. */
export function supportsRoutinePower(device: Device) {
  return !["gas-meter", "gas-leak", "smoke", "energy", "water", "air"].includes(
    device.kind,
  );
}

/** Seed an isolated edit draft without mutating a saved routine, including less-common AC modes. */
export function createStepDraft(
  section: RoutineSection,
  item?: RoutineStep,
  deviceId = "",
): StepDraft {
  const draft: StepDraft = {
    type: item?.type ?? STEP_CHOICES[section][0].id,
    deviceId,
    sceneId: "",
    memberId: "",
    on: true,
    hour: "07",
    minute: "00",
    endHour: "23",
    endMinute: "00",
    days: [...WEEK_DAYS],
    value: "60",
    message: "",
    mode: "cold",
  };
  if (!item) return draft;
  if ("deviceId" in item) draft.deviceId = item.deviceId;
  if ("sceneId" in item) draft.sceneId = item.sceneId;
  if ("state" in item) draft.on = item.state === "on";
  switch (item.type) {
    case "time":
      draft.hour = String(item.hour).padStart(2, "0");
      draft.minute = String(item.minute).padStart(2, "0");
      break;
    case "time-range":
      draft.hour = String(item.startHour).padStart(2, "0");
      draft.minute = String(item.startMinute).padStart(2, "0");
      draft.endHour = String(item.endHour).padStart(2, "0");
      draft.endMinute = String(item.endMinute).padStart(2, "0");
      break;
    case "presence":
      draft.memberId = item.memberId;
      draft.on = item.status === "home";
      break;
    case "day":
      draft.days = [...item.days];
      break;
    case "toggle":
      draft.on = item.on;
      break;
    case "set-ac":
      draft.value = String(item.tempC);
      draft.mode = item.mode;
      break;
    case "set-brightness":
      draft.value = String(item.brightness);
      break;
    case "delay":
      draft.value = String(item.seconds);
      break;
    case "notify":
      draft.message = item.message;
      break;
  }
  return draft;
}

/** Require complete numeric input; a mistyped time must never silently become another schedule. */
function integer(value: string, min: number, max: number) {
  if (!/^\d+$/.test(value.trim())) return null;
  const result = Number(value);
  return Number.isInteger(result) && result >= min && result <= max
    ? result
    : null;
}

/** Convert validated editor fields to the existing runtime model without dropping action data. */
export function buildRoutineStep(
  section: RoutineSection,
  draft: StepDraft,
): { step?: RoutineStep; error?: string } {
  if (!STEP_CHOICES[section].some((choice) => choice.id === draft.type))
    return { error: "Choose a supported step." };
  const hour = integer(draft.hour, 0, 23);
  const minute = integer(draft.minute, 0, 59);
  if (draft.type === "time" || draft.type === "time-range") {
    if (hour === null || minute === null)
      return {
        error: "Enter an hour from 00 to 23 and a minute from 00 to 59.",
      };
    if (draft.type === "time") return { step: { type: "time", hour, minute } };
    const endHour = integer(draft.endHour, 0, 23);
    const endMinute = integer(draft.endMinute, 0, 59);
    if (endHour === null || endMinute === null)
      return { error: "Enter a valid end time." };
    return {
      step: {
        type: "time-range",
        startHour: hour,
        startMinute: minute,
        endHour,
        endMinute,
      },
    };
  }
  if (
    ["device", "toggle", "set-ac", "set-brightness"].includes(draft.type) &&
    !draft.deviceId
  )
    return { error: "Choose an available device." };
  switch (draft.type) {
    case "device":
      return {
        step: {
          type: "device",
          deviceId: draft.deviceId,
          state: draft.on ? "on" : "off",
        },
      };
    case "toggle":
      return {
        step: { type: "toggle", deviceId: draft.deviceId, on: draft.on },
      };
    case "scene":
    case "run-scene":
      return draft.sceneId
        ? { step: { type: draft.type, sceneId: draft.sceneId } }
        : { error: "Choose a scene." };
    case "presence":
      return draft.memberId
        ? {
            step: {
              type: "presence",
              memberId: draft.memberId,
              status: draft.on ? "home" : "away",
            },
          }
        : { error: "Choose a household member." };
    case "day":
      return draft.days.length
        ? { step: { type: "day", days: [...draft.days] } }
        : { error: "Choose at least one day." };
    case "set-ac": {
      const tempC = integer(draft.value, AC_TEMP_MIN_C, AC_TEMP_MAX_C);
      return tempC === null
        ? { error: `Temperature must be ${AC_TEMP_MIN_C}–${AC_TEMP_MAX_C}°C.` }
        : {
            step: {
              type: "set-ac",
              deviceId: draft.deviceId,
              tempC,
              mode: draft.mode,
            },
          };
    }
    case "set-brightness": {
      const brightness = integer(draft.value, 0, 100);
      return brightness === null
        ? { error: "Brightness must be 0–100%." }
        : {
            step: {
              type: "set-brightness",
              deviceId: draft.deviceId,
              brightness,
            },
          };
    }
    case "delay": {
      const seconds = integer(draft.value, 1, 600);
      return seconds === null
        ? { error: "Wait time must be 1–600 seconds." }
        : { step: { type: "delay", seconds } };
    }
    case "notify":
      return draft.message.trim()
        ? { step: { type: "notify", message: draft.message.trim() } }
        : { error: "Enter a notification message." };
    default:
      return { error: "Choose a step." };
  }
}
