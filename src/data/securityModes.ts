export type SecurityMode = "home" | "away" | "night";
export type SecurityModeSource = "manual" | "presence" | "schedule";

export const SECURITY_MODE_OPTIONS: Array<{
  id: SecurityMode;
  label: string;
  description: string;
}> = [
  {
    id: "home",
    label: "Home",
    description: "Perimeter cameras stay armed while indoor cameras stay private.",
  },
  {
    id: "away",
    label: "Away",
    description: "All cameras arm, entries close, and security alerts tighten up.",
  },
  {
    id: "night",
    label: "Night",
    description: "Overnight lockdown with perimeter cameras active and instant alerts.",
  },
];

export const defaultSecurityModeFields = {
  securityMode: "home" as SecurityMode,
  securityModeSource: "manual" as SecurityModeSource,
  securityAutoSyncWithPresence: true,
} as const;

export function getSecurityModeLabel(mode?: SecurityMode) {
  return (
    SECURITY_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? "Home"
  );
}

export function getSecurityModeDescription(mode?: SecurityMode) {
  return (
    SECURITY_MODE_OPTIONS.find((option) => option.id === mode)?.description ??
    SECURITY_MODE_OPTIONS[0].description
  );
}

export function getSecurityModeNotificationSummary(mode?: SecurityMode) {
  if (mode === "away") {
    return "Away mode sends security alerts immediately and ignores quiet hours.";
  }
  if (mode === "night") {
    return "Night mode sends overnight security alerts immediately and ignores quiet hours.";
  }
  return "Home mode follows your normal security alert delay and quiet hours.";
}

export function shouldSecurityBypassQuietHours(mode?: SecurityMode) {
  return mode === "away" || mode === "night";
}

export function getSecurityNotificationDelayMinutes(
  mode: SecurityMode | undefined,
  fallbackMinutes: number,
) {
  const safeFallback = Math.max(0, Math.round(fallbackMinutes || 0));
  if (mode === "away" || mode === "night") return 0;
  return safeFallback;
}

export function getSecurityNotificationRepeatMinutes(
  mode: SecurityMode | undefined,
  fallbackMinutes: number,
) {
  const safeFallback = Math.max(0, Math.round(fallbackMinutes || 0));
  if (mode === "away" || mode === "night") {
    return safeFallback === 0 ? 10 : Math.min(safeFallback, 10);
  }
  return safeFallback;
}
