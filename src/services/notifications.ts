import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { randomUUID } from "expo-crypto";
import { useHomeStore } from "../store/useHomeStore";
import { isAccountScopeCurrent, type AccountScope } from "../features/account/accountIdentity";

const SESSION_DATA_KEY = 'vantahomeNotificationSession';
let foregroundSession: { token: string; scope: AccountScope } | null = null;

/** Keep account identifiers in memory while tagging OS delivery with an opaque, session-only token. */
function notificationSessionToken(scope: AccountScope): string {
  if (!foregroundSession || !isAccountScopeCurrent(foregroundSession.scope, scope)) {
    const { authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady } = scope;
    foregroundSession = { token: randomUUID(), scope: {
      authenticatedUserId, accountUserId, activeHomeId, accountHomeId, sessionEpoch, membershipReady,
    } };
  }
  return foregroundSession.token;
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const state = useHomeStore.getState();
    // The OS may call back after scheduling or an account switch; queued details must stay with their sender.
    const enabled = state.preferences.notifications && foregroundSession !== null
      && notification.request.content.data?.[SESSION_DATA_KEY] === foregroundSession.token
      && isAccountScopeCurrent(foregroundSession.scope, state);
    return {
      shouldPlaySound: enabled,
      shouldSetBadge: false,
      shouldShowBanner: enabled,
      shouldShowList: enabled,
    };
  },
});

let permissionReady: Promise<boolean> | null = null;
let permissionRequested = false;

/** Keep household details private on Android's locked notification surface. */
async function configureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 200, 200, 200],
    enableVibrate: true,
    // Hide household and device details on a locked Android screen.
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/** Coalesce permission checks while respecting preference changes and later OS permission changes. */
export async function ensureNotificationsReady() {
  if (!useHomeStore.getState().preferences.notifications) return false;
  if (!permissionReady) {
    const scope = useHomeStore.getState();
    const canRequest = () => useHomeStore.getState().preferences.notifications
      && isAccountScopeCurrent(scope, useHomeStore.getState());
    permissionReady = (async () => {
      await configureAndroidChannel();
      if (!canRequest()) return false;
      const current = await Notifications.getPermissionsAsync();
      if (!canRequest()) return false;
      if (current.status === "granted") return true;
      if (current.canAskAgain === false || permissionRequested) return false;
      permissionRequested = true;
      try {
        const requested = await Notifications.requestPermissionsAsync();
        return canRequest() && requested.status === "granted";
      } catch (error) {
        // A failed device call is retryable; a user's refusal is not repeatedly prompted.
        permissionRequested = false;
        throw error;
      }
    })();
  }
  const pending = permissionReady;
  try {
    return await pending;
  } finally {
    if (permissionReady === pending) permissionReady = null;
  }
}

/** Suppress OS notices when disabled without muting in-app reports or bypassing session guards. */
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: { shouldSend: () => boolean },
) {
  const scope = useHomeStore.getState();
  const shouldSend = () => useHomeStore.getState().preferences.notifications
    && isAccountScopeCurrent(scope, useHomeStore.getState())
    && (!options || options.shouldSend());
  if (!shouldSend()) return;
  const allowed = await ensureNotificationsReady();
  if (!allowed || !shouldSend()) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
      data: { ...data, [SESSION_DATA_KEY]: notificationSessionToken(scope) },
    },
    trigger: null,
  });
}

/** Describe reported power status using the shared notification preference and permission checks. */
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
    await sendLocalNotification("Power outage", body, { kind: "power-outage" });
    return;
  }
  await sendLocalNotification("Power restored", "Main power is back online.", {
    kind: "power-restored",
  });
}

/** Send a reported water threshold alert without replacing the application's visible reports. */
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
    );
    return;
  }
  if (kind === "pressure-high") {
    await sendLocalNotification(
      "Water pressure high",
      `Current: ${current} psi (limit ${limit} psi).`,
      { kind: "water-pressure-high" },
    );
    return;
  }
  await sendLocalNotification(
    "Water pressure low",
    `Current: ${current} psi (limit ${limit} psi).`,
    { kind: "water-pressure-low" },
  );
}

/** Send a reported air-quality threshold alert through the shared notification policy. */
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
    );
    return;
  }
  if (kind === "co2") {
    await sendLocalNotification(
      `${prefix}CO2 high`,
      `CO2 ${current} ppm (limit ${limit} ppm).`,
      { kind: "air-co2" },
    );
    return;
  }
  if (kind === "voc") {
    await sendLocalNotification(
      `${prefix}VOC high`,
      `VOC ${current} ppb (limit ${limit} ppb).`,
      { kind: "air-voc" },
    );
    return;
  }
  if (kind === "pm25") {
    await sendLocalNotification(
      `${prefix}PM2.5 high`,
      `PM2.5 ${current} ug/m3 (limit ${limit} ug/m3).`,
      { kind: "air-pm25" },
    );
    return;
  }
  if (kind === "pm10") {
    await sendLocalNotification(
      `${prefix}PM10 high`,
      `PM10 ${current} ug/m3 (limit ${limit} ug/m3).`,
      { kind: "air-pm10" },
    );
    return;
  }
  await sendLocalNotification(
    `${prefix}Pollen alert`,
    `Pollen index ${current} (limit ${limit}).`,
    { kind: "air-pollen" },
  );
}
