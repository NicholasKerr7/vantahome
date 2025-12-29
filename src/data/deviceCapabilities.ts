import type { Device, DeviceKind } from "../store/useHomeStore";
import { AC_TEMP_MAX_C, AC_TEMP_MIN_C } from "../store/useHomeStore";

export type CapabilityContext = "quick" | "detail";

export type CapabilityType = "toggle" | "range" | "enum" | "action" | "stat";

type BaseCapability = {
  id: string;
  label: string;
  type: CapabilityType;
  contexts?: CapabilityContext[];
  order?: number;
};

export type ToggleCapability = BaseCapability & {
  type: "toggle";
  field: keyof Device;
  onLabel?: string;
  offLabel?: string;
};

export type RangeCapability = BaseCapability & {
  type: "range";
  field: keyof Device;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  autoOn?: boolean;
  autoOffWhenZero?: boolean;
  control?: "slider" | "dial";
  dialTicks?: number[];
};

export type EnumCapability = BaseCapability & {
  type: "enum";
  field: keyof Device;
  options: Array<{ label: string; value: string | number }>;
};

export type ActionCapability = BaseCapability & {
  type: "action";
  patch: Partial<Device>;
};

export type StatCapability = BaseCapability & {
  type: "stat";
  field: keyof Device;
  unit?: string;
  format?: (value: number | boolean | string) => string;
};

export type DeviceCapability =
  | ToggleCapability
  | RangeCapability
  | EnumCapability
  | ActionCapability
  | StatCapability;

const DEFAULT_CONTEXTS: CapabilityContext[] = ["quick", "detail"];

const CAPABILITIES: Record<DeviceKind, DeviceCapability[]> = {
  ac: [
    {
      id: "ac-temp",
      label: "Temp",
      type: "range",
      field: "tempC",
      min: AC_TEMP_MIN_C,
      max: AC_TEMP_MAX_C,
      unit: "C",
      autoOn: true,
      control: "dial",
      dialTicks: [
        AC_TEMP_MIN_C,
        AC_TEMP_MIN_C + 2,
        AC_TEMP_MIN_C + 4,
        AC_TEMP_MAX_C - 2,
        AC_TEMP_MAX_C,
      ],
      order: 1,
    },
    {
      id: "ac-mode",
      label: "Mode",
      type: "enum",
      field: "mode",
      options: [
        { label: "Cold", value: "cold" },
        { label: "Fan", value: "fan" },
        { label: "Dry", value: "dry" },
      ],
      order: 2,
    },
  ],
  light: [
    {
      id: "light-brightness",
      label: "Brightness",
      type: "range",
      field: "brightness",
      min: 0,
      max: 100,
      unit: "%",
      autoOn: true,
      autoOffWhenZero: true,
      control: "dial",
      dialTicks: [0, 25, 50, 75, 100],
      order: 1,
    },
  ],
  tv: [
    {
      id: "tv-volume",
      label: "Volume",
      type: "range",
      field: "volume",
      min: 0,
      max: 100,
      unit: "%",
      autoOn: true,
      control: "dial",
      dialTicks: [0, 25, 50, 75, 100],
      order: 1,
    },
    {
      id: "tv-mute",
      label: "Mute",
      type: "toggle",
      field: "muted",
      onLabel: "Muted",
      offLabel: "Sound",
      order: 2,
    },
  ],
  coffee: [
    {
      id: "coffee-brew",
      label: "Brew now",
      type: "action",
      patch: { isOn: true },
      order: 1,
    },
    {
      id: "coffee-stop",
      label: "Stop",
      type: "action",
      patch: { isOn: false },
      order: 2,
    },
  ],
  fridge: [
    {
      id: "fridge-temp",
      label: "Temp",
      type: "range",
      field: "tempC",
      min: 1,
      max: 8,
      unit: "C",
      control: "dial",
      dialTicks: [1, 3, 5, 7, 8],
      order: 1,
    },
  ],
  garage: [
    {
      id: "garage-open",
      label: "Open",
      type: "range",
      field: "openPercent",
      min: 0,
      max: 100,
      unit: "%",
      order: 1,
    },
  ],
  fan: [
    {
      id: "fan-speed",
      label: "Speed",
      type: "range",
      field: "speed",
      min: 0,
      max: 100,
      unit: "%",
      autoOn: true,
      autoOffWhenZero: true,
      control: "dial",
      dialTicks: [0, 25, 50, 75, 100],
      order: 1,
    },
  ],
  door: [
    {
      id: "door-open",
      label: "Open",
      type: "range",
      field: "openPercent",
      min: 0,
      max: 100,
      unit: "%",
      order: 1,
    },
  ],
  gate: [
    {
      id: "gate-open",
      label: "Open",
      type: "range",
      field: "openPercent",
      min: 0,
      max: 100,
      unit: "%",
      order: 1,
    },
  ],
  vacuum: [
    {
      id: "vacuum-start",
      label: "Start",
      type: "action",
      patch: { isOn: true, status: "cleaning" },
      order: 1,
    },
    {
      id: "vacuum-dock",
      label: "Dock",
      type: "action",
      patch: { isOn: false, status: "docked" },
      order: 2,
    },
  ],
  camera: [
    {
      id: "camera-armed",
      label: "Armed",
      type: "toggle",
      field: "armed",
      onLabel: "On",
      offLabel: "Off",
      order: 1,
    },
    {
      id: "camera-recording",
      label: "Recording",
      type: "toggle",
      field: "recording",
      onLabel: "On",
      offLabel: "Off",
      order: 2,
    },
    {
      id: "camera-night",
      label: "Night",
      type: "toggle",
      field: "nightVision",
      onLabel: "On",
      offLabel: "Off",
      order: 3,
    },
    {
      id: "camera-alerts",
      label: "Alerts",
      type: "toggle",
      field: "motionAlerts",
      onLabel: "On",
      offLabel: "Off",
      order: 4,
    },
    {
      id: "camera-mic",
      label: "Mic",
      type: "toggle",
      field: "micMuted",
      onLabel: "Muted",
      offLabel: "Live",
      order: 5,
    },
    {
      id: "camera-talk",
      label: "Talk",
      type: "toggle",
      field: "twoWayAudio",
      onLabel: "On",
      offLabel: "Off",
      order: 6,
    },
    {
      id: "camera-sensitivity",
      label: "Sensitivity",
      type: "range",
      field: "motionSensitivity",
      min: 1,
      max: 10,
      unit: "",
      order: 7,
    },
  ],
  window: [
    {
      id: "window-open",
      label: "Open",
      type: "range",
      field: "openPercent",
      min: 0,
      max: 100,
      unit: "%",
      control: "dial",
      dialTicks: [0, 25, 50, 75, 100],
      order: 1,
    },
  ],
  stove: [
    {
      id: "stove-burner",
      label: "Burner",
      type: "range",
      field: "burnerLevel",
      min: 0,
      max: 10,
      unit: "",
      autoOn: true,
      autoOffWhenZero: true,
      control: "dial",
      dialTicks: [0, 2, 4, 6, 8, 10],
      order: 1,
    },
  ],
  washer: [
    {
      id: "washer-cycle",
      label: "Cycle",
      type: "enum",
      field: "cycle",
      options: [
        { label: "Normal", value: "Normal" },
        { label: "Quick", value: "Quick" },
        { label: "Delicate", value: "Delicate" },
      ],
      order: 1,
    },
    {
      id: "washer-progress",
      label: "Progress",
      type: "range",
      field: "progress",
      min: 0,
      max: 100,
      unit: "%",
      autoOn: true,
      autoOffWhenZero: true,
      control: "dial",
      dialTicks: [0, 25, 50, 75, 100],
      order: 2,
    },
    {
      id: "washer-start",
      label: "Start",
      type: "action",
      patch: { isOn: true },
      order: 3,
    },
    {
      id: "washer-pause",
      label: "Pause",
      type: "action",
      patch: { isOn: false },
      order: 4,
    },
  ],
  dryer: [
    {
      id: "dryer-cycle",
      label: "Cycle",
      type: "enum",
      field: "cycle",
      options: [
        { label: "Normal", value: "Normal" },
        { label: "Quick", value: "Quick" },
        { label: "Low Heat", value: "Low Heat" },
      ],
      order: 1,
    },
    {
      id: "dryer-progress",
      label: "Progress",
      type: "range",
      field: "progress",
      min: 0,
      max: 100,
      unit: "%",
      autoOn: true,
      autoOffWhenZero: true,
      control: "dial",
      dialTicks: [0, 25, 50, 75, 100],
      order: 2,
    },
    {
      id: "dryer-start",
      label: "Start",
      type: "action",
      patch: { isOn: true },
      order: 3,
    },
    {
      id: "dryer-pause",
      label: "Pause",
      type: "action",
      patch: { isOn: false },
      order: 4,
    },
  ],
  microwave: [
    {
      id: "microwave-time",
      label: "Time",
      type: "range",
      field: "timeRemainingSec",
      min: 0,
      max: 900,
      step: 30,
      unit: "sec",
      autoOn: true,
      autoOffWhenZero: true,
      control: "dial",
      dialTicks: [0, 300, 600, 900],
      order: 1,
    },
    {
      id: "microwave-start",
      label: "Start 1 min",
      type: "action",
      patch: { isOn: true, timeRemainingSec: 60 },
      order: 2,
    },
    {
      id: "microwave-stop",
      label: "Stop",
      type: "action",
      patch: { isOn: false, timeRemainingSec: 0 },
      order: 3,
    },
  ],
  energy: [
    {
      id: "energy-now",
      label: "Power",
      type: "stat",
      field: "powerW",
      unit: "W",
      order: 1,
    },
    {
      id: "energy-today",
      label: "Today",
      type: "stat",
      field: "energyTodayKwh",
      unit: "kWh",
      order: 2,
    },
    {
      id: "energy-peak",
      label: "Peak",
      type: "stat",
      field: "energyPeakW",
      unit: "W",
      order: 3,
    },
    {
      id: "energy-month",
      label: "Month",
      type: "stat",
      field: "energyMonthKwh",
      unit: "kWh",
      order: 4,
    },
    {
      id: "energy-cost",
      label: "Cost",
      type: "stat",
      field: "energyCostToday",
      format: (value) =>
        typeof value === "number" ? `$${value.toFixed(2)}` : "--",
      order: 5,
    },
    {
      id: "energy-budget",
      label: "Budget",
      type: "range",
      field: "energyBudgetKwh",
      min: 50,
      max: 200,
      step: 10,
      unit: "kWh",
      order: 6,
    },
  ],
  water: [
    {
      id: "water-flow",
      label: "Flow",
      type: "stat",
      field: "waterLpm",
      unit: "L/m",
      order: 1,
    },
    {
      id: "water-today",
      label: "Today",
      type: "stat",
      field: "waterTodayL",
      unit: "L",
      order: 2,
    },
    {
      id: "water-pressure",
      label: "Pressure",
      type: "stat",
      field: "waterPressurePsi",
      unit: "psi",
      order: 3,
    },
    {
      id: "water-temp",
      label: "Temp",
      type: "stat",
      field: "waterTempC",
      unit: "C",
      order: 4,
    },
    {
      id: "water-leak",
      label: "Leak",
      type: "stat",
      field: "waterLeakDetected",
      format: (value) => (value ? "Detected" : "Clear"),
      order: 5,
    },
    {
      id: "water-alerts",
      label: "Alerts",
      type: "toggle",
      field: "waterLeakAlerts",
      onLabel: "On",
      offLabel: "Off",
      order: 6,
    },
    {
      id: "water-shutoff",
      label: "Shutoff",
      type: "toggle",
      field: "waterAutoShutoff",
      onLabel: "On",
      offLabel: "Off",
      order: 7,
    },
    {
      id: "water-budget",
      label: "Budget",
      type: "range",
      field: "waterBudgetL",
      min: 100,
      max: 400,
      step: 20,
      unit: "L",
      order: 8,
    },
  ],
  air: [
    {
      id: "air-aqi",
      label: "AQI",
      type: "stat",
      field: "airQualityIndex",
      order: 1,
    },
    {
      id: "air-humidity",
      label: "Humidity",
      type: "stat",
      field: "humidity",
      unit: "%",
      order: 2,
    },
  ],
  sprinkler: [
    {
      id: "sprinkler-duration",
      label: "Duration",
      type: "range",
      field: "durationMin",
      min: 0,
      max: 60,
      unit: "min",
      control: "dial",
      dialTicks: [0, 15, 30, 45, 60],
      order: 1,
    },
    {
      id: "sprinkler-zone",
      label: "Zone",
      type: "enum",
      field: "zone",
      options: [
        { label: "Front Yard", value: "Front Yard" },
        { label: "Back Yard", value: "Back Yard" },
        { label: "Garden", value: "Garden" },
      ],
      order: 2,
    },
    {
      id: "sprinkler-state",
      label: "Active",
      type: "toggle",
      field: "isOn",
      onLabel: "On",
      offLabel: "Off",
      order: 3,
    },
  ],
  speaker: [
    {
      id: "speaker-volume",
      label: "Volume",
      type: "range",
      field: "volume",
      min: 0,
      max: 100,
      unit: "%",
      autoOn: true,
      control: "dial",
      dialTicks: [0, 25, 50, 75, 100],
      order: 1,
    },
    {
      id: "speaker-mute",
      label: "Mute",
      type: "toggle",
      field: "muted",
      onLabel: "Muted",
      offLabel: "Sound",
      order: 2,
    },
  ],
  smoke: [
    {
      id: "smoke-status",
      label: "Status",
      type: "stat",
      field: "smokeDetected",
      format: (value) => (value ? "Smoke detected" : "Clear"),
      order: 1,
    },
  ],
};

export function getDeviceCapabilities(
  device: Device,
  context: CapabilityContext,
) {
  const list = CAPABILITIES[device.kind] ?? [];
  return list
    .filter((cap) => (cap.contexts ?? DEFAULT_CONTEXTS).includes(context))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
