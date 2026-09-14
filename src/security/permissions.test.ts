import type { Device, HouseholdMember } from "../store/useHomeStore";
import { authorizeDeviceCommand, canAdministerMember, roleHasPermission } from "./permissions";

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
  test("delegated member management cannot change self or peer administrator authority", () => {
    const admin = { id: "admin-a", role: "Admin" } as const;
    expect(canAdministerMember(admin, admin)).toBe(false);
    expect(canAdministerMember(admin, { id: "admin-b", role: "Admin" })).toBe(false);
    expect(canAdministerMember(admin, { id: "owner", role: "Owner" })).toBe(false);
    expect(canAdministerMember(admin, { id: "member", role: "Member" })).toBe(true);
    expect(canAdministerMember({ id: "owner", role: "Owner" }, admin)).toBe(true);
    expect(canAdministerMember(undefined, admin)).toBe(false);
  });
  test.each(["door", "gate", "garage"] as const)(
    "%s opening controls require the same sensitive permission",
    (kind) => {
      for (const changes of [{ isOn: true }, { autoOpenEnabled: true }]) {
        expect(authorizeDeviceCommand(context("Tenant"), {
          op: "set-properties", deviceId: garage.id, changes,
        }, { ...garage, kind })).toMatchObject({
          allowed: false, permission: kind === "door" ? "lock.unlock" : "garage.open",
        });
      }
      expect(authorizeDeviceCommand(context("Tenant"), {
        op: "set-properties", deviceId: garage.id, changes: { openPercent: 0, isOn: false },
      }, { ...garage, kind }).allowed).toBe(true);
    },
  );
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

  test("an explicit grant takes priority over the role default", () => {
    expect(
      roleHasPermission("Guest", "camera.live", [
        { permission: "camera.live", allowed: true },
      ]),
    ).toBe(true);
  });

  test("an explicit denial takes priority over the role default", () => {
    expect(
      roleHasPermission("Member", "camera.live", [
        { permission: "camera.live", allowed: false },
      ]),
    ).toBe(false);
  });

  test("owner access cannot be overridden", () => {
    expect(
      roleHasPermission("Owner", "lock.unlock", [
        { permission: "lock.unlock", allowed: false },
      ]),
    ).toBe(true);
  });

  test("a command denial is enforced for an otherwise authorized role", () => {
    expect(
      authorizeDeviceCommand(
        {
          ...context("Admin"),
          permissionOverrides: [
            { permission: "garage.open", allowed: false },
          ],
        },
        {
          op: "set-properties",
          deviceId: garage.id,
          changes: { openPercent: 100 },
        },
        garage,
      ),
    ).toMatchObject({ allowed: false, permission: "garage.open" });
  });
});
