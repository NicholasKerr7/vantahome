import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { NotificationCategory } from "../data/appNotifications";
import { useHomeStore } from "../store/useHomeStore";
import {
  formatAwaySecuritySummary,
  type SecurityAuditIssue,
} from "./securityAudit";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let permissionReady: Promise<boolean> | null = null;
let permissionGranted: boolean | null = null;

async function configureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 200, 200, 200],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function ensureNotificationsReady() {
  if (permissionGranted !== null) return permissionGranted;
  if (!permissionReady) {
    permissionReady = (async () => {
      await configureAndroidChannel();
      const current = await Notifications.getPermissionsAsync();
      if (current.status === "granted") {
        permissionGranted = true;
        return true;
      }
      const requested = await Notifications.requestPermissionsAsync();
      permissionGranted = requested.status === "granted";
      return permissionGranted;
    })();
  }
  return permissionReady;
}

export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: { category?: NotificationCategory; isNew?: boolean },
) {
  let osNotificationId: string | undefined;
  try {
    const allowed = await ensureNotificationsReady();
    if (allowed) {
      osNotificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: "default",
          data,
        },
        trigger: null,
      });
    }
  } catch {
    osNotificationId = undefined;
  }

  useHomeStore.getState().addNotification({
    title,
    body,
    category: options?.category ?? "info",
    isNew: options?.isNew ?? true,
    osNotificationId,
  });
}

export async function notifyPowerStatus({
  isOutage,
  solarActive,
}: {
  isOutage: boolean;
  solarActive: boolean;
}) {
  if (isOutage) {
    const body = solarActive
      ? "Main power offline. Solar is supplying the home."
      : "Main power offline. Switch to backup if available.";
    await sendLocalNotification(
      "Power outage",
      body,
      { kind: "power-outage" },
      { category: "alert" },
    );
    return;
  }
  await sendLocalNotification(
    "Power restored",
    "Main power is back online.",
    {
      kind: "power-restored",
    },
    { category: "info" },
  );
}

export async function notifyWaterAlert({
  kind,
  current,
  limit,
}: {
  kind: "budget" | "pressure-low" | "pressure-high";
  current: number;
  limit: number;
}) {
  if (kind === "budget") {
    await sendLocalNotification(
      "Water budget exceeded",
      `Today: ${current} L (budget ${limit} L).`,
      { kind: "water-budget" },
      { category: "alert" },
    );
    return;
  }
  if (kind === "pressure-high") {
    await sendLocalNotification(
      "Water pressure high",
      `Current: ${current} psi (limit ${limit} psi).`,
      { kind: "water-pressure-high" },
      { category: "alert" },
    );
    return;
  }
  await sendLocalNotification(
    "Water pressure low",
    `Current: ${current} psi (limit ${limit} psi).`,
    { kind: "water-pressure-low" },
    { category: "alert" },
  );
}

export async function notifyWaterLeak() {
  await sendLocalNotification(
    "Water leak detected",
    "Auto shutoff recommended.",
    { kind: "water-leak" },
    { category: "alert" },
  );
}

export async function notifyAirAlert({
  deviceName,
  kind,
  current,
  limit,
}: {
  deviceName?: string;
  kind: "aqi" | "co2" | "voc" | "pm25" | "pm10" | "pollen";
  current: number;
  limit: number;
}) {
  const prefix = deviceName ? `${deviceName} • ` : "";
  if (kind === "aqi") {
    await sendLocalNotification(
      `${prefix}Air quality`,
      `AQI ${current} (limit ${limit}).`,
      { kind: "air-aqi" },
      { category: "alert" },
    );
    return;
  }
  if (kind === "co2") {
    await sendLocalNotification(
      `${prefix}CO2 high`,
      `CO2 ${current} ppm (limit ${limit} ppm).`,
      { kind: "air-co2" },
      { category: "alert" },
    );
    return;
  }
  if (kind === "voc") {
    await sendLocalNotification(
      `${prefix}VOC high`,
      `VOC ${current} ppb (limit ${limit} ppb).`,
      { kind: "air-voc" },
      { category: "alert" },
    );
    return;
  }
  if (kind === "pm25") {
    await sendLocalNotification(
      `${prefix}PM2.5 high`,
      `PM2.5 ${current} ug/m3 (limit ${limit} ug/m3).`,
      { kind: "air-pm25" },
      { category: "alert" },
    );
    return;
  }
  if (kind === "pm10") {
    await sendLocalNotification(
      `${prefix}PM10 high`,
      `PM10 ${current} ug/m3 (limit ${limit} ug/m3).`,
      { kind: "air-pm10" },
      { category: "alert" },
    );
    return;
  }
  await sendLocalNotification(
    `${prefix}Pollen alert`,
    `Pollen index ${current} (limit ${limit}).`,
    { kind: "air-pollen" },
    { category: "alert" },
  );
}

export async function notifySolarActive(productionW: number) {
  await sendLocalNotification(
    "Solar active",
    `Producing ${Math.round(productionW)}W.`,
    { kind: "solar-active" },
    { category: "info" },
  );
}

export async function notifyEntryOpen({
  deviceName,
  openPercent,
}: {
  deviceName: string;
  openPercent: number;
}) {
  await sendLocalNotification(
    `${deviceName} open`,
    `${Math.round(openPercent)}% open.`,
    { kind: "entry-open" },
    { category: "security" },
  );
}

export async function notifyHomeLeftUnsecured(
  issues: SecurityAuditIssue[],
) {
  if (!issues.length) return;
  await sendLocalNotification(
    "Home left unsecured",
    formatAwaySecuritySummary(issues),
    {
      kind: "away-security-audit",
      issueCount: issues.length,
      devices: issues.map((issue) => issue.deviceId),
    },
    { category: "security" },
  );
}

export async function dismissDeliveredNotification(notificationId?: string) {
  if (!notificationId) return;
  await Promise.allSettled([
    Notifications.dismissNotificationAsync(notificationId),
    Notifications.cancelScheduledNotificationAsync(notificationId),
  ]);
}

export async function clearDeliveredNotifications() {
  await Promise.allSettled([
    Notifications.dismissAllNotificationsAsync(),
    Notifications.cancelAllScheduledNotificationsAsync(),
  ]);
}
