import { deviceClient, type DeviceCommand, type SecuredDeviceCommand } from "../deviceClient";
import { CommandTransportRejectedError } from "../commandTransport";
import { authorizeLocalDeviceCommand } from "../../security/localCommandAuthorization";
import { confirmSensitiveAction } from "../../security/biometricConfirmation";
import { runtimePolicy } from "../../config/runtimeMode";
import { logDeviceAuditEvent } from "../cloudRegistry";

jest.mock("../../security/localCommandAuthorization", () => ({ authorizeLocalDeviceCommand: jest.fn() }));
jest.mock("../../security/biometricConfirmation", () => ({ confirmSensitiveAction: jest.fn() }));
jest.mock("../../config/runtimeMode", () => ({
  runtimePolicy: { allowMockTelemetry: false }, isAllowedDirectWebSocketUrl: () => true,
}));
jest.mock("../cloudRegistry", () => ({ logDeviceAuditEvent: jest.fn(async () => undefined) }));

const authorize = jest.mocked(authorizeLocalDeviceCommand);
const confirm = jest.mocked(confirmSensitiveAction);
// Only this test's mocked policy is mutable; production policy stays readonly.
const testPolicy = runtimePolicy as { allowMockTelemetry: boolean };

/** Create synthetic intent; no test connects to an API, hub or physical light. */
function command(commandId = "command-a", extra: Partial<DeviceCommand> = {}): DeviceCommand {
  return { op: "toggle", deviceId: "light-a", on: true, commandId, ...extra } as DeviceCommand;
}

/** Let the bounded delivery and its caller settle without advancing deadlines. */
async function tick() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

/** Controlled responses exercise late completion and out-of-order delivery. */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

describe("session-scoped command progress", () => {
  const unsubscribe: Array<() => void> = [];
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(1_800_000_000_000);
    jest.clearAllMocks();
    deviceClient.resetSession();
    authorize.mockReturnValue({ allowed: true, permission: "light.control" });
    confirm.mockResolvedValue(undefined);
    testPolicy.allowMockTelemetry = false;
  });
  afterEach(() => {
    unsubscribe.splice(0).forEach((stop) => stop());
    deviceClient.resetSession();
    jest.clearAllTimers();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test("submission preserves the old return contract without state or confirmation", async () => {
    const states = jest.fn();
    unsubscribe.push(deviceClient.subscribeState(states));
    deviceClient.setCommandTransport(jest.fn());
    await expect(deviceClient.sendCommand(command())).resolves.toEqual({ commandId: "command-a", queued: false });
    expect(deviceClient.getCommandProgress("command-a")).toMatchObject({ status: "submitted", attempts: 1 });
    expect(states).not.toHaveBeenCalled();
    deviceClient.pushState("light-a", { isOn: true, observedAt: Date.now() });
    deviceClient.pushState("other-light", { isOn: true, observedAt: Date.now() - 1000 });
    expect(deviceClient.getCommandProgress("command-a")?.status).toBe("submitted");
    expect(JSON.stringify(deviceClient.getCommandHistory())).not.toMatch(/nonce|idempotency|payload|changes|confirmed/);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("expires queued work at its deadline rather than waiting for backoff", async () => {
    const transport = jest.fn(async () => { throw new Error("offline"); });
    deviceClient.setCommandTransport(transport);
    await expect(deviceClient.sendCommand(command(), { ttlMs: 1000 })).resolves.toMatchObject({ queued: true });
    await jest.advanceTimersByTimeAsync(800);
    expect(transport).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(200);
    expect(deviceClient.getCommandProgress("command-a")).toMatchObject({ status: "expired", attempts: 2 });
    expect(deviceClient.getRetryStatus()).toEqual({ pending: 0 });
    expect(jest.getTimerCount()).toBe(0);
  });

  test("a slow subscriber cannot retroactively expire accepted delivery", async () => {
    deviceClient.setCommandTransport(jest.fn());
    unsubscribe.push(deviceClient.subscribeCommandProgress((event) => {
      if (event.type === "updated" && event.command.status === "submitted") {
        jest.setSystemTime(event.command.expiresAt);
      }
    }));
    await expect(deviceClient.sendCommand(command())).resolves.toEqual({ commandId: "command-a", queued: false });
    expect(deviceClient.getCommandProgress("command-a")?.status).toBe("submitted");
  });

  test("reports exhaustion after exactly three retries without retaining errors", async () => {
    const transport = jest.fn(async () => { throw new Error("private network response"); });
    deviceClient.setCommandTransport(transport);
    await deviceClient.sendCommand(command());
    await jest.advanceTimersByTimeAsync(5600);
    expect(transport).toHaveBeenCalledTimes(4);
    expect(deviceClient.getCommandProgress("command-a")).toMatchObject({ status: "failed", attempts: 4, reason: "retry_exhausted" });
    expect(JSON.stringify(deviceClient.getCommandHistory())).not.toContain("private");
    expect(deviceClient.getRetryStatus()).toEqual({ pending: 0 });
    await jest.advanceTimersByTimeAsync(20_000);
    expect(transport).toHaveBeenCalledTimes(4);
  });

  test("a successful retry becomes submitted, never physically confirmed", async () => {
    const transport = jest.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    deviceClient.setCommandTransport(transport);
    await deviceClient.sendCommand(command());
    await jest.advanceTimersByTimeAsync(800);
    expect(deviceClient.getCommandProgress("command-a")).toMatchObject({ status: "submitted", attempts: 2 });
    expect(deviceClient.getRetryStatus()).toEqual({ pending: 0 });
    expect(jest.getTimerCount()).toBe(0);
  });

  test("a permanent transport rejection is not retried", async () => {
    const transport = jest.fn(async () => { throw new CommandTransportRejectedError("permission_denied"); });
    deviceClient.setCommandTransport(transport);
    await expect(deviceClient.sendCommand(command())).rejects.toMatchObject({ status: "rejected", reason: "permission_denied" });
    expect(deviceClient.getCommandProgress("command-a")).toMatchObject({ status: "rejected", attempts: 1 });
    await jest.advanceTimersByTimeAsync(20_000);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test("times out a hanging request and ignores a late success", async () => {
    const response = deferred();
    const transport = jest.fn(() => response.promise);
    deviceClient.setCommandTransport(transport);
    const sending = deviceClient.sendCommand(command(), { ttlMs: 1000 });
    const rejected = expect(sending).rejects.toMatchObject({ status: "timed_out", reason: "transport_timeout" });
    await jest.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(deviceClient.getCommandProgress("command-a")?.status).toBe("timed_out");
    response.resolve(); await tick();
    expect(deviceClient.getCommandProgress("command-a")?.status).toBe("timed_out");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(deviceClient.getRetryStatus()).toEqual({ pending: 0 });
  });

  test("reset cancels a hanging wait, clears history and protects reused IDs", async () => {
    const response = deferred();
    deviceClient.setCommandTransport(() => response.promise);
    const first = deviceClient.sendCommand(command());
    const rejected = expect(first).rejects.toMatchObject({ reason: "session_changed" });
    await tick();
    deviceClient.resetSession(); await rejected;
    expect(deviceClient.getCommandHistory()).toEqual([]);
    deviceClient.setCommandTransport(() => undefined);
    await deviceClient.sendCommand(command());
    const second = deviceClient.getCommandProgress("command-a");
    response.reject(new Error("old session")); await tick();
    expect(deviceClient.getCommandProgress("command-a")).toEqual(second);
    expect(second?.status).toBe("submitted");
    expect(jest.getTimerCount()).toBe(0);
  });

  test("rejects duplicate IDs before a second patch or dispatch", async () => {
    testPolicy.allowMockTelemetry = true;
    const states = jest.fn();
    const transport = jest.fn();
    unsubscribe.push(deviceClient.subscribeState(states));
    deviceClient.setCommandTransport(transport);
    await deviceClient.sendCommand(command());
    await expect(deviceClient.sendCommand(command())).rejects.toMatchObject({ reason: "duplicate_command" });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(states).toHaveBeenCalledTimes(1);
  });

  test("rejects revoked permission after biometric confirmation", async () => {
    const approval = deferred();
    confirm.mockReturnValue(approval.promise);
    const transport = jest.fn();
    deviceClient.setCommandTransport(transport);
    const sending = deviceClient.sendCommand(command());
    const rejected = expect(sending).rejects.toMatchObject({ reason: "permission_denied" });
    authorize.mockReturnValue({ allowed: false, reason: "action_permission_denied", permission: "light.control" });
    approval.resolve(); await rejected;
    expect(deviceClient.getCommandProgress("command-a")?.status).toBe("rejected");
    expect(transport).not.toHaveBeenCalled();
  });

  test("revocation while in flight cannot fall through to another delivery", async () => {
    const response = deferred();
    const transport = jest.fn(() => response.promise);
    deviceClient.setCommandTransport(transport);
    const sending = deviceClient.sendCommand(command());
    const rejected = expect(sending).rejects.toMatchObject({ reason: "permission_denied" });
    await tick();
    authorize.mockReturnValue({ allowed: false, reason: "action_permission_denied", permission: "light.control" });
    response.resolve(); await rejected;
    expect(deviceClient.getCommandProgress("command-a")?.status).toBe("rejected");
    expect(deviceClient.getRetryStatus()).toEqual({ pending: 0 });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  test("revoked queued work is rejected without another transport attempt", async () => {
    const transport = jest.fn(async () => { throw new Error("offline"); });
    deviceClient.setCommandTransport(transport);
    await deviceClient.sendCommand(command());
    authorize.mockReturnValue({ allowed: false, reason: "action_permission_denied", permission: "light.control" });
    await jest.advanceTimersByTimeAsync(800);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(deviceClient.getCommandProgress("command-a")).toMatchObject({ status: "rejected", reason: "permission_denied" });
  });

  test.each(["pending", "sending", "queued", "retrying"] as const)("reset from a %s progress listener stops old dispatch", async (status) => {
    const transport = jest.fn(async () => { throw new Error("offline"); });
    deviceClient.setCommandTransport(transport);
    unsubscribe.push(deviceClient.subscribeCommandProgress((event) => {
      if (event.type === "updated" && event.command.status === status) deviceClient.resetSession();
    }));
    const sending = deviceClient.sendCommand(command());
    if (status === "retrying") {
      await sending;
      await jest.advanceTimersByTimeAsync(800);
    } else {
      await expect(sending).rejects.toMatchObject({ reason: "session_changed" });
    }
    expect(transport).toHaveBeenCalledTimes(status === "queued" || status === "retrying" ? 1 : 0);
    expect(deviceClient.getCommandHistory()).toEqual([]);
    expect(deviceClient.getRetryStatus()).toEqual({ pending: 0 });
  });

  test("throwing listeners, including initial snapshots, cannot strand work or session reset", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    testPolicy.allowMockTelemetry = true;
    unsubscribe.push(deviceClient.subscribeCommandProgress(() => { throw new Error("private"); }));
    unsubscribe.push(deviceClient.subscribeState(() => { throw new Error("private"); }));
    unsubscribe.push(deviceClient.subscribeCommand(() => { throw new Error("private"); }));
    unsubscribe.push(deviceClient.subscribeRetry(() => { throw new Error("private"); }));
    unsubscribe.push(deviceClient.subscribeConnection(() => { throw new Error("private"); }));
    deviceClient.setCommandTransport(jest.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined));
    await expect(deviceClient.sendCommand(command())).resolves.toMatchObject({ queued: true });
    await jest.advanceTimersByTimeAsync(800);
    expect(deviceClient.getCommandProgress("command-a")?.status).toBe("submitted");
    expect(() => deviceClient.resetSession()).not.toThrow();
    expect(deviceClient.getCommandHistory()).toEqual([]);
    expect(JSON.stringify(jest.mocked(console.warn).mock.calls)).not.toContain("private");
  });

  test("snapshots intent before confirmation and isolates legacy listener mutation", async () => {
    testPolicy.allowMockTelemetry = true;
    const approval = deferred();
    confirm.mockReturnValue(approval.promise);
    const input = command("command-a", { op: "set-properties", changes: { isOn: true } });
    const transported: SecuredDeviceCommand[] = [];
    deviceClient.setCommandTransport((value) => { transported.push(value); throw new Error("offline"); });
    unsubscribe.push(deviceClient.subscribeCommand((value) => { if (value.op === "set-properties") value.changes.isOn = false; }));
    unsubscribe.push(deviceClient.subscribeState((event) => { event.patch.isOn = false; }));
    const states = jest.fn();
    unsubscribe.push(deviceClient.subscribeState(states));
    const sending = deviceClient.sendCommand(input);
    if (input.op === "set-properties") input.changes.isOn = false;
    approval.resolve(); await sending;
    await jest.advanceTimersByTimeAsync(800);
    expect(transported).toHaveLength(2);
    for (const value of transported) expect(value).toMatchObject({ changes: { isOn: true } });
    expect(states).toHaveBeenCalledWith(expect.objectContaining({ patch: { isOn: true } }));
  });

  test("reset from the socket-opening callback cannot create an old-session connection", () => {
    const socket = jest.spyOn(globalThis, "WebSocket").mockImplementation(() => {
      throw new Error("No socket should be opened in this test.");
    });
    let connecting = 0;
    unsubscribe.push(deviceClient.subscribeConnection((event) => {
      if (event.status === "connecting" && ++connecting === 2) deviceClient.resetSession();
    }));
    deviceClient.connect("wss://example.invalid");
    expect(socket).not.toHaveBeenCalled();
    expect(deviceClient.getConnectionStatus()).toBe("disconnected");
    expect(jest.getTimerCount()).toBe(0);
  });

  test("a reentrant replacement connection opens once and survives stale cleanup", () => {
    const close = jest.fn();
    const socket = jest.spyOn(globalThis, "WebSocket").mockImplementation(() => ({ close }) as unknown as WebSocket);
    unsubscribe.push(deviceClient.subscribeConnection((event) => {
      if (event.status === "connecting" && event.url === "wss://old.example.invalid") {
        deviceClient.connect("wss://new.example.invalid");
      }
    }));
    const stopOld = deviceClient.connect("wss://old.example.invalid");
    expect(socket).toHaveBeenCalledTimes(1);
    expect(socket).toHaveBeenCalledWith("wss://new.example.invalid");
    stopOld();
    expect(close).not.toHaveBeenCalled();
    deviceClient.disconnect();
    expect(close).toHaveBeenCalledTimes(1);
  });

  test.each([null, undefined, [], { isOn: Number.NaN }].map((changes) => ({ changes })))("rejects malformed patches before admission: %j", async ({ changes }) => {
    const transport = jest.fn();
    deviceClient.setCommandTransport(transport);
    await expect(deviceClient.sendCommand({ op: "set-properties", deviceId: "light-a", changes } as DeviceCommand))
      .rejects.toMatchObject({ reason: "invalid_device_patch" });
    expect(transport).not.toHaveBeenCalled();
    expect(deviceClient.getCommandHistory()).toEqual([]);
  });

  test("new queued work expires while a different retry hangs; reconnect does not overlap sends", async () => {
    const response = deferred();
    const transport = jest.fn().mockRejectedValueOnce(new Error("offline")).mockImplementation(() => response.promise);
    deviceClient.setCommandTransport(transport);
    await deviceClient.sendCommand(command("long"));
    await jest.advanceTimersByTimeAsync(800);
    expect(transport).toHaveBeenCalledTimes(2);
    const nextTransport = jest.fn(async () => { throw new Error("offline"); });
    deviceClient.setCommandTransport(nextTransport);
    await deviceClient.sendCommand(command("short"), { ttlMs: 1000 });
    deviceClient.setCommandTransport(nextTransport);
    await jest.advanceTimersByTimeAsync(1000);
    expect(deviceClient.getCommandProgress("short")?.status).toBe("expired");
    expect(nextTransport).toHaveBeenCalledTimes(1);
    response.resolve(); await tick();
    expect(deviceClient.getCommandProgress("long")?.status).toBe("submitted");
    expect(jest.getTimerCount()).toBe(0);
  });

  test("out-of-order responses update only their own command", async () => {
    const first = deferred(); const second = deferred();
    deviceClient.setCommandTransport((value) => value.commandId === "first" ? first.promise : second.promise);
    const firstSend = deviceClient.sendCommand(command("first"));
    const secondSend = deviceClient.sendCommand(command("second"));
    await tick(); second.resolve(); await secondSend;
    expect(deviceClient.getCommandProgress("first")?.status).toBe("sending");
    first.reject(new CommandTransportRejectedError("transport_rejected"));
    await expect(firstSend).rejects.toMatchObject({ reason: "transport_rejected" });
    expect(deviceClient.getCommandProgress("first")?.status).toBe("rejected");
    expect(deviceClient.getCommandProgress("second")?.status).toBe("submitted");
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("rejects non-finite lifetime %s", async (value) => {
    const transport = jest.fn(); deviceClient.setCommandTransport(transport);
    await expect(deviceClient.sendCommand(command(), { ttlMs: value })).rejects.toThrow("expired");
    await expect(deviceClient.sendCommand(command("other", { expiresAt: value }))).rejects.toThrow("expired");
    expect(transport).not.toHaveBeenCalled();
    expect(logDeviceAuditEvent).not.toHaveBeenCalled();
    expect(deviceClient.getCommandHistory()).toEqual([]);
  });
});
