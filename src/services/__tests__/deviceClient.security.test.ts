import {
  CommandAuthorizationError,
  CommandExpiredError,
  deviceClient,
  type SecuredDeviceCommand,
} from "../deviceClient";
import { useHomeStore } from "../../store/useHomeStore";

describe("device command security", () => {
  afterEach(() => {
    useHomeStore.getState().setActiveMember("m1");
    useHomeStore.getState().setRoomMembership("m4", ["r2"]);
    useHomeStore.setState({ memberPermissionOverrides: [] });
  });

  test("adds expiry, nonce, and idempotency metadata before transport", async () => {
    let transported: SecuredDeviceCommand | undefined;
    const clear = deviceClient.setCommandTransport((command) => {
      transported = command;
    });

    try {
      const result = await deviceClient.sendCommand({
        op: "toggle",
        deviceId: "d2",
        on: false,
      });
      expect(result.queued).toBe(false);
      expect(transported).toEqual(
        expect.objectContaining({
          commandId: result.commandId,
          nonce: expect.any(String),
          idempotencyKey: result.commandId,
          createdAt: expect.any(Number),
          expiresAt: expect.any(Number),
        }),
      );
      expect(transported!.expiresAt - transported!.createdAt).toBeLessThanOrEqual(
        60_000,
      );
    } finally {
      clear();
    }
  });

  test("rejects expired commands before transport", async () => {
    const now = Date.now();
    await expect(
      deviceClient.sendCommand({
        op: "toggle",
        deviceId: "d2",
        createdAt: now - 20_000,
        expiresAt: now - 1,
      }),
    ).rejects.toBeInstanceOf(CommandExpiredError);
  });

  test("rejects immutable fields at the command boundary", async () => {
    await expect(
      deviceClient.sendCommand({
        op: "set-properties",
        deviceId: "d2",
        changes: { roomId: "r6" } as never,
      }),
    ).rejects.toBeInstanceOf(CommandAuthorizationError);
  });

  test("room access does not let a tenant open a gate", async () => {
    useHomeStore.getState().setRoomMembership("m4", ["r1", "r2"]);
    useHomeStore.getState().setActiveMember("m4");
    await expect(
      deviceClient.sendCommand({
        op: "set-properties",
        deviceId: "d26",
        changes: { openPercent: 100, isOn: true },
      }),
    ).rejects.toMatchObject({ reason: "action_permission_denied" });
  });

  test("an explicit denial blocks a normally authorized owner delegate", async () => {
    useHomeStore.getState().setActiveMember("m2");
    useHomeStore.getState().setMemberPermissionOverride(
      "m2",
      "garage.open",
      false,
    );
    await expect(
      deviceClient.sendCommand({
        op: "set-properties",
        deviceId: "d26",
        changes: { openPercent: 100, isOn: true },
      }),
    ).rejects.toMatchObject({ reason: "action_permission_denied" });
  });
});
