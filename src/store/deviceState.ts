import type { AirQualitySample, Device } from "./useHomeStore";

const AIR_SAMPLE_FIELDS: Array<keyof Device> = [
  "airQualityIndex",
  "humidity",
  "airPm25",
  "airPm10",
  "airCo2",
  "airVoc",
  "airFormaldehyde",
  "airPollen",
  "tempC",
];
const AIR_HISTORY_MAX = 144;

export function applyDeviceStatePatch(
  devices: Device[],
  deviceId: string,
  patch: Partial<Device>,
  now = Date.now(),
): Device[] {
  return devices.map((device) => {
    if (device.id !== deviceId) return device;
    const next = { ...device, ...patch };
    if (device.kind === "camera") {
      const isOnline =
        patch.isOn === true || (patch.isOn === undefined && device.isOn);
      return {
        ...next,
        lastSeenAt: isOnline ? patch.lastSeenAt ?? now : device.lastSeenAt,
        lastThumbnailUrl: patch.thumbnailUrl ?? device.lastThumbnailUrl,
      };
    }
    if (device.kind !== "air") return next;

    const hasSampleUpdate = AIR_SAMPLE_FIELDS.some(
      (field) => patch[field] !== undefined,
    );
    const incomingHistory = patch.airHistory;
    if (!hasSampleUpdate && !incomingHistory) return next;

    const ts = patch.airLastUpdatedAt ?? now;
    if (Array.isArray(incomingHistory)) {
      return {
        ...next,
        airLastUpdatedAt: ts,
        airHistory: incomingHistory
          .filter((item) => item && typeof item.ts === "number")
          .slice(-AIR_HISTORY_MAX),
      };
    }

    const sample: AirQualitySample = {
      ts,
      aqi: patch.airQualityIndex ?? device.airQualityIndex,
      humidity: patch.humidity ?? device.humidity,
      pm25: patch.airPm25 ?? device.airPm25,
      pm10: patch.airPm10 ?? device.airPm10,
      co2: patch.airCo2 ?? device.airCo2,
      voc: patch.airVoc ?? device.airVoc,
      formaldehyde: patch.airFormaldehyde ?? device.airFormaldehyde,
      pollen: patch.airPollen ?? device.airPollen,
      tempC: patch.tempC ?? device.tempC,
    };
    const cutoff = ts - 24 * 60 * 60 * 1000;
    const history = Array.isArray(device.airHistory) ? device.airHistory : [];
    return {
      ...next,
      airLastUpdatedAt: ts,
      airHistory: [...history, sample]
        .filter((item) => item && typeof item.ts === "number")
        .filter((item) => item.ts >= cutoff)
        .slice(-AIR_HISTORY_MAX),
    };
  });
}
