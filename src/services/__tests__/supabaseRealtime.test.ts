import { startSupabaseDeviceRealtime } from "../supabaseRealtime";
import { deviceClient } from "../deviceClient";
import { supabase } from "../supabaseClient";
import { useHomeStore } from "../../store/useHomeStore";
import { CommandTransportRejectedError } from "../commandTransport";
import type { SecuredDeviceCommand } from "../deviceClient";

jest.mock("../../config/runtimeMode", () => ({ runtimePolicy: { allowMockTelemetry: false } }));
jest.mock("../deviceClient", () => ({ deviceClient: {
  pushState: jest.fn(), setCommandTransport: jest.fn(() => jest.fn()),
} }));
jest.mock("../../store/useHomeStore", () => ({
  useHomeStore: { getState: jest.fn() },
  selectVisibleDevices: (state: { devices: unknown[] }) => state.devices,
}));
jest.mock("../supabaseClient", () => ({ supabase: {
  channel: jest.fn(), from: jest.fn(), removeChannel: jest.fn(),
  auth: { getSession: jest.fn() }, functions: { invoke: jest.fn() },
} }));

const client = supabase!;
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

/** Hold a mocked request open to exercise policy changes across its await. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const command: SecuredDeviceCommand = {
  commandId: "command-a", deviceId: "device-a", op: "toggle", on: true,
  nonce: "nonce-a", idempotencyKey: "request-a", createdAt: 1000, expiresAt: 11000,
};
const sessionResponse = {
  data: { session: { user: { id: "user-a" }, access_token: "test-access" } },
  error: null,
};
const acceptedResponse = {
  data: { command: { command_id: command.commandId, status: "created" } },
  error: null,
};

/** Call the installed transport through its real typed command contract. */
function sendCommand() {
  const transport = jest.mocked(deviceClient.setCommandTransport).mock.calls[0]?.[0];
  if (!transport) throw new Error("Expected an installed command transport.");
  return Promise.resolve(transport(command, null));
}

describe("authoritative device realtime", () => {
  let state: { authenticatedUserId: string; activeHomeId: string; membershipReady: boolean; devices: { id: string }[] };
  let handlers: { event: string; callback: (value: any) => void }[];
  let onStatus: (status: string) => void;
  let query: Record<string, jest.Mock>;
  let stop: (() => void) | null;

  beforeEach(() => {
    jest.clearAllMocks();
    state = { authenticatedUserId: "user-a", activeHomeId: "home-a", membershipReady: true, devices: [{ id: "device-a" }] };
    (useHomeStore.getState as jest.Mock).mockImplementation(() => state);
    handlers = [];
    const channel: { on: jest.Mock; subscribe: jest.Mock } = {
      on: jest.fn((type, filter, callback) => {
        expect(type).toBe("postgres_changes");
        expect(filter.table).toBe("device_state");
        handlers.push({ event: filter.event, callback });
        return channel;
      }),
      subscribe: jest.fn((callback) => { onStatus = callback; return channel; }),
    };
    (client.channel as jest.Mock).mockReturnValue(channel);
    query = { select: jest.fn(), eq: jest.fn(), abortSignal: jest.fn(), maybeSingle: jest.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.abortSignal.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: {
      device_id: "device-a", state: { isOn: false }, updated_at: new Date().toISOString(),
    }, error: null });
    (client.from as jest.Mock).mockReturnValue(query);
    (client.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: "user-a" }, access_token: "test-access" } }, error: null });
    (client.functions.invoke as jest.Mock).mockImplementation(async (_name, options) => ({
      data: { command: { command_id: options.body.commandId, status: "created" } }, error: null,
    }));
    stop = null;
  });
  afterEach(() => stop?.());
  const start = () => { stop = startSupabaseDeviceRealtime({ userId: "user-a", homeId: "home-a" }); };
  const notify = (deviceId = "device-a") => handlers[0].callback({ new: { device_id: deviceId, state: { isOn: true } } });

  test("requires a current verified account and household", () => {
    expect(startSupabaseDeviceRealtime()).toBeNull();
    state.membershipReady = false;
    start();
    expect(stop).toBeNull();
    expect(client.channel).not.toHaveBeenCalled();
  });
  test("accepts only fresh RLS-protected observations, not event state", async () => {
    start(); notify(); await tick();
    expect(handlers.map(({ event }) => event)).toEqual(["INSERT", "UPDATE"]);
    expect(query.eq).toHaveBeenCalledWith("devices.home_id", "home-a");
    expect(deviceClient.pushState).toHaveBeenCalledWith("device-a", { isOn: false, observedAt: expect.any(Number) });
  });
  test("ignores foreign or no-longer-visible devices", async () => {
    start(); notify("device-b"); state.devices = []; notify(); await tick();
    expect(client.from).not.toHaveBeenCalled();
    expect(deviceClient.pushState).not.toHaveBeenCalled();
  });
  test("denied reads never become state", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    start(); notify(); await tick();
    expect(deviceClient.pushState).not.toHaveBeenCalled();
  });
  test("discards late responses after account change or cleanup", async () => {
    let resolve!: (value: unknown) => void;
    query.maybeSingle.mockReturnValue(new Promise((done) => { resolve = done; }));
    start(); notify();
    state.authenticatedUserId = "user-b";
    stop?.();
    resolve({ data: { device_id: "device-a", state: { isOn: true }, updated_at: new Date().toISOString() }, error: null });
    await tick();
    expect(query.abortSignal.mock.calls[0][0].aborted).toBe(true);
    expect(deviceClient.pushState).not.toHaveBeenCalled();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    stop = null;
  });
  test("refreshes visible observations after reconnect", async () => {
    start(); onStatus("SUBSCRIBED"); await tick();
    expect(deviceClient.pushState).toHaveBeenCalledWith("device-a", { isOn: false, observedAt: expect.any(Number) });
  });
  test("coalesces notifications without dropping the latest observation", async () => {
    start(); notify(); notify(); notify(); await tick();
    expect(query.maybeSingle).toHaveBeenCalledTimes(2);
  });
  test("sends authenticated commands without fabricating confirmation", async () => {
    start();
    const transport = (deviceClient.setCommandTransport as jest.Mock).mock.calls[0][0];
    await transport({ commandId: "command-a", deviceId: "device-a", op: "toggle", on: true });
    expect(client.functions.invoke).toHaveBeenCalledWith("device-command", expect.objectContaining({
      headers: { Authorization: "Bearer test-access" }, signal: expect.anything(),
    }));
    expect(deviceClient.pushState).not.toHaveBeenCalled();
    state.authenticatedUserId = "user-b";
    await expect(transport({ deviceId: "device-a" })).rejects.toThrow("session");
    expect(client.functions.invoke).toHaveBeenCalledTimes(1);
  });

  test.each([
    [400, "invalid_command"],
    [401, "permission_denied"],
    [403, "permission_denied"],
    [409, "transport_rejected"],
  ])("HTTP %i is a permanent, privacy-safe refusal", async (status, reason) => {
    const readBody = jest.fn(() => { throw new Error("Response bodies must stay private."); });
    (client.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "private-server-detail", context: { status, text: readBody, json: readBody } },
    });
    start();
    const request = sendCommand();
    await expect(request).rejects.toBeInstanceOf(CommandTransportRejectedError);
    await expect(request).rejects.toMatchObject({ reason, message: "Device command was not accepted." });
    expect(readBody).not.toHaveBeenCalled();
    expect(deviceClient.pushState).not.toHaveBeenCalled();
  });

  test.each([429, 500, 502, 503])("HTTP %i remains eligible for bounded client retries", async (status) => {
    (client.functions.invoke as jest.Mock).mockResolvedValue({
      data: null, error: { message: "private-server-detail", context: { status } },
    });
    start();
    const request = sendCommand();
    await expect(request).rejects.not.toBeInstanceOf(CommandTransportRejectedError);
    await expect(request).rejects.toThrow("Device command temporarily unavailable.");
    expect(deviceClient.pushState).not.toHaveBeenCalled();
  });

  test.each([
    ["missing response", null],
    ["missing command", {}],
    ["missing command identifier", { command: { status: "created" } }],
    ["another command identifier", { command: { command_id: "other-command", status: "created" } }],
    ["missing acceptance status", { command: { command_id: "command-a" } }],
    ["unrecognized acceptance status", { command: { command_id: "command-a", status: "confirmed" } }],
  ])("rejects an acknowledgement with %s", async (_label, data) => {
    (client.functions.invoke as jest.Mock).mockResolvedValue({ data, error: null });
    start();
    await expect(sendCommand()).rejects.toMatchObject({
      name: "CommandTransportRejectedError", reason: "invalid_response",
    });
    expect(deviceClient.pushState).not.toHaveBeenCalled();
  });

  test("does not dispatch when visibility is revoked during session lookup", async () => {
    const pending = deferred<typeof sessionResponse>();
    (client.auth.getSession as jest.Mock).mockReturnValue(pending.promise);
    start();
    const request = sendCommand();
    state.devices = [];
    pending.resolve(sessionResponse);
    await expect(request).rejects.toMatchObject({ reason: "permission_denied" });
    expect(client.functions.invoke).not.toHaveBeenCalled();
    expect(deviceClient.pushState).not.toHaveBeenCalled();
  });

  test("discards acceptance when visibility is revoked during invocation", async () => {
    const pending = deferred<typeof acceptedResponse>();
    (client.functions.invoke as jest.Mock).mockReturnValue(pending.promise);
    start();
    const request = sendCommand();
    await tick();
    expect(client.functions.invoke).toHaveBeenCalledTimes(1);
    state.devices = [];
    pending.resolve(acceptedResponse);
    await expect(request).rejects.toMatchObject({ reason: "permission_denied" });
    expect(deviceClient.pushState).not.toHaveBeenCalled();
  });

  test.each(["account change", "cleanup"])("ignores a late command acknowledgement after %s", async (change) => {
    const pending = deferred<typeof acceptedResponse>();
    (client.functions.invoke as jest.Mock).mockReturnValue(pending.promise);
    start();
    const request = sendCommand();
    await tick();
    expect(client.functions.invoke).toHaveBeenCalledTimes(1);
    if (change === "account change") state.authenticatedUserId = "user-b";
    else {
      stop?.();
      stop = null;
      expect(client.functions.invoke).toHaveBeenCalledWith("device-command", expect.objectContaining({
        signal: expect.objectContaining({ aborted: true }),
      }));
      expect(client.removeChannel).toHaveBeenCalledTimes(1);
    }
    pending.resolve(acceptedResponse);
    await expect(request).rejects.toMatchObject({ reason: "session_changed" });
    expect(deviceClient.pushState).not.toHaveBeenCalled();
  });

  test.each([null, { user: { id: "user-b" }, access_token: "other-test-access" }])(
    "refuses a missing or mismatched authenticated session before invocation",
    async (session) => {
      (client.auth.getSession as jest.Mock).mockResolvedValue({ data: { session }, error: null });
      start();
      await expect(sendCommand()).rejects.toMatchObject({ reason: "session_changed" });
      expect(client.functions.invoke).not.toHaveBeenCalled();
    },
  );

  test("session lookup outages remain temporary without exposing their details", async () => {
    (client.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null }, error: new Error("private-session-detail"),
    });
    start();
    const request = sendCommand();
    await expect(request).rejects.not.toBeInstanceOf(CommandTransportRejectedError);
    await expect(request).rejects.toThrow("Device session temporarily unavailable.");
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });
});
