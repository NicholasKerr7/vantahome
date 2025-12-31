import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
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
) {
  const allowed = await ensureNotificationsReady();
  if (!allowed) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
      data,
    },
    trigger: null,
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
    await sendLocalNotification("Power outage", body, { kind: "power-outage" });
    return;
  }
  await sendLocalNotification("Power restored", "Main power is back online.", {
    kind: "power-restored",
  });
}
