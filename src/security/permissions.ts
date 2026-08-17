import type { Device, HouseholdMember } from "../store/useHomeStore";
import type { DeviceCommand } from "../services/deviceClient";

export const ACTION_PERMISSIONS = [
  "device.view",
  "device.control",
  "appliance.control",
  "stove.control",
  "safety.control",
  "light.control",
  "climate.control",
  "camera.live",
  "camera.history",
  "camera.manage",
  "lock.unlock",
  "garage.open",
  "alarm.arm",
  "alarm.disarm",
  "automation.manage",
  "member.invite",
] as const;

export type ActionPermission = (typeof ACTION_PERMISSIONS)[number];
export type HouseholdRole = HouseholdMember["role"];
export type PermissionOverride = {
  permission: ActionPermission;
  allowed: boolean;
};

const ROLE_PERMISSIONS: Record<HouseholdRole, ReadonlySet<ActionPermission>> = {
  Owner: new Set(ACTION_PERMISSIONS),
  Admin: new Set(ACTION_PERMISSIONS),
  Member: new Set([
    "device.view",
    "device.control",
    "appliance.control",
    "light.control",
    "climate.control",
    "camera.live",
    "camera.history",
    "automation.manage",
  ]),
  Guest: new Set(["device.view", "light.control", "climate.control"]),
  Tenant: new Set([
    "device.view",
    "device.control",
    "light.control",
    "climate.control",
  ]),
};

export function roleHasPermission(
  role: HouseholdRole,
  permission: ActionPermission,
  overrides: readonly PermissionOverride[] = [],
) {
  // The canonical owner cannot be locked out through delegated settings.
  if (role === "Owner") return true;
  const override = overrides.find((item) => item.permission === permission);
  if (override) return override.allowed;
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionForCommand(
  command: DeviceCommand,
  device: Device,
): ActionPermission {
  if (device.kind === "light") return "light.control";
  if (device.kind === "ac") return "climate.control";

  if (device.kind === "door") {
    if (command.op === "toggle") return "lock.unlock";
    if (
      command.op === "set-properties" &&
      typeof command.changes.openPercent === "number" &&
      command.changes.openPercent > 0
    ) {
      return "lock.unlock";
    }
  }

  if (device.kind === "garage" || device.kind === "gate") {
    if (command.op === "toggle") return "garage.open";
    if (
      command.op === "set-properties" &&
      typeof command.changes.openPercent === "number" &&
      command.changes.openPercent > 0
    ) {
      return "garage.open";
    }
  }

  if (device.kind === "camera") return "camera.manage";
  if (device.kind === "stove" || device.kind === "microwave") {
    return "stove.control";
  }
  if (device.kind === "smoke" || device.kind === "water") {
    return "safety.control";
  }
  if (
    [
      "coffee",
      "fridge",
      "washer",
      "dryer",
      "dishwasher",
      "water-heater",
      "sprinkler",
    ].includes(device.kind)
  ) {
    return "appliance.control";
  }
  return "device.control";
}

export type CommandAuthorizationContext = {
  role: HouseholdRole;
  accessibleRoomIds: ReadonlySet<string>;
  fullHomeAccess: boolean;
  permissionOverrides?: readonly PermissionOverride[];
};

export function authorizeDeviceCommand(
  context: CommandAuthorizationContext,
  command: DeviceCommand,
  device: Device,
) {
  if (!context.fullHomeAccess && !context.accessibleRoomIds.has(device.roomId)) {
    return { allowed: false, reason: "room_access_denied" } as const;
  }
  const permission = permissionForCommand(command, device);
  if (
    !roleHasPermission(
      context.role,
      permission,
      context.permissionOverrides,
    )
  ) {
    return { allowed: false, reason: "action_permission_denied", permission } as const;
  }
  return { allowed: true, permission } as const;
}
