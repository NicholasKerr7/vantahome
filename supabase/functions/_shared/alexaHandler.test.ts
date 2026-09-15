import { getVoiceIdentity, getVoiceIdentityFromToken } from "./voiceHandlers";

const mockFindToken = jest.fn();
const mockGetVoiceClient = jest.fn();
const mockFetchVoiceData = jest.fn();
const mockEnqueueDeviceCommand = jest.fn();
const mockEnforceRateLimit = jest.fn();
const mockAdmin = { from: jest.fn() };

jest.mock("./supabaseAdmin.ts", () => ({ getSupabaseAdmin: () => mockAdmin }));

jest.mock("./voiceAuth.ts", () => ({
  findToken: (...args: unknown[]) => mockFindToken(...args),
  getVoiceClient: (...args: unknown[]) => mockGetVoiceClient(...args),
  isExpired: (value: string) => new Date(value).getTime() <= Date.now(),
  randomToken: () => "response-message-id",
}));
jest.mock("./voiceData.ts", () => ({
  fetchVoiceData: (...args: unknown[]) => mockFetchVoiceData(...args),
  enqueueDeviceCommand: (...args: unknown[]) => mockEnqueueDeviceCommand(...args),
}));
jest.mock("./edgeSecurity.ts", () => ({
  createEdgeRequestContext: () => ({}),
  enforceEdgeRateLimit: (...args: unknown[]) => mockEnforceRateLimit(...args),
  finalizeEdgeResponse: (_context: unknown, response: Response) => response,
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

type Handler = (request: Request) => Promise<Response>;
let handler: Handler;
const originalDeno = (globalThis as any).Deno;
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const homeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const deviceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const foreignId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const token = "a".repeat(48);
const otherToken = "b".repeat(48);
const now = Date.parse("2026-09-14T12:00:00.000Z");
const correlationToken = " opaque-correlation-token ";

function observedLightState() {
  return {
    isOn: false,
    brightness: 12,
    observations: {
      isOn: {
        timeOfSample: "2026-09-14T11:58:00.000Z",
        lastConfirmedAt: "2026-09-14T11:59:40.000Z",
      },
      brightness: {
        timeOfSample: "2026-09-14T11:57:00.000Z",
        lastConfirmedAt: "2026-09-14T11:59:50.000Z",
      },
    },
  };
}

function voiceData(state: Record<string, unknown> = observedLightState(), kind = "light") {
  return {
    devices: [{ id: deviceId, name: "Light", kind, home_id: homeId, room_id: null }],
    rooms: new Map(),
    states: new Map([[deviceId, state]]),
  };
}

function directive(namespace = "Alexa.PowerController", name = "TurnOn", payload: Record<string, unknown> = {}) {
  return {
    header: { namespace, name, payloadVersion: "3", messageId: "request-message-id", correlationToken },
    endpoint: {
      endpointId: deviceId,
      scope: { type: "BearerToken", token },
      cookie: { privateValue: "do-not-echo-cookie" },
    },
    payload,
  };
}

function request(value: unknown, authorization?: string) {
  return new Request("https://edge.example.test/alexa-smart-home", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization === undefined ? {} : { authorization }),
    },
    body: JSON.stringify({ directive: value }),
  });
}

beforeAll(() => {
  (globalThis as any).Deno = {
    env: { get: () => undefined },
    serve: (value: Handler) => { handler = value; },
  };
  require("../alexa-smart-home/index.ts");
});

afterAll(() => { (globalThis as any).Deno = originalDeno; });

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(Date, "now").mockReturnValue(now);
  mockEnforceRateLimit.mockResolvedValue({ allowed: true, remaining: 99, retryAfterSeconds: 0 });
  mockFindToken.mockResolvedValue({
    user_id: actorId,
    client_id: "alexa-test-client",
    expires_at: new Date(now + 60_000).toISOString(),
  });
  mockGetVoiceClient.mockResolvedValue({ id: "alexa-test-client", provider: "alexa" });
  mockFetchVoiceData.mockResolvedValue(voiceData());
  mockEnqueueDeviceCommand.mockResolvedValue({ command_id: "synthetic-command", status: "created" });
});

afterEach(() => { jest.restoreAllMocks(); });

describe("Alexa native authentication", () => {
  test("discovers authorized devices using only the native payload scope", async () => {
    const response = await handler(request({
      header: { namespace: "Alexa.Discovery", name: "Discover", payloadVersion: "3", messageId: "discovery-message" },
      payload: { scope: { type: "BearerToken", token } },
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.event.header.name).toBe("Discover.Response");
    expect(body.event.payload.endpoints.map((endpoint: any) => endpoint.endpointId)).toEqual([deviceId]);
    expect(mockFindToken).toHaveBeenCalledWith(token, { throwOnStorageError: true });
    expect(mockFetchVoiceData).toHaveBeenCalledWith(actorId);
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain(token);
  });

  test("accepts an endpoint scope without an HTTP bearer", async () => {
    const response = await handler(request(directive()));
    expect(response.status).toBe(200);
    expect(mockFindToken).toHaveBeenCalledWith(token, { throwOnStorageError: true });
    expect(mockEnqueueDeviceCommand).toHaveBeenCalledWith(actorId, deviceId, "alexa", { isOn: true });
  });

  test("preserves header-only callers and accepts matching credentials", async () => {
    const legacy = directive();
    delete (legacy.endpoint as any).scope;
    expect((await handler(request(legacy, `Bearer ${token}`))).status).toBe(200);
    expect((await handler(request(directive(), `Bearer ${token}`))).status).toBe(200);
    expect(mockEnqueueDeviceCommand).toHaveBeenCalledTimes(2);
  });

  test.each([
    ["conflicting header", (value: any) => value, `Bearer ${otherToken}`],
    ["malformed header", (value: any) => value, "Bearer invalid"],
    ["malformed native token with valid header", (value: any) => {
      value.endpoint.scope.token = "invalid";
      return value;
    }, `Bearer ${token}`],
    ["null native scope with valid header", (value: any) => {
      value.endpoint.scope = null;
      return value;
    }, `Bearer ${token}`],
    ["unsupported scope type", (value: any) => {
      value.endpoint.scope.type = "BearerTokenWithPartition";
      return value;
    }, undefined],
    ["wrong token location", (value: any) => {
      value.payload.scope = value.endpoint.scope;
      delete value.endpoint.scope;
      return value;
    }, `Bearer ${token}`],
    ["duplicate scope locations", (value: any) => {
      value.payload.scope = value.endpoint.scope;
      return value;
    }, undefined],
  ])("rejects %s before token storage access", async (_label, modify, authorization) => {
    const response = await handler(request(modify(directive()), authorization));
    expect(response.status).toBe(401);
    expect((await response.json()).event.payload.type).toBe("INVALID_AUTHORIZATION_CREDENTIAL");
    expect(mockFindToken).not.toHaveBeenCalled();
    expect(mockFetchVoiceData).not.toHaveBeenCalled();
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
  });

  test("does not accept discovery authentication from endpoint scope", async () => {
    const response = await handler(request(directive("Alexa.Discovery", "Discover")));
    expect(response.status).toBe(401);
    expect(mockFindToken).not.toHaveBeenCalled();
    expect(mockFetchVoiceData).not.toHaveBeenCalled();
  });

  test.each(["missing", "expired", "wrong provider"])("rejects a %s linked credential", async (failure) => {
    if (failure === "missing") mockFindToken.mockResolvedValue(null);
    if (failure === "expired") mockFindToken.mockResolvedValue({ expires_at: new Date(now - 1).toISOString() });
    if (failure === "wrong provider") mockGetVoiceClient.mockResolvedValue({ provider: "google" });
    const response = await handler(request(directive()));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.event.payload.type).toBe(failure === "expired"
      ? "EXPIRED_AUTHORIZATION_CREDENTIAL"
      : "INVALID_AUTHORIZATION_CREDENTIAL");
    expect(body.event.endpoint).toEqual({ endpointId: deviceId });
    expect(JSON.stringify(body)).not.toContain(token);
    expect(mockFetchVoiceData).not.toHaveBeenCalled();
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
    if (failure === "expired") expect(mockGetVoiceClient).toHaveBeenCalled();
  });

  test("expired credentials for another provider do not reveal their expiration", async () => {
    mockFindToken.mockResolvedValue({ client_id: "google-client", expires_at: new Date(now - 1).toISOString() });
    mockGetVoiceClient.mockResolvedValue({ provider: "google" });
    const response = await handler(request(directive()));
    expect(response.status).toBe(401);
    expect((await response.json()).event.payload.type).toBe("INVALID_AUTHORIZATION_CREDENTIAL");
    expect(mockFetchVoiceData).not.toHaveBeenCalled();
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
  });

  test.each(["token", "client"])("a %s lookup outage returns an operational error without unlinking the account", async (lookup) => {
    const actual = jest.requireActual<typeof import("./voiceAuth")>("./voiceAuth");
    mockFindToken.mockImplementation(actual.findToken);
    mockGetVoiceClient.mockImplementation(actual.getVoiceClient);
    mockAdmin.from.mockImplementation((table: string) => {
      const failed = table === (lookup === "token" ? "voice_oauth_tokens" : "voice_oauth_clients");
      const query = {
        select: jest.fn(), eq: jest.fn(),
        maybeSingle: jest.fn(async () => failed
          ? { data: null, error: { message: `private database detail ${token}` } }
          : { data: {
            user_id: actorId, client_id: "alexa-test-client",
            expires_at: new Date(now + 60_000).toISOString(),
          }, error: null }),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      return query;
    });
    const response = await handler(request(directive()));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.event.payload).toEqual({
      type: "INTERNAL_ERROR", message: "The device request could not be completed.",
    });
    expect(JSON.stringify(body)).not.toContain("AUTHORIZATION_CREDENTIAL");
    expect(JSON.stringify(body)).not.toContain("private database detail");
    expect(JSON.stringify(body)).not.toContain(token);
    expect(mockFetchVoiceData).not.toHaveBeenCalled();
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
  });

  test.each(["findToken", "getVoiceClient"] as const)("%s preserves nullable callers and distinguishes missing data from a storage outage", async (lookup) => {
    const actual = jest.requireActual<typeof import("./voiceAuth")>("./voiceAuth");
    const query = { select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mockAdmin.from.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: `private database detail ${token}` } });
    await expect(actual[lookup](token)).resolves.toBeNull();
    await expect(actual[lookup](token, { throwOnStorageError: true }))
      .rejects.toThrow("Voice authorization lookup is unavailable.");
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(actual[lookup](token, { throwOnStorageError: true })).resolves.toBeNull();
  });

  test("the extracted-token validator preserves provider checks and Google header parsing", async () => {
    mockGetVoiceClient.mockResolvedValue({ provider: "google" });
    const googleRequest = new Request("https://edge.example.test/google-smart-home", {
      headers: { authorization: `Bearer ${token}` },
    });
    await expect(getVoiceIdentity(googleRequest, "google"))
      .resolves.toEqual({ userId: actorId, clientId: "alexa-test-client" });
    await expect(getVoiceIdentityFromToken(token, "alexa")).resolves.toBeNull();
    mockFindToken.mockClear();
    await expect(getVoiceIdentityFromToken({ token }, "google")).resolves.toBeNull();
    await expect(getVoiceIdentity(new Request("https://edge.example.test", {
      headers: { authorization: `bearer ${token}` },
    }), "google")).resolves.toBeNull();
    expect(mockFindToken).not.toHaveBeenCalled();
  });
});

describe("Alexa truthful responses", () => {
  test("ReportState uses actual per-property observations without queueing or echoing credentials", async () => {
    const response = await handler(request(directive("Alexa", "ReportState")));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.event).toEqual({
      header: {
        namespace: "Alexa", name: "StateReport", messageId: "response-message-id",
        correlationToken, payloadVersion: "3",
      },
      endpoint: { endpointId: deviceId },
      payload: {},
    });
    expect(body.context.properties).toEqual([
      {
        namespace: "Alexa.PowerController", name: "powerState", value: "OFF",
        timeOfSample: "2026-09-14T11:58:00.000Z", uncertaintyInMilliseconds: 20_000,
      },
      {
        namespace: "Alexa.BrightnessController", name: "brightness", value: 12,
        timeOfSample: "2026-09-14T11:57:00.000Z", uncertaintyInMilliseconds: 10_000,
      },
    ]);
    expect(JSON.stringify(body)).not.toContain(token);
    expect(JSON.stringify(body)).not.toContain("do-not-echo-cookie");
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
  });

  test.each([
    ["missing state", {}],
    ["missing metadata", { isOn: false, brightness: 12 }],
    ["missing required property", { ...observedLightState(), brightness: undefined }],
    ["invalid observed value", { ...observedLightState(), isOn: "false" }],
    ["invalid metadata timestamp", {
      ...observedLightState(), observations: {
        ...observedLightState().observations,
        isOn: { timeOfSample: "invalid", lastConfirmedAt: "2026-09-14T11:59:40.000Z" },
      },
    }],
  ])("ReportState rejects %s instead of fabricating observations", async (_label, state) => {
    mockFetchVoiceData.mockResolvedValue(voiceData(state));
    const response = await handler(request(directive("Alexa", "ReportState")));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.event.header.name).toBe("ErrorResponse");
    expect(body.event.payload.type).toBe("INTERNAL_ERROR");
    expect(body).not.toHaveProperty("context");
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
  });

  test.each([
    ["Alexa.PowerController", "TurnOn", {}, { isOn: true }],
    ["Alexa.PowerController", "TurnOff", {}, { isOn: false }],
    ["Alexa.BrightnessController", "SetBrightness", { brightness: 65 }, { brightness: 65, isOn: true }],
  ])("%s %s preserves queued intent without claiming completed state", async (namespace, name, payload, patch) => {
    const response = await handler(request(directive(namespace, name, payload)));
    expect(response.status).toBe(200);
    expect(mockEnqueueDeviceCommand).toHaveBeenCalledWith(actorId, deviceId, "alexa", patch);
    const body = await response.json();
    expect(body.event.header.name).toBe("ErrorResponse");
    expect(body.event.header.correlationToken).toBe(correlationToken);
    expect(body.event.endpoint).toEqual({ endpointId: deviceId });
    expect(body.event.payload).toEqual({
      type: "INTERNAL_ERROR", message: "Command queued; device completion could not be confirmed.",
    });
    expect(body).not.toHaveProperty("context");
    expect(JSON.stringify(body)).not.toContain("DeferredResponse");
    expect(JSON.stringify(body)).not.toContain(token);
    expect(JSON.stringify(body)).not.toContain("do-not-echo-cookie");
  });

  test("retains thermostat command intent with the same unconfirmed response", async () => {
    mockFetchVoiceData.mockResolvedValue(voiceData({}, "ac"));
    const response = await handler(request(directive("Alexa.ThermostatController", "SetTargetTemperature", {
      targetSetpoint: { value: 21, scale: "CELSIUS" },
    })));
    expect(mockEnqueueDeviceCommand).toHaveBeenCalledWith(actorId, deviceId, "alexa", { tempC: 21 });
    const body = await response.json();
    expect(body.event.header.name).toBe("ErrorResponse");
    expect(body.event.payload.type).toBe("INTERNAL_ERROR");
    expect(body).not.toHaveProperty("context");
  });

  test.each([
    ["FAHRENHEIT", 72, 22.22222222222222, "3.1"],
    ["KELVIN", 294.15, 21, "3.2"],
  ])("converts %s to Celsius before validation and queueing", async (scale, value, expectedC, version) => {
    mockFetchVoiceData.mockResolvedValue(voiceData({}, "ac"));
    const valueDirective = directive("Alexa.ThermostatController", "SetTargetTemperature", {
      targetSetpoint: { value, scale },
    });
    valueDirective.header.payloadVersion = version;
    const response = await handler(request(valueDirective));
    expect(response.status).toBe(200);
    expect(mockEnqueueDeviceCommand).toHaveBeenCalledTimes(1);
    const [user, endpoint, source, patch] = mockEnqueueDeviceCommand.mock.calls[0];
    expect([user, endpoint, source]).toEqual([actorId, deviceId, "alexa"]);
    expect(patch.tempC).toBeCloseTo(expectedC, 8);
    expect(patch.tempC).not.toBe(35);
    expect((await response.json()).event.header.name).toBe("ErrorResponse");
  });

  test.each([
    ["missing scale", { value: 21 }, "INVALID_VALUE"],
    ["unknown scale", { value: 21, scale: "RANKINE" }, "INVALID_VALUE"],
    ["missing value", { scale: "CELSIUS" }, "INVALID_VALUE"],
    ["nonnumeric value", { value: "21", scale: "CELSIUS" }, "INVALID_VALUE"],
    ["too warm Celsius", { value: 36, scale: "CELSIUS" }, "TEMPERATURE_VALUE_OUT_OF_RANGE"],
    ["too cold Fahrenheit", { value: 32, scale: "FAHRENHEIT" }, "TEMPERATURE_VALUE_OUT_OF_RANGE"],
    ["too warm Kelvin", { value: 320, scale: "KELVIN" }, "TEMPERATURE_VALUE_OUT_OF_RANGE"],
  ])("rejects thermostat %s without modifying the requested target", async (_label, targetSetpoint, type) => {
    mockFetchVoiceData.mockResolvedValue(voiceData({}, "ac"));
    const response = await handler(request(directive("Alexa.ThermostatController", "SetTargetTemperature", { targetSetpoint })));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.event.header.name).toBe("ErrorResponse");
    expect(body.event.payload.type).toBe(type);
    if (type === "TEMPERATURE_VALUE_OUT_OF_RANGE") {
      expect(body.event.payload.validRange).toEqual({
        minimumValue: { value: 10, scale: "CELSIUS" },
        maximumValue: { value: 35, scale: "CELSIUS" },
      });
    }
    expect(body).not.toHaveProperty("context");
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
  });

  test.each([
    ["above maximum", 101], ["below minimum", -1], ["fractional", 12.5],
    ["string", "12"], ["NaN serialized as null", Number.NaN], ["missing", undefined],
  ])("rejects %s brightness instead of clamping or coercing it", async (_label, brightness) => {
    const response = await handler(request(directive("Alexa.BrightnessController", "SetBrightness", { brightness })));
    expect(response.status).toBe(400);
    expect((await response.json()).event.payload.type).toBe("INVALID_VALUE");
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
  });

  test.each(["enqueue", "discovery"])("does not expose downstream %s errors", async (operation) => {
    const secretError = new Error(`internal database detail ${token}`);
    if (operation === "enqueue") mockEnqueueDeviceCommand.mockRejectedValue(secretError);
    else mockFetchVoiceData.mockRejectedValue(secretError);
    const response = await handler(request(directive()));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.event.payload).toEqual({ type: "INTERNAL_ERROR", message: "The device request could not be completed." });
    expect(body).not.toHaveProperty("context");
    expect(JSON.stringify(body)).not.toContain(token);
    expect(JSON.stringify(body)).not.toContain("internal database detail");
    expect(JSON.stringify(body)).not.toContain("Command queued");
  });

  test("foreign endpoints return the defined error without enqueueing", async () => {
    const value = directive();
    value.endpoint.endpointId = foreignId;
    const response = await handler(request(value));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.event.payload.type).toBe("NO_SUCH_ENDPOINT");
    expect(body.event.endpoint).toEqual({ endpointId: foreignId });
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
  });

  test("unsupported commands do not enqueue", async () => {
    const response = await handler(request(directive("Alexa.PowerController", "Unsupported")));
    expect(response.status).toBe(400);
    expect((await response.json()).event.payload.type).toBe("INVALID_DIRECTIVE");
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
  });
});

describe("Alexa bounded request handling", () => {
  test.each([
    ["unsupported version", { payloadVersion: "2" }],
    ["object correlation token", { correlationToken: { token } }],
    ["oversized correlation token", { correlationToken: "x".repeat(8193) }],
    ["invalid message ID", { messageId: "message_with_invalid_underscores" }],
    ["oversized namespace", { namespace: "A".repeat(81) }],
  ])("rejects %s before identity lookup", async (_label, header) => {
    const value = directive();
    Object.assign(value.header, header);
    const response = await handler(request(value));
    expect(response.status).toBe(400);
    expect((await response.json()).event.payload.type).toBe("INVALID_DIRECTIVE");
    expect(mockFindToken).not.toHaveBeenCalled();
    expect(mockFetchVoiceData).not.toHaveBeenCalled();
  });

  test("rejects oversize and overly nested bodies before identity lookup", async () => {
    const oversized = directive("Alexa.PowerController", "TurnOn", { text: "x".repeat(32_768) });
    expect((await handler(request(oversized))).status).toBe(400);
    const deep = directive("Alexa.PowerController", "TurnOn", { a: { b: { c: { d: { e: true } } } } });
    expect((await handler(request(deep))).status).toBe(400);
    expect(mockFindToken).not.toHaveBeenCalled();
    expect(mockFetchVoiceData).not.toHaveBeenCalled();
  });

  test("IP and account limits both precede device access", async () => {
    mockEnforceRateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await handler(request(directive()))).status).toBe(429);
    expect(mockFindToken).not.toHaveBeenCalled();
    mockEnforceRateLimit.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false });
    expect((await handler(request(directive()))).status).toBe(429);
    expect(mockFindToken).toHaveBeenCalledTimes(1);
    expect(mockFetchVoiceData).not.toHaveBeenCalled();
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
  });
});
