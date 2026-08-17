import type { Device, HouseholdMember } from "../store/useHomeStore";
import { authorizeDeviceCommand, roleHasPermission } from "./permissions";

const garage: Device = {
  id: "garage-1",
  name: "Garage",
  kind: "garage",
  roomId: "r1",
  isOn: false,
};

const context = (role: HouseholdMember["role"], roomIds = ["r1"]) => ({
  role,
  fullHomeAccess: role === "Owner" || role === "Admin" || role === "Member",
  accessibleRoomIds: new Set(roomIds),
});

describe("action-level permissions", () => {
  test("does not grant sensitive controls to a tenant with room access", () => {
    expect(
      authorizeDeviceCommand(
        context("Tenant"),
        {
          op: "set-properties",
          deviceId: garage.id,
          changes: { openPercent: 100, isOn: true },
        },
        garage,
      ),
    ).toEqual({
      allowed: false,
      reason: "action_permission_denied",
      permission: "garage.open",
    });
  });

  test("allows an owner to open the garage", () => {
    expect(
      authorizeDeviceCommand(
        context("Owner"),
        {
          op: "set-properties",
          deviceId: garage.id,
          changes: { openPercent: 100, isOn: true },
        },
        garage,
      ).allowed,
    ).toBe(true);
  });

  test("room access never implies member administration", () => {
    expect(roleHasPermission("Tenant", "member.invite")).toBe(false);
  });

  test("camera access is explicit rather than implied by room visibility", () => {
    expect(roleHasPermission("Guest", "camera.live")).toBe(false);
    expect(roleHasPermission("Member", "camera.live")).toBe(true);
  });
});
