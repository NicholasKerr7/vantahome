import {
  buildAirAnalytics,
  buildEnergyAnalytics,
  buildSecurityAnalytics,
  buildWaterAnalytics,
} from "../analyticsHistory";
import type { AppNotification } from "../appNotifications";
import type { Device } from "../../store/useHomeStore";

describe("analyticsHistory", () => {
  it("builds energy, water, and air datasets with 24h and 7d windows", () => {
    const now = new Date("2026-04-06T18:00:00Z").getTime();
    const energyDevice: Device = {
      id: "energy-1",
      name: "Main Energy",
      kind: "energy",
      roomId: "r1",
      isOn: true,
      powerW: 820,
      solarW: 240,
      energyTodayKwh: 5.2,
      energyMonthKwh: 88,
      energyPeakW: 1440,
      gridAvailable: true,
      energyHistory: [
        { ts: now - 8 * 60 * 60 * 1000, powerW: 700, solarW: 120, gridAvailable: true },
        { ts: now - 4 * 60 * 60 * 1000, powerW: 960, solarW: 260, gridAvailable: true },
        { ts: now - 30 * 60 * 1000, powerW: 820, solarW: 240, gridAvailable: true },
      ],
    };
    const waterDevice: Device = {
      id: "water-1",
      name: "Water Meter",
      kind: "water",
      roomId: "r2",
      isOn: true,
      waterLpm: 6,
      waterTodayL: 180,
      waterBudgetL: 260,
      waterPressurePsi: 51,
      waterLeakDetected: false,
      waterHistory: [
        { ts: now - 8 * 60 * 60 * 1000, flowLpm: 2.2, pressurePsi: 52, leakDetected: false },
        { ts: now - 3 * 60 * 60 * 1000, flowLpm: 7.8, pressurePsi: 50, leakDetected: false },
        { ts: now - 15 * 60 * 1000, flowLpm: 4.1, pressurePsi: 51, leakDetected: false },
      ],
    };
    const airDevice: Device = {
      id: "air-1",
      name: "Air Sensor",
      kind: "air",
      roomId: "r3",
      isOn: true,
      airQualityIndex: 34,
      airCo2: 610,
      airPm25: 8,
      airFilterLife: 82,
      airHistory: [
        { ts: now - 8 * 60 * 60 * 1000, aqi: 28 },
        { ts: now - 4 * 60 * 60 * 1000, aqi: 31 },
        { ts: now - 20 * 60 * 1000, aqi: 34 },
      ],
    };

    const energy = buildEnergyAnalytics(energyDevice, now);
    const water = buildWaterAnalytics(waterDevice, now);
    const air = buildAirAnalytics(airDevice, now);

    expect(energy["24h"].points).toHaveLength(12);
    expect(energy["7d"].points).toHaveLength(7);
    expect(water["24h"].points).toHaveLength(12);
    expect(water["7d"].points).toHaveLength(7);
    expect(air["24h"].points).toHaveLength(12);
    expect(air["7d"].points).toHaveLength(7);
    expect(energy["24h"].stats[0]?.label).toBe("Usage");
    expect(water["24h"].stats[0]?.label).toBe("Total");
    expect(air["24h"].stats[0]?.label).toBe("Avg AQI");
  });

  it("counts security and alert notifications into the right windows", () => {
    const now = new Date("2026-04-06T18:00:00Z").getTime();
    const notifications: AppNotification[] = [
      {
        id: "n1",
        title: "Front Door",
        body: "Left open",
        category: "security",
        createdAt: now - 30 * 60 * 1000,
      },
      {
        id: "n2",
        title: "Water pressure",
        body: "Low pressure detected",
        category: "alert",
        createdAt: now - 5 * 60 * 60 * 1000,
      },
      {
        id: "n3",
        title: "Garage",
        body: "Closed",
        category: "security",
        createdAt: now - 2 * 24 * 60 * 60 * 1000,
      },
      {
        id: "n4",
        title: "Scene",
        body: "Movie Time ran",
        category: "scene",
        createdAt: now - 40 * 60 * 1000,
      },
    ];

    const analytics = buildSecurityAnalytics(notifications, now);
    const total24h = analytics["24h"].points.reduce(
      (sum, point) => sum + point.value,
      0,
    );
    const total7d = analytics["7d"].points.reduce(
      (sum, point) => sum + point.value,
      0,
    );

    expect(total24h).toBe(2);
    expect(total7d).toBe(3);
    expect(analytics["24h"].stats[0]?.value).toBe("2");
  });
});
