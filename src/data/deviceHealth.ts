import type { ConnectionStatus } from "../services/deviceClient";
import type { Device } from "../store/useHomeStore";

export type DeviceHealthCategory =
  | "battery"
  | "offline-camera"
  | "stale-sensor"
  | "connectivity"
  | "maintenance";

export type DeviceHealthSeverity = "critical" | "warning" | "info";

export type DeviceHealthIssue = {
  id: string;
  category: DeviceHealthCategory;
  severity: DeviceHealthSeverity;
  title: string;
  detail: string;
  roomId?: string;
  deviceId?: string;
  sortOrder: number;
};

export type DeviceHealthSnapshot = {
  issues: DeviceHealthIssue[];
  byCategory: Record<DeviceHealthCategory, DeviceHealthIssue[]>;
  counts: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
};

export type DeviceHealthContext = {
  devices: Device[];
  realtimeEnabled?: boolean;
  useMqtt?: boolean;
  mqttStatus?: ConnectionStatus;
  mqttError?: string;
  connectionStatus?: ConnectionStatus;
  connectionUrl?: string;
  now?: number;
};

const LOW_BATTERY_CRITICAL = 15;
const LOW_BATTERY_WARNING = 30;
const CAMERA_STALE_MS = 15 * 60 * 1000;
const SENSOR_STALE_MS = 6 * 60 * 60 * 1000;
const MAINTENANCE_FILTER_WARNING = 20;
const MAINTENANCE_FILTER_CRITICAL = 10;
const SMOKE_TEST_WARNING_MS = 45 * 24 * 60 * 60 * 1000;

export const DEVICE_HEALTH_META: Record<
  DeviceHealthCategory,
  {
    label: string;
    icon: string;
    description: string;
  }
> = {
  battery: {
    label: "Low battery",
    icon: "battery-dead-outline",
    description: "Entry sensors, vacuums, and safety devices that need a recharge.",
  },
  "offline-camera": {
    label: "Offline cameras",
    icon: "videocam-off-outline",
    description: "Cameras that are offline or have not checked in recently.",
  },
  "stale-sensor": {
    label: "Stale sensors",
    icon: "pulse-outline",
    description: "Sensors that have stopped reporting fresh readings.",
  },
  connectivity: {
    label: "Weak connection",
    icon: "cloud-offline-outline",
    description: "Realtime bridge problems affecting device updates.",
  },
  maintenance: {
    label: "Maintenance",
    icon: "build-outline",
    description: "Filters, lint traps, and service items that need attention.",
  },
};

function formatRelativeAge(deltaMs: number) {
  const safeDelta = Math.max(0, deltaMs);
  const mins = Math.floor(safeDelta / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function severityOrder(severity: DeviceHealthSeverity) {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  return 2;
}

function buildBatteryIssues(devices: Device[]): DeviceHealthIssue[] {
  return devices.flatMap((device) => {
    const battery = device.battery ?? device.smokeBattery;
    if (typeof battery !== "number") return [];
    if (battery > LOW_BATTERY_WARNING) return [];
    const severity: DeviceHealthSeverity =
      battery <= LOW_BATTERY_CRITICAL ? "critical" : "warning";
    return [
      {
        id: `battery:${device.id}`,
        category: "battery",
        severity,
        title: device.name,
        detail: `Battery at ${Math.round(battery)}%.`,
        roomId: device.roomId,
        deviceId: device.id,
        sortOrder: severityOrder(severity) * 1000 + Math.round(battery),
      },
    ];
  });
}

function buildCameraIssues(devices: Device[], now: number): DeviceHealthIssue[] {
  return devices.flatMap((device) => {
    if (device.kind !== "camera") return [];
    if (!device.isOn) {
      return [
        {
          id: `camera-offline:${device.id}`,
          category: "offline-camera",
          severity: "critical",
          title: device.name,
          detail: "Offline. Live view unavailable.",
          roomId: device.roomId,
          deviceId: device.id,
          sortOrder: 0,
        },
      ];
    }
    if (!device.lastSeenAt || now - device.lastSeenAt >= CAMERA_STALE_MS) {
      const detail = device.lastSeenAt
        ? `No check-in since ${formatRelativeAge(now - device.lastSeenAt)}.`
        : "No signal detected yet.";
      return [
        {
          id: `camera-stale:${device.id}`,
          category: "offline-camera",
          severity: "warning",
          title: device.name,
          detail,
          roomId: device.roomId,
          deviceId: device.id,
          sortOrder: 100,
        },
      ];
    }
    return [];
  });
}

function buildSensorIssues(devices: Device[], now: number): DeviceHealthIssue[] {
  return devices.flatMap((device) => {
    if (device.kind !== "air") return [];
    if (!device.airLastUpdatedAt) {
      return [
        {
          id: `sensor-missing:${device.id}`,
          category: "stale-sensor",
          severity: "warning",
          title: device.name,
          detail: "No fresh air-quality reading yet.",
          roomId: device.roomId,
          deviceId: device.id,
          sortOrder: 100,
        },
      ];
    }
    const ageMs = now - device.airLastUpdatedAt;
    if (ageMs < SENSOR_STALE_MS) return [];
    return [
      {
        id: `sensor-stale:${device.id}`,
        category: "stale-sensor",
        severity: ageMs >= SENSOR_STALE_MS * 2 ? "critical" : "warning",
        title: device.name,
        detail: `Last updated ${formatRelativeAge(ageMs)}.`,
        roomId: device.roomId,
        deviceId: device.id,
        sortOrder: ageMs >= SENSOR_STALE_MS * 2 ? 0 : 100,
      },
    ];
  });
}

function buildConnectivityIssues(
  context: DeviceHealthContext,
): DeviceHealthIssue[] {
  if (!context.realtimeEnabled) return [];

  if (context.useMqtt) {
    const status = context.mqttStatus ?? "connecting";
    if (status === "connected") return [];
    const severity: DeviceHealthSeverity =
      status === "error" || status === "disconnected" ? "critical" : "warning";
    return [
      {
        id: "connectivity:mqtt",
        category: "connectivity",
        severity,
        title: "MQTT bridge",
        detail:
          context.mqttError?.trim() ||
          (status === "connecting"
            ? "Still establishing a device bridge."
            : "Device updates are not reaching the app."),
        sortOrder: severityOrder(severity) * 1000,
      },
    ];
  }

  const status = context.connectionStatus ?? "disconnected";
  if (status === "connected") return [];
  const severity: DeviceHealthSeverity =
    status === "error" || status === "disconnected" ? "critical" : "warning";
  return [
    {
      id: "connectivity:websocket",
      category: "connectivity",
      severity,
      title: "Realtime connection",
      detail:
        status === "connecting"
          ? `Connecting to ${context.connectionUrl || "your bridge"}.`
          : `Offline${context.connectionUrl ? ` from ${context.connectionUrl}` : ""}.`,
      sortOrder: severityOrder(severity) * 1000,
    },
  ];
}

function buildMaintenanceIssues(devices: Device[], now: number): DeviceHealthIssue[] {
  const issues: DeviceHealthIssue[] = [];

  devices.forEach((device) => {
    const addFilterIssue = (
      fieldLabel: string,
      value?: number,
      idSuffix = fieldLabel.toLowerCase(),
    ) => {
      if (typeof value !== "number" || value > MAINTENANCE_FILTER_WARNING) {
        return;
      }
      const severity: DeviceHealthSeverity =
        value <= MAINTENANCE_FILTER_CRITICAL ? "critical" : "warning";
      issues.push({
        id: `maintenance:${device.id}:${idSuffix}`,
        category: "maintenance",
        severity,
        title: device.name,
        detail: `${fieldLabel} at ${Math.round(value)}%.`,
        roomId: device.roomId,
        deviceId: device.id,
        sortOrder: severityOrder(severity) * 1000 + Math.round(value),
      });
    };

    addFilterIssue("AC filter", device.acFilterLife, "ac-filter");
    addFilterIssue("Fridge filter", device.fridgeFilterLife, "fridge-filter");
    addFilterIssue("Vacuum filter", device.vacuumFilterLife, "vacuum-filter");
    addFilterIssue("Air filter", device.airFilterLife, "air-filter");

    if (device.airFilterDaysLeft !== undefined && device.airFilterDaysLeft <= 14) {
      issues.push({
        id: `maintenance:${device.id}:air-filter-days`,
        category: "maintenance",
        severity: device.airFilterDaysLeft <= 7 ? "critical" : "warning",
        title: device.name,
        detail: `Air filter due in ${device.airFilterDaysLeft} day${
          device.airFilterDaysLeft === 1 ? "" : "s"
        }.`,
        roomId: device.roomId,
        deviceId: device.id,
        sortOrder:
          severityOrder(device.airFilterDaysLeft <= 7 ? "critical" : "warning") *
            1000 +
          device.airFilterDaysLeft,
      });
    }

    if (device.vacuumBinFull) {
      issues.push({
        id: `maintenance:${device.id}:vacuum-bin`,
        category: "maintenance",
        severity: "warning",
        title: device.name,
        detail: "Dust bin is full.",
        roomId: device.roomId,
        deviceId: device.id,
        sortOrder: 1000,
      });
    }

    if (device.vacuumBrushDirty) {
      issues.push({
        id: `maintenance:${device.id}:vacuum-brush`,
        category: "maintenance",
        severity: "warning",
        title: device.name,
        detail: "Brush roll needs cleaning.",
        roomId: device.roomId,
        deviceId: device.id,
        sortOrder: 1000,
      });
    }

    if (device.coffeeDescaleNeeded) {
      issues.push({
        id: `maintenance:${device.id}:coffee-descale`,
        category: "maintenance",
        severity: "warning",
        title: device.name,
        detail: "Descale cycle recommended.",
        roomId: device.roomId,
        deviceId: device.id,
        sortOrder: 1000,
      });
    }

    if (device.kind === "dryer" && device.lintFilterOk === false) {
      issues.push({
        id: `maintenance:${device.id}:lint`,
        category: "maintenance",
        severity: "critical",
        title: device.name,
        detail: "Lint filter needs cleaning.",
        roomId: device.roomId,
        deviceId: device.id,
        sortOrder: 0,
      });
    }

    if (device.kind === "smoke") {
      if (device.smokeSensorStatus && device.smokeSensorStatus !== "ok") {
        issues.push({
          id: `maintenance:${device.id}:sensor-status`,
          category: "maintenance",
          severity: device.smokeSensorStatus === "error" ? "critical" : "warning",
          title: device.name,
          detail:
            device.smokeSensorStatus === "error"
              ? "Smoke sensor needs service."
              : "Smoke sensor wants attention.",
          roomId: device.roomId,
          deviceId: device.id,
          sortOrder:
            severityOrder(
              device.smokeSensorStatus === "error" ? "critical" : "warning",
            ) * 1000,
        });
      }
      if (
        device.smokeLastTestAt &&
        now - device.smokeLastTestAt >= SMOKE_TEST_WARNING_MS
      ) {
        issues.push({
          id: `maintenance:${device.id}:smoke-test`,
          category: "maintenance",
          severity: "warning",
          title: device.name,
          detail: `Manual test overdue. Last test ${formatRelativeAge(
            now - device.smokeLastTestAt,
          )}.`,
          roomId: device.roomId,
          deviceId: device.id,
          sortOrder: 1000,
        });
      }
    }
  });

  return issues;
}

export function buildDeviceHealthSnapshot(
  context: DeviceHealthContext,
): DeviceHealthSnapshot {
  const now = context.now ?? Date.now();
  const issues = [
    ...buildBatteryIssues(context.devices),
    ...buildCameraIssues(context.devices, now),
    ...buildSensorIssues(context.devices, now),
    ...buildConnectivityIssues(context),
    ...buildMaintenanceIssues(context.devices, now),
  ].sort((left, right) => {
    if (severityOrder(left.severity) !== severityOrder(right.severity)) {
      return severityOrder(left.severity) - severityOrder(right.severity);
    }
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.title.localeCompare(right.title);
  });

  const byCategory: DeviceHealthSnapshot["byCategory"] = {
    battery: [],
    "offline-camera": [],
    "stale-sensor": [],
    connectivity: [],
    maintenance: [],
  };

  issues.forEach((issue) => {
    byCategory[issue.category].push(issue);
  });

  return {
    issues,
    byCategory,
    counts: {
      total: issues.length,
      critical: issues.filter((issue) => issue.severity === "critical").length,
      warning: issues.filter((issue) => issue.severity === "warning").length,
      info: issues.filter((issue) => issue.severity === "info").length,
    },
  };
}
