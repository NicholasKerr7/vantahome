import type { Device } from "../store/useHomeStore";

export type DeviceStatePatch = Partial<
  Omit<Device, "id" | "name" | "kind" | "roomId">
>;

export type ParsedDeviceStateEvent = {
  deviceId: string;
  patch: DeviceStatePatch;
  ts: number;
};

type ParsedTransportMessage =
  | { type: "state"; event: ParsedDeviceStateEvent }
  | { type: "state-batch"; events: ParsedDeviceStateEvent[] }
  | { type: "snapshot"; devices: Device[]; ts: number }
  | {
      type: "presence";
      roomId?: string;
      deviceId?: string;
      kind: "known" | "unknown";
      source: "camera" | "motion" | "sensor";
    };

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const IMMUTABLE_DEVICE_KEYS = new Set(["id", "name", "kind", "roomId"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isSafeJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.length <= 256 && value.every((item) => isSafeJsonValue(item, depth + 1));
  }
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 256 &&
    entries.every(
      ([key, item]) =>
        !BLOCKED_KEYS.has(key) && isSafeJsonValue(item, depth + 1),
    )
  );
}

function parseTimestamp(value: unknown, fallback = Date.now()) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

export function parseDeviceStatePatch(value: unknown): DeviceStatePatch | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > 256) return null;
  if (
    entries.some(
      ([key, item]) =>
        BLOCKED_KEYS.has(key) ||
        IMMUTABLE_DEVICE_KEYS.has(key) ||
        !isSafeJsonValue(item),
    )
  ) {
    return null;
  }
  return { ...value } as DeviceStatePatch;
}

export function parseDeviceStateEvent(
  value: unknown,
  fallbackTs = Date.now(),
): ParsedDeviceStateEvent | null {
  if (!isRecord(value) || typeof value.deviceId !== "string") return null;
  const deviceId = value.deviceId.trim();
  if (!deviceId || deviceId.length > 128) return null;
  const patch = parseDeviceStatePatch(value.patch);
  if (!patch) return null;
  return { deviceId, patch, ts: parseTimestamp(value.ts, fallbackTs) };
}

export function parseTransportMessage(value: unknown): ParsedTransportMessage | null {
  if (!isRecord(value)) return null;
  if (value.type === "state" || (!value.type && value.deviceId)) {
    const event = parseDeviceStateEvent(value);
    return event ? { type: "state", event } : null;
  }
  if (value.type === "state-batch") {
    if (!Array.isArray(value.events) || value.events.length > 1000) return null;
    const events = value.events.map((event) => parseDeviceStateEvent(event));
    if (events.some((event) => event === null)) return null;
    return { type: "state-batch", events: events as ParsedDeviceStateEvent[] };
  }
  if (value.type === "snapshot") {
    if (!Array.isArray(value.devices) || value.devices.length > 5000) return null;
    const devices = value.devices.filter(
      (device): device is Device =>
        isRecord(device) &&
        typeof device.id === "string" &&
        typeof device.name === "string" &&
        typeof device.kind === "string" &&
        typeof device.roomId === "string" &&
        typeof device.isOn === "boolean" &&
        isSafeJsonValue(device),
    );
    if (devices.length !== value.devices.length) return null;
    return { type: "snapshot", devices, ts: parseTimestamp(value.ts) };
  }
  if (value.type === "presence") {
    const kind = value.kind ?? "unknown";
    const source = value.source ?? "motion";
    if (kind !== "known" && kind !== "unknown") return null;
    if (source !== "camera" && source !== "motion" && source !== "sensor") {
      return null;
    }
    if (value.roomId != null && typeof value.roomId !== "string") return null;
    if (value.deviceId != null && typeof value.deviceId !== "string") return null;
    return {
      type: "presence",
      roomId: value.roomId as string | undefined,
      deviceId: value.deviceId as string | undefined,
      kind,
      source,
    };
  }
  return null;
}
