import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { NotificationCategory, AppNotification } from "../data/appNotifications";
import type { NotificationPreferenceSnapshot } from "../data/notificationControls";
import { useHomeStore } from "../store/useHomeStore";
import {
  dispatchRemotePushNotification as dispatchRemotePushNotificationRequest,
  registerPushDevice,
} from "./cloudRegistry";
import { supabase } from "./supabaseClient";

type ExpoNotificationsModule = typeof import("expo-notifications");
type ExpoDeviceModule = typeof import("expo-device");
type ExpoConstantsModule = typeof import("expo-constants");

type RemotePushRegistrationOptions = {
  preferences: NotificationPreferenceSnapshot;
  timezone?: string | null;
};

type RemotePushRegistrationResult =
  | { kind: "registered"; token: string | null }
  | { kind: "unavailable" }
  | { kind: "unauthenticated" }
  | { kind: "registration-failed" };

const PUSH_INSTALLATION_ID_KEY = "vantahome-push-installation-id";

let cachedNotificationsModule: ExpoNotificationsModule | null | undefined;
let cachedDeviceModule: ExpoDeviceModule | null | undefined;
let cachedConstantsModule: ExpoConstantsModule | null | undefined;
let currentPushToken: string | null = null;
let remotePushSyncStarted = false;

function getNotificationsModule() {
  if (cachedNotificationsModule !== undefined) return cachedNotificationsModule;
  try {
    cachedNotificationsModule =
      require("expo-notifications") as ExpoNotificationsModule;
  } catch {
    cachedNotificationsModule = null;
  }
  return cachedNotificationsModule;
}

function getDeviceModule() {
  if (cachedDeviceModule !== undefined) return cachedDeviceModule;
  try {
    cachedDeviceModule = require("expo-device") as ExpoDeviceModule;
  } catch {
    cachedDeviceModule = null;
  }
  return cachedDeviceModule;
}

function getConstantsModule() {
  if (cachedConstantsModule !== undefined) return cachedConstantsModule;
  try {
    cachedConstantsModule = require("expo-constants") as ExpoConstantsModule;
  } catch {
    cachedConstantsModule = null;
  }
  return cachedConstantsModule;
}

function getConstantsSnapshot() {
  const Constants = getConstantsModule();
  if (!Constants) return null;
  return (Constants as { default?: Record<string, unknown> }).default ?? Constants;
}

function createInstallationId() {
  return `push-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

async function getInstallationId() {
  const existing = await AsyncStorage.getItem(PUSH_INSTALLATION_ID_KEY);
  if (existing) return existing;
  const next = createInstallationId();
  await AsyncStorage.setItem(PUSH_INSTALLATION_ID_KEY, next);
  return next;
}

function getProjectId() {
  const envProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  if (envProjectId) return envProjectId;
  const constants = getConstantsSnapshot() as
    | {
        easConfig?: { projectId?: string };
        expoConfig?: { extra?: { eas?: { projectId?: string } } };
      }
    | null;
  return (
    constants?.easConfig?.projectId?.trim() ||
    constants?.expoConfig?.extra?.eas?.projectId?.trim() ||
    null
  );
}

function getResolvedTimezone(timezone?: string | null) {
  if (timezone && timezone !== "Auto") return timezone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

async function getExpoPushToken() {
  const Notifications = getNotificationsModule();
  const Device = getDeviceModule();
  if (!Notifications || !Device?.isDevice) return null;

  const projectId = getProjectId();
  if (!projectId) return null;

  const currentPermissions = await Notifications.getPermissionsAsync().catch(
    () => null,
  );
  let status = currentPermissions?.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync().catch(
      () => null,
    );
    status = requested?.status;
  }
  if (status !== "granted") return null;

  const token = await Notifications.getExpoPushTokenAsync({ projectId }).catch(
    () => null,
  );
  currentPushToken = token?.data?.trim() || null;
  return currentPushToken;
}

function buildPreferenceState(
  preferences: NotificationPreferenceSnapshot,
  timezone?: string | null,
) {
  return {
    notifications: preferences.notifications ?? true,
    notificationCategories: preferences.notificationCategories ?? {},
    notificationQuietHoursEnabled:
      preferences.notificationQuietHoursEnabled ?? false,
    notificationQuietHoursStartHour:
      preferences.notificationQuietHoursStartHour ?? 22,
    notificationQuietHoursEndHour:
      preferences.notificationQuietHoursEndHour ?? 7,
    notificationRepeatMinutes: preferences.notificationRepeatMinutes ?? 15,
    notificationOpenDelayMinutes:
      preferences.notificationOpenDelayMinutes ?? 5,
    timezone: getResolvedTimezone(timezone),
  };
}

function normalizeNotificationCategory(
  value: unknown,
): NotificationCategory | null {
  switch (value) {
    case "alert":
    case "device":
    case "scene":
    case "automation":
    case "security":
    case "info":
      return value;
    default:
      return null;
  }
}

function buildInboxNotificationFromPayload(
  payload:
    | {
        title?: string | null;
        body?: string | null;
        data?: Record<string, unknown>;
        identifier?: string | null;
      }
    | null
    | undefined,
): AppNotification | null {
  if (!payload) return null;
  const data = payload.data ?? {};
  if (data.deliveryOrigin !== "remote") return null;

  const category = normalizeNotificationCategory(data.category);
  const title =
    payload.title?.trim() ||
    (typeof data.title === "string" ? data.title.trim() : "");
  const body =
    payload.body?.trim() ||
    (typeof data.body === "string" ? data.body.trim() : "");

  if (!title || !body || !category) return null;

  return {
    id:
      (typeof data.appNotificationId === "string" && data.appNotificationId) ||
      payload.identifier ||
      `n${Date.now()}`,
    title,
    body,
    category,
    isNew: data.isNew !== false,
    osNotificationId: payload.identifier ?? undefined,
    createdAt: Date.now(),
  };
}

function storeRemoteInboxNotification(
  payload:
    | {
        title?: string | null;
        body?: string | null;
        data?: Record<string, unknown>;
        identifier?: string | null;
      }
    | null
    | undefined,
) {
  const notification = buildInboxNotificationFromPayload(payload);
  if (!notification) return;
  useHomeStore.getState().addNotification(notification);
}

export async function syncRemotePushRegistration(
  options: RemotePushRegistrationOptions,
): Promise<RemotePushRegistrationResult> {
  if (!supabase) return { kind: "unavailable" };
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return { kind: "unauthenticated" };

  try {
    const installationId = await getInstallationId();
    const constants = getConstantsSnapshot() as
      | {
          expoConfig?: { version?: string };
          nativeAppVersion?: string;
        }
      | null;
    const Device = getDeviceModule();
    const token = await getExpoPushToken();
    await registerPushDevice({
      installationId,
      expoPushToken: token,
      platform:
        Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web"
          ? Platform.OS
          : "unknown",
      deviceName:
        (typeof Device?.deviceName === "string" && Device.deviceName) || null,
      deviceModel:
        (typeof Device?.modelName === "string" && Device.modelName) || null,
      appVersion:
        constants?.expoConfig?.version?.trim() ||
        constants?.nativeAppVersion?.trim() ||
        null,
      preferenceState: buildPreferenceState(options.preferences, options.timezone),
      disabled: false,
    });
    return { kind: "registered", token };
  } catch {
    return { kind: "registration-failed" };
  }
}

export async function disableRemotePushRegistration() {
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return false;
  try {
    const installationId = await getInstallationId();
    await registerPushDevice({
      installationId,
      expoPushToken: null,
      platform:
        Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web"
          ? Platform.OS
          : "unknown",
      preferenceState: {},
      disabled: true,
    });
    currentPushToken = null;
    return true;
  } catch {
    return false;
  }
}

export async function dispatchRemotePushNotification(payload: {
  title: string;
  body: string;
  category: NotificationCategory;
  data?: Record<string, unknown>;
  bypassQuietHours?: boolean;
  appNotificationId?: string;
  isNew?: boolean;
}) {
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return false;
  try {
    await dispatchRemotePushNotificationRequest({
      ...payload,
      originPushToken: currentPushToken,
    });
    return true;
  } catch {
    return false;
  }
}

export function startRemotePushInboxSync() {
  if (remotePushSyncStarted) return () => {};
  const Notifications = getNotificationsModule();
  if (!Notifications) return () => {};

  remotePushSyncStarted = true;

  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      const notification = response?.notification;
      if (!notification) return;
      storeRemoteInboxNotification({
        title: notification.request.content.title,
        body: notification.request.content.body,
        data: notification.request.content.data as Record<string, unknown>,
        identifier: notification.request.identifier,
      });
    })
    .catch(() => {});

  const receivedSub = Notifications.addNotificationReceivedListener(
    (notification) => {
      storeRemoteInboxNotification({
        title: notification.request.content.title,
        body: notification.request.content.body,
        data: notification.request.content.data as Record<string, unknown>,
        identifier: notification.request.identifier,
      });
    },
  );
  const responseSub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      storeRemoteInboxNotification({
        title: response.notification.request.content.title,
        body: response.notification.request.content.body,
        data: response.notification.request.content.data as Record<string, unknown>,
        identifier: response.notification.request.identifier,
      });
    },
  );

  return () => {
    remotePushSyncStarted = false;
    receivedSub.remove();
    responseSub.remove();
  };
}
