import type { Device } from "../../store/useHomeStore";

/** A conservative display window until an integration supplies its own reporting cadence. */
export const AIR_READING_FRESHNESS_MS = 15 * 60 * 1000;
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY_POINTS = 48;

export type AirReadingStatus = "sample" | "unavailable" | "unknown" | "stale" | "recent";

/** Keep absent, non-finite, and out-of-range measurements unknown; zero is valid. */
export function reportedMeasurement(value: unknown, min = 0, max = Infinity): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value : null;
}

/** Reject invented/future observation times instead of describing them as just updated. */
function observationTime(value: unknown, now: number): number | null {
  const timestamp = reportedMeasurement(value, 1, now);
  return timestamp;
}

/** Build a display model only from reported readings, with no manufactured history or confidence. */
export function readAirTelemetry(device: Device, sample: boolean, now = Date.now()) {
  const values = {
    aqi: reportedMeasurement(device.airQualityIndex),
    humidity: reportedMeasurement(device.humidity, 0, 100),
    tempC: reportedMeasurement(device.tempC, -100, 100),
    pm25: reportedMeasurement(device.airPm25),
    pm10: reportedMeasurement(device.airPm10),
    co2: reportedMeasurement(device.airCo2),
    voc: reportedMeasurement(device.airVoc),
    formaldehyde: reportedMeasurement(device.airFormaldehyde),
    pollen: reportedMeasurement(device.airPollen),
    confidence: reportedMeasurement(device.airQualityConfidence, 0, 100),
    filterLife: reportedMeasurement(device.airFilterLife, 0, 100),
    filterDaysLeft: reportedMeasurement(device.airFilterDaysLeft, 0, 365),
    outdoorAqi: reportedMeasurement(device.airOutdoorAqi),
    outdoorPm25: reportedMeasurement(device.airOutdoorPm25),
    outdoorCo2: reportedMeasurement(device.airOutdoorCo2),
    outdoorHumidity: reportedMeasurement(device.airOutdoorHumidity, 0, 100),
    outdoorTempC: reportedMeasurement(device.airOutdoorTempC, -100, 100),
  };
  const hasReadings = [values.aqi, values.humidity, values.tempC, values.pm25,
    values.pm10, values.co2, values.voc, values.formaldehyde, values.pollen]
    .some((value) => value !== null);
  // A generic device update or a historical sample cannot date the current air readings.
  const lastUpdatedAt = observationTime(device.airLastUpdatedAt, now);
  const status: AirReadingStatus = sample ? "sample" : !hasReadings ? "unavailable"
    : lastUpdatedAt === null ? "unknown"
      : now - lastUpdatedAt >= AIR_READING_FRESHNESS_MS ? "stale" : "recent";
  const history = (Array.isArray(device.airHistory) ? device.airHistory : [])
    .flatMap((entry) => {
      const ts = observationTime(entry?.ts, now);
      const aqi = reportedMeasurement(entry?.aqi);
      return ts !== null && ts >= now - HISTORY_WINDOW_MS && aqi !== null ? [{ ts, aqi }] : [];
    })
    .sort((left, right) => left.ts - right.ts);
  // Deduplicate timestamps and retain both endpoints when thinning dense observations.
  const unique = Array.from(new Map(history.map((entry) => [entry.ts, entry])).values());
  const series = unique.length <= MAX_HISTORY_POINTS ? unique
    : Array.from({ length: MAX_HISTORY_POINTS }, (_, index) =>
      unique[Math.round(index * (unique.length - 1) / (MAX_HISTORY_POINTS - 1))]);
  const trendDelta = unique.length >= 2
    ? unique[unique.length - 1].aqi - unique[unique.length - 2].aqi : null;
  return { ...values, hasReadings, lastUpdatedAt, status, series, trendDelta };
}

export type AirTelemetry = ReturnType<typeof readAirTelemetry>;

/** Advice remains conditional on recent sensor observations or clearly identified samples. */
export function airReadingRecommendations(reading: AirTelemetry): string[] {
  if (reading.status === "unavailable") return ["Connect an air sensor to see readings and recommendations."];
  if (reading.status === "unknown") return ["The reading time is unavailable. Wait for a timestamped sensor update before assessing current air quality."];
  if (reading.status === "stale") return ["These are last known readings. Check the sensor connection before assessing current air quality."];
  const items: string[] = [];
  if (reading.aqi !== null && reading.aqi >= 120) items.push("Run purifier on Boost mode.");
  else if (reading.aqi !== null && reading.aqi >= 80) items.push("Keep purifier on Auto to stabilize AQI.");
  if (reading.co2 !== null && reading.co2 >= 1000) items.push("Increase ventilation to reduce CO2.");
  if (reading.voc !== null && reading.voc >= 220) items.push("Avoid aerosols and enable exhaust fans.");
  if (reading.humidity !== null && reading.humidity >= 60) items.push("Humidity is high. Consider dehumidifying.");
  if (reading.humidity !== null && reading.humidity < 35) items.push("Air is dry. Consider humidifying.");
  if (reading.pollen !== null && reading.pollen >= 3) items.push("High pollen: keep windows closed.");
  if (reading.filterLife !== null && reading.filterLife <= 20) items.push("Filter life low. Replace soon.");
  return items.length ? items.slice(0, 4) : [reading.hasReadings
    ? "No suggestions from the available readings. Missing measurements are not assessed."
    : "No sample readings available."];
}
