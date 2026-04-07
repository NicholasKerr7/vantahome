import type { Device } from "../store/useHomeStore";

export type SecurityAuditIssue = {
  deviceId: string;
  deviceName: string;
  detail: string;
  priority: number;
};

const ENTRY_KINDS = new Set<Device["kind"]>([
  "door",
  "window",
  "garage",
  "gate",
]);

export function collectAwaySecurityIssues(
  devices: Device[],
): SecurityAuditIssue[] {
  return devices
    .flatMap((device) => {
      const openPercent = Math.round(device.openPercent ?? 0);

      if (ENTRY_KINDS.has(device.kind) && openPercent > 0) {
        return [
          {
            deviceId: device.id,
            deviceName: device.name,
            detail: `${openPercent}% open`,
            priority: 0,
          },
        ];
      }

      if (device.kind === "camera") {
        if (!device.isOn) {
          return [
            {
              deviceId: device.id,
              deviceName: device.name,
              detail: "offline",
              priority: 1,
            },
          ];
        }
        if (device.armed === false) {
          return [
            {
              deviceId: device.id,
              deviceName: device.name,
              detail: "disarmed",
              priority: 1,
            },
          ];
        }
      }

      return [];
    })
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.deviceName.localeCompare(right.deviceName);
    });
}

export function formatAwaySecuritySummary(
  issues: SecurityAuditIssue[],
  maxVisible = 3,
): string {
  if (!issues.length) return "All monitored entry points are secure.";

  const visible = issues
    .slice(0, Math.max(1, maxVisible))
    .map((issue) => `${issue.deviceName} ${issue.detail}`);
  const extraCount = issues.length - visible.length;
  const summary = visible.join(", ");

  if (extraCount > 0) {
    return `${summary}, +${extraCount} more.`;
  }
  return `${summary}.`;
}
