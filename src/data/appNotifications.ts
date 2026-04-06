import { theme } from "../theme/theme";

export type NotificationCategory =
  | "alert"
  | "device"
  | "scene"
  | "automation"
  | "security"
  | "info";

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  createdAt: number;
  isNew?: boolean;
  osNotificationId?: string;
};

export const CATEGORY_META: Record<
  NotificationCategory,
  {
    label: string;
    icon: string;
    accent: string;
    soft: string;
  }
> = {
  alert: {
    label: "Alerts",
    icon: "warning",
    accent: "#FFB4B4",
    soft: "rgba(255,180,180,0.18)",
  },
  device: {
    label: "Devices",
    icon: "hardware-chip",
    accent: "#9AD6FF",
    soft: "rgba(154,214,255,0.18)",
  },
  scene: {
    label: "Scenes",
    icon: "sparkles",
    accent: theme.colors.accent,
    soft: "rgba(180,107,255,0.18)",
  },
  automation: {
    label: "Automations",
    icon: "timer",
    accent: "#8DFFC9",
    soft: "rgba(141,255,201,0.18)",
  },
  security: {
    label: "Security",
    icon: "shield-checkmark",
    accent: "#FFD48A",
    soft: "rgba(255,212,138,0.18)",
  },
  info: {
    label: "Info",
    icon: "information-circle",
    accent: "#C4D4FF",
    soft: "rgba(196,212,255,0.18)",
  },
};

const now = Date.now();

export const notificationsSeed: AppNotification[] = [
  {
    id: "seed-notification-ac",
    title: "Air Conditioner",
    body: "Set to 22°C • Cool",
    createdAt: now - 2 * 60 * 1000,
    category: "device",
    isNew: true,
  },
  {
    id: "seed-notification-scene",
    title: "Scene • Movie Time",
    body: "Living room lights dimmed",
    createdAt: now - 5 * 60 * 1000,
    category: "scene",
  },
  {
    id: "seed-notification-automation",
    title: "Automation",
    body: "Night Cool scheduled for 9:00 PM",
    createdAt: now - 60 * 60 * 1000,
    category: "automation",
  },
  {
    id: "seed-notification-entry",
    title: "Entry Door",
    body: "Front door locked",
    createdAt: now - 2 * 60 * 60 * 1000,
    category: "security",
  },
];

export function formatNotificationTime(createdAt: number, nowTs = Date.now()): string {
  const deltaMs = Math.max(0, nowTs - createdAt);
  const deltaMinutes = Math.floor(deltaMs / (60 * 1000));
  if (deltaMinutes < 1) return "Just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays === 1) return "Yesterday";
  return `${deltaDays}d ago`;
}
