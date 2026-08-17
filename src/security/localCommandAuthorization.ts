import type { DeviceCommand } from "../services/deviceClient";
import { useHomeStore } from "../store/useHomeStore";
import { authorizeDeviceCommand } from "./permissions";

export function authorizeLocalDeviceCommand(command: DeviceCommand) {
  const state = useHomeStore.getState();
  const device = state.devices.find((candidate) => candidate.id === command.deviceId);
  if (!device) return { allowed: false, reason: "device_not_found" } as const;

  const member =
    state.household.find((candidate) => candidate.id === state.activeMemberId) ??
    state.household[0];
  if (!member) return { allowed: false, reason: "member_not_found" } as const;

  const fullHomeAccess = ["Owner", "Admin", "Member"].includes(member.role);
  const roomMembership = state.roomMembers.find(
    (entry) => entry.memberId === member.id,
  );
  return authorizeDeviceCommand(
    {
      role: member.role,
      fullHomeAccess,
      accessibleRoomIds: new Set(roomMembership?.roomIds ?? []),
    },
    command,
    device,
  );
}
