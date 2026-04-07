import type { AppNotification } from "./appNotifications";
import type {
  AirQualitySample,
  Device,
  EnergySample,
  WaterSample,
} from "../store/useHomeStore";

export type AnalyticsWindow = "24h" | "7d";

export type AnalyticsPoint = {
  label: string;
  value: number;
};

export type AnalyticsDataset = {
  summary: string;
  footer?: string;
  emptyText: string;
  stats: Array<{
    label: string;
    value: string;
  }>;
  points: AnalyticsPoint[];
};

export type AnalyticsDatasets = Record<AnalyticsWindow, AnalyticsDataset>;

type Bucket = {
  start: number;
  end: number;
  label: string;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const hashValue = (key: string) => {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const seededNoise = (key: string, index: number) => {
  const base = hashValue(`${key}:${index}`);
  return ((Math.sin(base) + 1) / 2) * 0.8 + 0.6;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const round = (value: number, digits = 1) =>
  Number(value.toFixed(digits));

const formatHourLabel = (ts: number) => {
  const hour = new Date(ts).getHours();
  const normalized = hour % 12 || 12;
  return `${normalized}${hour >= 12 ? "p" : "a"}`;
};

const formatDayLabel = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { weekday: "short" });

const buildBuckets = (window: AnalyticsWindow, now: number): Bucket[] => {
  if (window === "24h") {
    return Array.from({ length: 12 }, (_, index) => {
      const start = now - DAY_MS + index * 2 * HOUR_MS;
      return {
        start,
        end: start + 2 * HOUR_MS,
        label: formatHourLabel(start),
      };
    });
  }

  return Array.from({ length: 7 }, (_, index) => {
    const start = now - 6 * DAY_MS + index * DAY_MS;
    return {
      start,
      end: start + DAY_MS,
      label: formatDayLabel(start),
    };
  });
};

const distributeAmount = (
  buckets: Bucket[],
  start: number,
  end: number,
  amount: number,
  target: number[],
) => {
  const duration = end - start;
  if (!(duration > 0) || !(amount > 0)) return;
  buckets.forEach((bucket, index) => {
    const overlap = Math.min(end, bucket.end) - Math.max(start, bucket.start);
    if (overlap <= 0) return;
    target[index] += amount * (overlap / duration);
  });
};

const buildSyntheticDistribution = (
  total: number,
  weights: number[],
  labels: string[],
): AnalyticsPoint[] => {
  const safeTotal = Math.max(0, total);
  const sum = weights.reduce((acc, value) => acc + value, 0) || 1;
  return weights.map((weight, index) => ({
    label: labels[index] ?? "",
    value: safeTotal * (weight / sum),
  }));
};

const coverageIsHealthy = (
  timestamps: number[],
  window: AnalyticsWindow,
  now: number,
) => {
  if (timestamps.length < 2) return false;
  const minCoverage = window === "24h" ? 6 * HOUR_MS : 2 * DAY_MS;
  const valid = timestamps.filter((ts) => ts <= now);
  if (valid.length < 2) return false;
  return valid[valid.length - 1] - valid[0] >= minCoverage;
};

const appendCurrentSample = <T extends { ts: number }>(
  samples: T[],
  current: T,
) => {
  if (!samples.length) return [current];
  const last = samples[samples.length - 1];
  if (Math.abs(last.ts - current.ts) < 60_000) {
    return [...samples.slice(0, -1), current];
  }
  return [...samples, current];
};

const buildEnergyFallback = (
  device: Device,
  window: AnalyticsWindow,
  now: number,
): AnalyticsPoint[] => {
  const labels = buildBuckets(window, now).map((bucket) => bucket.label);
  const todayTotal = Math.max(0, device.energyTodayKwh ?? 0);
  const weekTotal = Math.max(
    todayTotal * 5.8,
    ((device.energyMonthKwh ?? todayTotal * 28) / 30) * 7,
  );

  if (window === "24h") {
    const weights = Array.from({ length: 12 }, (_, index) => {
      const hour = new Date(now - DAY_MS + index * 2 * HOUR_MS).getHours();
      const morning = hour >= 6 && hour <= 9 ? 1.35 : 1;
      const evening = hour >= 17 && hour <= 22 ? 1.6 : 1;
      const overnight = hour < 5 ? 0.55 : 1;
      return morning * evening * overnight * seededNoise(device.id, index);
    });
    return buildSyntheticDistribution(todayTotal, weights, labels);
  }

  const weights = Array.from({ length: 7 }, (_, index) => {
    const weekend = index >= 5 ? 1.15 : 1;
    return weekend * seededNoise(`${device.id}:week`, index);
  });
  return buildSyntheticDistribution(weekTotal, weights, labels);
};

const buildWaterFallback = (
  device: Device,
  window: AnalyticsWindow,
  now: number,
): AnalyticsPoint[] => {
  const labels = buildBuckets(window, now).map((bucket) => bucket.label);
  const todayTotal = Math.max(0, device.waterTodayL ?? 0);
  const weekTotal = Math.max(
    todayTotal * 5.6,
    ((device.waterBudgetL ?? todayTotal * 2) / 2) * 7,
  );

  if (window === "24h") {
    const weights = Array.from({ length: 12 }, (_, index) => {
      const hour = new Date(now - DAY_MS + index * 2 * HOUR_MS).getHours();
      const morning = hour >= 6 && hour <= 9 ? 1.8 : 1;
      const evening = hour >= 18 && hour <= 22 ? 1.45 : 1;
      const overnight = hour < 5 ? 0.25 : 1;
      return morning * evening * overnight * seededNoise(`${device.id}:water`, index);
    });
    return buildSyntheticDistribution(todayTotal, weights, labels);
  }

  const weights = Array.from({ length: 7 }, (_, index) => {
    const weekend = index >= 5 ? 1.2 : 1;
    return weekend * seededNoise(`${device.id}:water:week`, index);
  });
  return buildSyntheticDistribution(weekTotal, weights, labels);
};

const buildAirFallback = (
  device: Device,
  window: AnalyticsWindow,
  now: number,
): AnalyticsPoint[] => {
  const buckets = buildBuckets(window, now);
  const base = Math.max(1, device.airQualityIndex ?? 0);
  const variance = window === "24h" ? 8 : 14;
  return buckets.map((bucket, index) => ({
    label: bucket.label,
    value: clamp(
      base + (seededNoise(`${device.id}:air`, index) - 1) * variance,
      4,
      180,
    ),
  }));
};

const summarizePoints = (points: AnalyticsPoint[]) => {
  const values = points.map((point) => point.value);
  const total = values.reduce((acc, value) => acc + value, 0);
  const average = values.length ? total / values.length : 0;
  const peak = values.length ? Math.max(...values) : 0;
  const low = values.length ? Math.min(...values) : 0;
  return {
    total,
    average,
    peak,
    low,
  };
};

const buildEnergyPointsFromHistory = (
  device: Device,
  window: AnalyticsWindow,
  now: number,
) => {
  const history = Array.isArray(device.energyHistory) ? device.energyHistory : [];
  const current: EnergySample = {
    ts: now,
    powerW: device.powerW,
    solarW: device.solarW,
    gridAvailable: device.gridAvailable,
  };
  const samples = appendCurrentSample(
    [...history].filter((sample) => sample && typeof sample.ts === "number"),
    current,
  ).sort((left, right) => left.ts - right.ts);
  if (!coverageIsHealthy(samples.map((sample) => sample.ts), window, now)) {
    return null;
  }

  const buckets = buildBuckets(window, now);
  const totals = new Array(buckets.length).fill(0);
  const solarTotals = new Array(buckets.length).fill(0);

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const next = samples[index];
    const start = Math.max(previous.ts, buckets[0]?.start ?? previous.ts);
    const end = Math.min(next.ts, buckets[buckets.length - 1]?.end ?? next.ts);
    if (end <= start) continue;
    const energy = Math.max(0, previous.powerW ?? 0) * ((end - start) / HOUR_MS) / 1000;
    const solar = Math.max(0, previous.solarW ?? 0) * ((end - start) / HOUR_MS) / 1000;
    distributeAmount(buckets, start, end, energy, totals);
    distributeAmount(buckets, start, end, solar, solarTotals);
  }

  return {
    points: buckets.map((bucket, index) => ({
      label: bucket.label,
      value: totals[index],
    })),
    solarTotal: solarTotals.reduce((acc, value) => acc + value, 0),
  };
};

const buildWaterPointsFromHistory = (
  device: Device,
  window: AnalyticsWindow,
  now: number,
) => {
  const history = Array.isArray(device.waterHistory) ? device.waterHistory : [];
  const current: WaterSample = {
    ts: now,
    flowLpm: device.waterLpm,
    pressurePsi: device.waterPressurePsi,
    leakDetected: device.waterLeakDetected,
  };
  const samples = appendCurrentSample(
    [...history].filter((sample) => sample && typeof sample.ts === "number"),
    current,
  ).sort((left, right) => left.ts - right.ts);
  if (!coverageIsHealthy(samples.map((sample) => sample.ts), window, now)) {
    return null;
  }

  const buckets = buildBuckets(window, now);
  const totals = new Array(buckets.length).fill(0);

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const next = samples[index];
    const start = Math.max(previous.ts, buckets[0]?.start ?? previous.ts);
    const end = Math.min(next.ts, buckets[buckets.length - 1]?.end ?? next.ts);
    if (end <= start) continue;
    const liters = Math.max(0, previous.flowLpm ?? 0) * ((end - start) / 60_000);
    distributeAmount(buckets, start, end, liters, totals);
  }

  return buckets.map((bucket, index) => ({
    label: bucket.label,
    value: totals[index],
  }));
};

const buildAirPointsFromHistory = (
  history: AirQualitySample[],
  window: AnalyticsWindow,
  fallbackAqi: number,
  now: number,
) => {
  const samples = [...history]
    .filter((sample) => sample && typeof sample.ts === "number")
    .sort((left, right) => left.ts - right.ts);
  if (!coverageIsHealthy(samples.map((sample) => sample.ts), window, now)) {
    return null;
  }

  const buckets = buildBuckets(window, now);
  const sums = new Array(buckets.length).fill(0);
  const counts = new Array(buckets.length).fill(0);
  samples.forEach((sample) => {
    const aqi = sample.aqi ?? fallbackAqi;
    const bucketIndex = buckets.findIndex(
      (bucket) => sample.ts >= bucket.start && sample.ts < bucket.end,
    );
    if (bucketIndex < 0) return;
    sums[bucketIndex] += Math.max(0, aqi);
    counts[bucketIndex] += 1;
  });

  return buckets.map((bucket, index) => ({
    label: bucket.label,
    value:
      counts[index] > 0
        ? sums[index] / counts[index]
        : index > 0
          ? sums[index - 1] / Math.max(1, counts[index - 1])
          : fallbackAqi,
  }));
};

export const buildEnergyAnalytics = (
  device: Device,
  now = Date.now(),
): AnalyticsDatasets => {
  const buildDataset = (window: AnalyticsWindow): AnalyticsDataset => {
    const history = buildEnergyPointsFromHistory(device, window, now);
    const points = history?.points ?? buildEnergyFallback(device, window, now);
    const summary = summarizePoints(points);
    const solarTotal = history?.solarTotal ?? Math.max(0, device.solarTodayKwh ?? 0);
    const gridTotal = Math.max(0, summary.total - solarTotal);
    return {
      summary: `Home energy demand over the last ${window}.`,
      footer:
        window === "24h"
          ? `Solar ${round(solarTotal)} kWh · Grid ${round(gridTotal)} kWh`
          : `Peak draw ${Math.round(device.energyPeakW ?? 0)}W · ${
              device.gridAvailable === false ? "Grid outage tracked" : "Grid online"
            }`,
      emptyText: "No energy history yet.",
      stats: [
        { label: "Usage", value: `${round(summary.total)} kWh` },
        { label: "Avg", value: `${round(summary.average)} kWh` },
        { label: "Peak", value: `${round(summary.peak)} kWh` },
      ],
      points,
    };
  };

  return {
    "24h": buildDataset("24h"),
    "7d": buildDataset("7d"),
  };
};

export const buildWaterAnalytics = (
  device: Device,
  now = Date.now(),
): AnalyticsDatasets => {
  const buildDataset = (window: AnalyticsWindow): AnalyticsDataset => {
    const history = buildWaterPointsFromHistory(device, window, now);
    const points = history ?? buildWaterFallback(device, window, now);
    const summary = summarizePoints(points);
    return {
      summary: `Whole-home water usage across the last ${window}.`,
      footer:
        window === "24h"
          ? `Pressure ${Math.round(device.waterPressurePsi ?? 0)} psi · Flow ${round(
              device.waterLpm ?? 0,
            )} L/min`
          : `Budget ${Math.round(device.waterBudgetL ?? 0)} L/day · ${
              device.waterLeakDetected ? "Leak detected" : "No active leak"
            }`,
      emptyText: "No water history yet.",
      stats: [
        { label: "Total", value: `${Math.round(summary.total)} L` },
        { label: "Avg", value: `${Math.round(summary.average)} L` },
        { label: "Peak", value: `${Math.round(summary.peak)} L` },
      ],
      points,
    };
  };

  return {
    "24h": buildDataset("24h"),
    "7d": buildDataset("7d"),
  };
};

export const buildAirAnalytics = (
  device: Device,
  now = Date.now(),
): AnalyticsDatasets => {
  const history = Array.isArray(device.airHistory) ? device.airHistory : [];
  const currentAqi = Math.max(1, device.airQualityIndex ?? 0);
  const buildDataset = (window: AnalyticsWindow): AnalyticsDataset => {
    const points =
      buildAirPointsFromHistory(history, window, currentAqi, now) ??
      buildAirFallback(device, window, now);
    const summary = summarizePoints(points);
    return {
      summary: `Average indoor AQI across the last ${window}.`,
      footer:
        window === "24h"
          ? `Current AQI ${Math.round(currentAqi)} · CO2 ${Math.round(
              device.airCo2 ?? 0,
            )} ppm`
          : `PM2.5 ${Math.round(device.airPm25 ?? 0)} ug/m3 · Filter ${
              Math.round(device.airFilterLife ?? 0)
            }%`,
      emptyText: "No air quality history yet.",
      stats: [
        { label: "Avg AQI", value: `${Math.round(summary.average)}` },
        { label: "Low", value: `${Math.round(summary.low)}` },
        { label: "High", value: `${Math.round(summary.peak)}` },
      ],
      points,
    };
  };

  return {
    "24h": buildDataset("24h"),
    "7d": buildDataset("7d"),
  };
};

export const buildSecurityAnalytics = (
  notifications: AppNotification[],
  now = Date.now(),
): AnalyticsDatasets => {
  const relevant = notifications.filter(
    (notification) =>
      notification.category === "security" || notification.category === "alert",
  );

  const buildDataset = (window: AnalyticsWindow): AnalyticsDataset => {
    const buckets = buildBuckets(window, now);
    const counts = new Array(buckets.length).fill(0);
    relevant.forEach((notification) => {
      const bucketIndex = buckets.findIndex(
        (bucket) =>
          notification.createdAt >= bucket.start &&
          notification.createdAt < bucket.end,
      );
      if (bucketIndex >= 0) counts[bucketIndex] += 1;
    });
    const points = buckets.map((bucket, index) => ({
      label: bucket.label,
      value: counts[index],
    }));
    const summary = summarizePoints(points);
    return {
      summary: `Security and alert activity over the last ${window}.`,
      footer:
        relevant.length > 0
          ? `${relevant.filter((item) => item.category === "security").length} security · ${
              relevant.filter((item) => item.category === "alert").length
            } safety/utility`
          : "No recent security activity.",
      emptyText: "No security events yet.",
      stats: [
        { label: "Events", value: `${Math.round(summary.total)}` },
        {
          label: window === "24h" ? "Avg block" : "Avg day",
          value: round(summary.average, 1).toString(),
        },
        { label: "Peak", value: `${Math.round(summary.peak)}` },
      ],
      points,
    };
  };

  return {
    "24h": buildDataset("24h"),
    "7d": buildDataset("7d"),
  };
};
