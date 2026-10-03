import type { DeviceCommand } from "../services/deviceClient";
import { useHomeStore } from "../store/useHomeStore";
import { authorizeDeviceCommand } from "./permissions";
import { hasCurrentMembershipAccess } from "./guestAccess";

/** Authorize physical command dispatch independently of the isolated 3D simulation. */
export function authorizeLocalDeviceCommand(command: DeviceCommand) {
  const state = useHomeStore.getState();
  if (state.accountUserId && !state.membershipReady) {
    return { allowed: false, reason: "member_not_found" } as const;
  }
  const device = state.devices.find(
    (candidate) => candidate.id === command.deviceId,
  );
  if (!device) return { allowed: false, reason: "device_not_found" } as const;
  // Virtual catalog entries and gas controls stay in the isolated simulation.
  // Reject before command confirmation, optimistic events, retries or transports.
  if (device.simulationOnly || device.kind === "gas-meter" || device.kind === "gas-leak") {
    return { allowed: false, reason: "simulation_only_device" } as const;
  }

  const member = state.household.find(
    (candidate) => candidate.id === state.activeMemberId,
  );
  if (!member || !hasCurrentMembershipAccess(member)) return { allowed: false, reason: "member_not_found" } as const;

  const fullHomeAccess = ["Owner", "Admin", "Member"].includes(member.role);
  const roomMembership = state.roomMembers.find(
    (entry) => entry.memberId === member.id,
  );
  const permissionOverrides = state.memberPermissionOverrides.filter(
    (entry) => entry.memberId === member.id,
  );
  return authorizeDeviceCommand(
    {
      role: member.role,
      fullHomeAccess,
      accessibleRoomIds: new Set(roomMembership?.roomIds ?? []),
      permissionOverrides,
    },
    command,
    device,
  );
}
