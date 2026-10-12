import type { Device } from "../../../store/useHomeStore";
import { AIR_READING_FRESHNESS_MS, reportedMeasurement, airReadingRecommendations, readAirTelemetry } from "../airTelemetry";

const now = 1_800_000_000_000;
const sensor: Device = { id: "air", name: "Air sensor", kind: "air", roomId: "living", isOn: true };

describe("physical air telemetry", () => {
  it("leaves missing measurements and confidence unknown without manufacturing a timestamp or history", () => {
    const reading = readAirTelemetry(sensor, false, now);
    expect(reading).toMatchObject({ status: "unavailable", aqi: null, confidence: null, co2: null,
      humidity: null, filterLife: null, filterDaysLeft: null, tempC: null, outdoorTempC: null,
      series: [], lastUpdatedAt: null, trendDelta: null });
    expect(airReadingRecommendations(reading)).toEqual(["Connect an air sensor to see readings and recommendations."]);
  });

  it("keeps valid zero readings and negative temperatures instead of hiding them", () => {
    const reading = readAirTelemetry({ ...sensor, airQualityIndex: 0, airQualityConfidence: 0,
      airPm25: 0, humidity: 0, tempC: -3, airOutdoorTempC: 0, airLastUpdatedAt: now }, false, now);
    expect(reading).toMatchObject({ status: "recent", aqi: 0, confidence: 0, pm25: 0, humidity: 0, tempC: -3, outdoorTempC: 0 });
  });

  it.each([NaN, Infinity, -Infinity, -1, undefined, null, "12"])("rejects an invalid pollutant value %s", (value) => {
    expect(reportedMeasurement(value)).toBeNull();
  });

  it("does not certify readings from a generic device update or a historical timestamp", () => {
    const reading = readAirTelemetry({ ...sensor, airQualityIndex: 32, observedAt: now,
      airHistory: [{ ts: now, aqi: 32 }] }, false, now);
    expect(reading.status).toBe("unknown");
    expect(reading.lastUpdatedAt).toBeNull();
    expect(reading.trendDelta).toBeNull();
    expect(reading.series).toEqual([{ ts: now, aqi: 32 }]);
    expect(airReadingRecommendations(reading)[0]).toContain("reading time is unavailable");
  });

  it("marks a cached reading stale at the display threshold and avoids current-condition advice", () => {
    const device = { ...sensor, airQualityIndex: 150, airLastUpdatedAt: now - AIR_READING_FRESHNESS_MS };
    expect(readAirTelemetry(device, false, now - 1).status).toBe("recent");
    const reading = readAirTelemetry(device, false, now);
    expect(reading.status).toBe("stale");
    expect(reading.aqi).toBe(150);
    expect(airReadingRecommendations(reading)[0]).toContain("last known readings");
    expect(airReadingRecommendations(reading).join(" ")).not.toContain("Boost");
  });

  it("rejects future/invalid timestamps and out-of-range confidence", () => {
    const reading = readAirTelemetry({ ...sensor, airQualityIndex: 12, airLastUpdatedAt: now + 1,
      humidity: 101, airQualityConfidence: 120 }, false, now);
    expect(reading).toMatchObject({ status: "unknown", lastUpdatedAt: null, humidity: null, confidence: null });
  });

  it("keeps only observed AQI samples in the real 24-hour window", () => {
    const reading = readAirTelemetry({ ...sensor, airHistory: [
      { ts: now - 25 * 60 * 60 * 1000, aqi: 1 }, { ts: now + 1, aqi: 2 },
      { ts: now - 4, aqi: NaN }, { ts: now - 3, co2: 450 },
      { ts: now, aqi: 0 }, { ts: now - 2, aqi: 15 }, { ts: now - 2, aqi: 10 },
    ] }, false, now);
    expect(reading.series).toEqual([{ ts: now - 2, aqi: 10 }, { ts: now, aqi: 0 }]);
    expect(reading.trendDelta).toBe(-10);
    expect(reading.lastUpdatedAt).toBeNull();
  });

  it("preserves endpoints and the real last-reading change when thinning dense history", () => {
    const reading = readAirTelemetry({ ...sensor, airHistory: Array.from({ length: 100 }, (_, index) =>
      ({ ts: now - (99 - index) * 60_000, aqi: index })) }, false, now);
    expect(reading.series).toHaveLength(48);
    expect(reading.series[0].aqi).toBe(0);
    expect(reading.series[47].aqi).toBe(99);
    expect(reading.trendDelta).toBe(1);
  });

  it("labels simulation samples without synthesizing confidence or history", () => {
    const reading = readAirTelemetry({ ...sensor, airQualityIndex: 32 }, true, now);
    expect(reading).toMatchObject({ status: "sample", aqi: 32, confidence: null, series: [], lastUpdatedAt: null });
    expect(airReadingRecommendations(reading).join(" ")).not.toContain("looks great");
  });
});
