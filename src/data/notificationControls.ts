import type { NotificationCategory } from "./appNotifications";

export type NotificationCategorySettings = Partial<
  Record<NotificationCategory, boolean>
>;

export type NotificationPreferenceSnapshot = {
  notifications?: boolean;
  notificationCategories?: NotificationCategorySettings;
  notificationQuietHoursEnabled?: boolean;
  notificationQuietHoursStartHour?: number;
  notificationQuietHoursEndHour?: number;
  notificationRepeatMinutes?: number;
  notificationOpenDelayMinutes?: number;
};

export const NOTIFICATION_CATEGORY_OPTIONS: Array<{
  id: NotificationCategory;
  label: string;
  description: string;
}> = [
  {
    id: "security",
    label: "Security",
    description: "Doors, windows, gates, garages, and away alerts",
  },
  {
    id: "alert",
    label: "Safety & utility",
    description: "Power, water, air quality, leaks, and thresholds",
  },
  {
    id: "device",
    label: "Devices",
    description: "Device-specific status updates",
  },
  {
    id: "automation",
    label: "Automations",
    description: "Flow runs and scheduled actions",
  },
  {
    id: "scene",
    label: "Scenes",
    description: "Scene activations and changes",
  },
  {
    id: "info",
    label: "Info",
    description: "Non-critical tips and general updates",
  },
];

export const NOTIFICATION_OPEN_DELAY_OPTIONS = [0, 5, 10, 15] as const;
export const NOTIFICATION_REPEAT_OPTIONS = [0, 5, 10, 15, 30, 60] as const;
export const NOTIFICATION_QUIET_HOUR_START_OPTIONS = [21, 22, 23] as const;
export const NOTIFICATION_QUIET_HOUR_END_OPTIONS = [6, 7, 8] as const;

export const defaultNotificationCategorySettings: Record<
  NotificationCategory,
  boolean
> = {
  alert: true,
  device: true,
  scene: true,
  automation: true,
  security: true,
  info: true,
};

export const defaultNotificationPreferenceFields = {
  notificationCategories: defaultNotificationCategorySettings,
  notificationQuietHoursEnabled: false,
  notificationQuietHoursStartHour: 22,
  notificationQuietHoursEndHour: 7,
  notificationRepeatMinutes: 15,
  notificationOpenDelayMinutes: 5,
} as const;

function clampHour(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(23, Math.round(value)));
}

function clampMinutes(
  value: number | undefined,
  allowed: readonly number[],
  fallback: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return allowed.includes(value) ? value : fallback;
}

export function normalizeNotificationCategorySettings(
  settings?: NotificationCategorySettings,
): Record<NotificationCategory, boolean> {
  return {
    alert: settings?.alert ?? defaultNotificationCategorySettings.alert,
    device: settings?.device ?? defaultNotificationCategorySettings.device,
    scene: settings?.scene ?? defaultNotificationCategorySettings.scene,
    automation:
      settings?.automation ?? defaultNotificationCategorySettings.automation,
    security: settings?.security ?? defaultNotificationCategorySettings.security,
    info: settings?.info ?? defaultNotificationCategorySettings.info,
  };
}

export function getNotificationRepeatMinutes(
  preferences?: NotificationPreferenceSnapshot,
) {
  return clampMinutes(
    preferences?.notificationRepeatMinutes,
    NOTIFICATION_REPEAT_OPTIONS,
    defaultNotificationPreferenceFields.notificationRepeatMinutes,
  );
}

export function getNotificationOpenDelayMinutes(
  preferences?: NotificationPreferenceSnapshot,
) {
  return clampMinutes(
    preferences?.notificationOpenDelayMinutes,
    NOTIFICATION_OPEN_DELAY_OPTIONS,
    defaultNotificationPreferenceFields.notificationOpenDelayMinutes,
  );
}

export function getQuietHoursStartHour(
  preferences?: NotificationPreferenceSnapshot,
) {
  return clampHour(
    preferences?.notificationQuietHoursStartHour,
    defaultNotificationPreferenceFields.notificationQuietHoursStartHour,
  );
}

export function getQuietHoursEndHour(
  preferences?: NotificationPreferenceSnapshot,
) {
  return clampHour(
    preferences?.notificationQuietHoursEndHour,
    defaultNotificationPreferenceFields.notificationQuietHoursEndHour,
  );
}

export function isNotificationCategoryEnabled(
  preferences: NotificationPreferenceSnapshot | undefined,
  category: NotificationCategory,
) {
  return normalizeNotificationCategorySettings(preferences?.notificationCategories)[
    category
  ];
}

export function isQuietHoursActive(
  preferences?: NotificationPreferenceSnapshot,
  at = new Date(),
) {
  if (!preferences?.notificationQuietHoursEnabled) return false;
  const startHour = getQuietHoursStartHour(preferences);
  const endHour = getQuietHoursEndHour(preferences);
  const nowMinutes = at.getHours() * 60 + at.getMinutes();
  const startMinutes = startHour * 60;
  const endMinutes = endHour * 60;

  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

export type NotificationDeliveryState = "allowed" | "muted" | "quiet-hours";

export function getNotificationDeliveryState(
  preferences: NotificationPreferenceSnapshot | undefined,
  category: NotificationCategory,
  at = new Date(),
  options?: { bypassQuietHours?: boolean },
): NotificationDeliveryState {
  if (!preferences?.notifications) return "muted";
  if (!isNotificationCategoryEnabled(preferences, category)) return "muted";
  if (!options?.bypassQuietHours && isQuietHoursActive(preferences, at)) {
    return "quiet-hours";
  }
  return "allowed";
}

export function formatNotificationDelayLabel(minutes: number) {
  return minutes <= 0 ? "Immediate" : `${minutes} min`;
}

export function formatNotificationRepeatLabel(minutes: number) {
  return minutes <= 0 ? "Off" : `${minutes} min`;
}

export function formatHourLabel(hour: number) {
  const normalized = clampHour(hour, 0);
  const suffix = normalized >= 12 ? "PM" : "AM";
  const displayHour = normalized % 12 || 12;
  return `${displayHour}:00 ${suffix}`;
}

export function formatQuietHoursSummary(
  preferences?: NotificationPreferenceSnapshot,
) {
  if (!preferences?.notificationQuietHoursEnabled) return "Quiet hours off";
  return `${formatHourLabel(getQuietHoursStartHour(preferences))} to ${formatHourLabel(
    getQuietHoursEndHour(preferences),
  )}`;
}
