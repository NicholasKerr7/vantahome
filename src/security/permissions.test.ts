import type { Device, HouseholdMember } from "../store/useHomeStore";
import { authorizeDeviceCommand, canAdministerMember, permissionForCommand, roleHasPermission } from "./permissions";
import type { DeviceCommand } from "../services/deviceClient";

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

const interiorDoor: Device = {
  id: "virtual-room-door", name: "Bedroom door", kind: "door", roomId: "r1", isOn: false,
  simulationOnly: true, modelDeviceId: "bedroom-1-door",
};
const openingCommands: DeviceCommand[] = [
  { op: "toggle", deviceId: interiorDoor.id, on: true },
  { op: "set-properties", deviceId: interiorDoor.id, changes: { openPercent: 100 } },
  { op: "set-properties", deviceId: interiorDoor.id, changes: { isOn: true } },
  { op: "set-properties", deviceId: interiorDoor.id, changes: { autoOpenEnabled: true } },
];

describe("action-level permissions", () => {
  test.each(["Owner", "Admin", "Member", "Tenant"] as const)("%s can operate an assigned, authored interior simulation door", (role) => {
    for (const command of openingCommands) {
      expect(authorizeDeviceCommand(context(role), command, interiorDoor)).toEqual({ allowed: true, permission: "device.control" });
    }
  });

  test("interior door access still requires room access and ordinary control permission", () => {
    const command = openingCommands[0];
    expect(authorizeDeviceCommand(context("Tenant", ["other-room"]), command, interiorDoor))
      .toEqual({ allowed: false, reason: "room_access_denied" });
    expect(authorizeDeviceCommand(context("Guest"), command, interiorDoor))
      .toEqual({ allowed: false, reason: "action_permission_denied", permission: "device.control" });
    expect(authorizeDeviceCommand({ ...context("Guest"), permissionOverrides: [{ permission: "device.control", allowed: true }] }, command, interiorDoor))
      .toEqual({ allowed: true, permission: "device.control" });
    expect(authorizeDeviceCommand({ ...context("Member"), permissionOverrides: [{ permission: "device.control", allowed: false }] }, command, interiorDoor))
      .toEqual({ allowed: false, reason: "action_permission_denied", permission: "device.control" });
  });

  test.each([
    { simulationOnly: false }, { simulationOnly: undefined }, { modelDeviceId: undefined },
    { modelDeviceId: "entry-door" }, { modelDeviceId: "laundry-exterior-door" },
    { modelDeviceId: "placed-bedroom-1-door" }, { modelDeviceId: "unregistered-door" },
  ])("names or untrusted interior bindings cannot downgrade an entry permission %#", (change) => {
    const device = { ...interiorDoor, ...change };
    for (const command of openingCommands) {
      expect(permissionForCommand(command, device)).toBe("lock.unlock");
      expect(authorizeDeviceCommand(context("Tenant"), command, device).allowed).toBe(false);
    }
  });

  test.each(["gate", "garage"] as const)("an interior model ID cannot downgrade a %s", (kind) => {
    for (const command of openingCommands) expect(permissionForCommand(command, { ...interiorDoor, kind })).toBe("garage.open");
  });

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
