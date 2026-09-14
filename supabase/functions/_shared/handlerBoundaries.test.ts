import { getVoiceIdentity, getVoiceUserId } from "./voiceHandlers";

const mockAdmin = {
  from: jest.fn(), rpc: jest.fn(),
  auth: { admin: { inviteUserByEmail: jest.fn(), listUsers: jest.fn() } },
};
const mockCaller = { from: jest.fn(), rpc: jest.fn(), auth: { getUser: jest.fn() } };
const mockFindToken = jest.fn();
const mockGetVoiceClient = jest.fn();
const mockCreateClient = jest.fn();
const mockFetchVoiceData = jest.fn();
const mockEnqueueDeviceCommand = jest.fn();
const mockVerifyClientSecret = jest.fn();
const mockInviteUpsert = jest.fn();
const mockEnforceRateLimit = jest.fn();

jest.mock("./supabaseAdmin.ts", () => ({ getSupabaseAdmin: () => mockAdmin }));
jest.mock("./supabaseClient.ts", () => ({ getSupabaseClient: () => mockCaller }));
jest.mock("./voiceAuth.ts", () => ({
  findToken: (...args: unknown[]) => mockFindToken(...args),
  getVoiceClient: (...args: unknown[]) => mockGetVoiceClient(...args),
  verifyClientSecret: (...args: unknown[]) => mockVerifyClientSecret(...args),
  isExpired: (value: string) => new Date(value).getTime() <= Date.now(),
  randomToken: () => "b".repeat(48),
}));
jest.mock("./voiceData.ts", () => ({
  fetchVoiceData: (...args: unknown[]) => mockFetchVoiceData(...args),
  enqueueDeviceCommand: (...args: unknown[]) => mockEnqueueDeviceCommand(...args),
}));
jest.mock("https://esm.sh/@supabase/supabase-js@2.49.1", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}), { virtual: true });
jest.mock("./edgeSecurity.ts", () => ({
  createEdgeRequestContext: () => ({}),
  enforceEdgeRateLimit: (...args: unknown[]) => mockEnforceRateLimit(...args),
  finalizeEdgeResponse: (_context: unknown, response: Response) => response,
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

type Handler = (request: Request) => Promise<Response>;
const handlers: Record<string, Handler> = {};
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const recipientId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const homeId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const deviceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const foreignId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const token = "a".repeat(48);

function queryResult(data: unknown, error: unknown = null) {
  const result: Record<string, any> = {
    then: (resolve: (value: unknown) => void) => resolve({ data, error }),
  };
  for (const method of ["select", "eq", "in", "limit", "update", "delete", "insert"]) {
    result[method] = jest.fn(() => result);
  }
  result.maybeSingle = jest.fn(async () => ({ data, error }));
  result.single = jest.fn(async () => ({ data, error }));
  return result;
}

const originalDeno = (globalThis as any).Deno;
beforeAll(() => {
  let currentName = "";
  (globalThis as any).Deno = {
    env: { get: () => "local-test-placeholder" },
    serve: (handler: Handler) => { handlers[currentName] = handler; },
  };
  for (const endpoint of [
    "home-invite", "voice-authorize", "voice-token", "google-smart-home", "device-command",
    "device-audit", "home-bootstrap", "home-invite-respond", "device-state", "device-state-batch",
  ]) {
    currentName = endpoint;
    require(`../${endpoint}/index.ts`);
  }
});
afterAll(() => { (globalThis as any).Deno = originalDeno; });

beforeEach(() => {
  jest.resetAllMocks();
  mockEnforceRateLimit.mockResolvedValue({ allowed: true, remaining: 100 });
  mockCaller.auth.getUser.mockResolvedValue({
    data: { user: { id: actorId, email: "owner@example.test" } }, error: null,
  });
  mockCaller.from.mockImplementation((table: string) => queryResult(
    table === "homes" ? { id: homeId } : { home_id: homeId, role: "owner" },
  ));
  mockCaller.rpc.mockResolvedValue({ data: true, error: null });
  mockGetVoiceClient.mockResolvedValue({
    id: "voice-test", name: "Test Voice", provider: "google",
    redirect_uris: ["https://voice.example.test/callback"],
  });
  mockFindToken.mockResolvedValue({
    user_id: actorId, client_id: "voice-test", expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  mockVerifyClientSecret.mockResolvedValue(true);
  mockFetchVoiceData.mockResolvedValue({
    devices: [{ id: deviceId, home_id: homeId, room_id: null, name: "Light", kind: "light" }],
    rooms: new Map(), states: new Map(),
  });
  mockEnqueueDeviceCommand.mockResolvedValue({ command_id: "synthetic-command", status: "created" });
  mockAdmin.rpc.mockResolvedValue({ data: recipientId, error: null });
  mockAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({
    data: { user: { id: recipientId, email: "intended@example.test" } }, error: null,
  });
  mockInviteUpsert.mockResolvedValue({ error: null });
  mockAdmin.from.mockImplementation((table: string) => {
    if (table === "home_invites") return { upsert: mockInviteUpsert };
    return queryResult(table === "rooms" ? [] : null);
  });
  mockCreateClient.mockReturnValue({ auth: { signInWithPassword: jest.fn(async () => ({
    data: { user: { id: actorId } }, error: null,
  })) } });
});

function inviteRequest(role = "member") {
  return new Request("https://edge.example.test/home-invite", {
    method: "POST", body: JSON.stringify({ email: " Intended@Example.Test ", role, roomIds: [] }),
  });
}

function googleRequest(intent: string, payload?: unknown) {
  return new Request("https://edge.example.test/google-smart-home", {
    method: "POST", headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ requestId: "test-request", inputs: [{ intent, payload }] }),
  });
}

function executePayload(id = deviceId) {
  return { commands: [{
    devices: [{ id }],
    execution: [{ command: "action.devices.commands.OnOff", params: { on: true } }],
  }] };
}

describe("authenticated API boundaries", () => {
  test.each([
    "device-command", "device-audit", "home-bootstrap", "home-invite",
    "home-invite-respond", "device-state", "device-state-batch",
  ])("%s rejects a missing account before database access", async (endpoint) => {
    mockCaller.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await handlers[endpoint](new Request(`https://edge.example.test/${endpoint}`, {
      method: "POST", body: "{}",
    }));
    expect(response.status).toBe(401);
    expect(mockCaller.from).not.toHaveBeenCalled();
    expect(mockCaller.rpc).not.toHaveBeenCalled();
    expect(mockAdmin.from).not.toHaveBeenCalled();
    expect(mockAdmin.rpc).not.toHaveBeenCalled();
    expect(mockAdmin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });
});

describe("invitation recipient binding", () => {
  test("preserves new-account invitations with a matching Auth email", async () => {
    expect((await handlers["home-invite"](inviteRequest())).status).toBe(200);
    expect(mockInviteUpsert).toHaveBeenCalledWith(expect.objectContaining({
      invited_user_id: recipientId, email: "intended@example.test",
    }));
    expect(mockAdmin.rpc).not.toHaveBeenCalled();
  });

  test.each(["email_exists", "user_already_exists"])("uses an exact lookup for %s and tolerates a null invite user", async (code) => {
    mockAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: { code } });
    const response = await handlers["home-invite"](inviteRequest());
    expect(response.status).toBe(200);
    expect(mockAdmin.rpc).toHaveBeenCalledWith("find_auth_user_id_by_email", { target_email: "intended@example.test" });
    expect(mockAdmin.auth.admin.listUsers).not.toHaveBeenCalled();
    expect(mockInviteUpsert).toHaveBeenCalledWith(expect.objectContaining({ invited_user_id: recipientId }));
    expect(await response.json()).toEqual(expect.objectContaining({
      member: expect.objectContaining({ name: "intended@example.test", userId: recipientId }),
    }));
  });

  test.each([
    { data: { user: null }, error: { code: "unexpected_failure" } },
    { data: { user: null }, error: null },
    { data: { user: { id: foreignId, email: "unrelated@example.test" } }, error: null },
  ])("does not look up or persist a recipient after unrelated failures", async (result) => {
    mockAdmin.auth.admin.inviteUserByEmail.mockResolvedValue(result);
    expect((await handlers["home-invite"](inviteRequest())).status).toBe(400);
    expect(mockAdmin.rpc).not.toHaveBeenCalled();
    expect(mockAdmin.from).not.toHaveBeenCalled();
    expect(mockAdmin.auth.admin.listUsers).not.toHaveBeenCalled();
  });

  test.each([
    { data: null, error: null }, { data: recipientId, error: { message: "lookup failed" } },
  ])("fails closed when an existing account cannot be resolved", async (result) => {
    mockAdmin.auth.admin.inviteUserByEmail.mockResolvedValue({ data: null, error: { code: "email_exists" } });
    mockAdmin.rpc.mockResolvedValue(result);
    expect((await handlers["home-invite"](inviteRequest())).status).toBe(400);
    expect(mockInviteUpsert).not.toHaveBeenCalled();
  });

  test("only the canonical home owner can invite administrators", async () => {
    mockCaller.from.mockImplementation((table: string) => queryResult(
      table === "homes" ? null : { home_id: homeId, role: "admin" },
    ));
    expect((await handlers["home-invite"](inviteRequest("admin"))).status).toBe(403);
    expect(mockAdmin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect((await handlers["home-invite"](inviteRequest("member"))).status).toBe(200);
  });

  test("allows the canonical owner to invite administrators", async () => {
    expect((await handlers["home-invite"](inviteRequest("admin"))).status).toBe(200);
    expect(mockInviteUpsert).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }));
  });
});

describe("voice authentication boundaries", () => {
  test("retains the verified client identity for scoped lifecycle actions", async () => {
    await expect(getVoiceIdentity(googleRequest("action.devices.SYNC"), "google"))
      .resolves.toEqual({ userId: actorId, clientId: "voice-test" });
  });

  test("rejects a token issued to the other provider", async () => {
    mockGetVoiceClient.mockResolvedValue({ provider: "alexa" });
    await expect(getVoiceUserId(googleRequest("action.devices.SYNC"), "google")).resolves.toBeNull();
  });

  test("rejects an expired token before loading provider permissions", async () => {
    mockFindToken.mockResolvedValue({ expires_at: new Date(Date.now() - 1_000).toISOString() });
    await expect(getVoiceUserId(googleRequest("action.devices.SYNC"), "google")).resolves.toBeNull();
    expect(mockGetVoiceClient).not.toHaveBeenCalled();
  });

  test("rejects malformed bearer values before querying storage", async () => {
    await expect(getVoiceUserId(new Request("https://edge.example.test", {
      headers: { authorization: "Bearer invalid" },
    }), "google")).resolves.toBeNull();
    expect(mockFindToken).not.toHaveBeenCalled();
  });
});

describe("Google command and unlink lifecycle", () => {
  test("accepts the nested EXECUTE envelope for an authorized light", async () => {
    const response = await handlers["google-smart-home"](googleRequest("action.devices.EXECUTE", executePayload()));
    expect(response.status).toBe(200);
    expect(mockEnqueueDeviceCommand).toHaveBeenCalledWith(actorId, deviceId, "google", { isOn: true });
  });

  test("returns the per-device denial without enqueueing a foreign device", async () => {
    const response = await handlers["google-smart-home"](googleRequest("action.devices.EXECUTE", executePayload(foreignId)));
    expect(response.status).toBe(200);
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).toContain("deviceNotFound");
  });

  test("still rejects excessively nested provider payloads before discovery", async () => {
    let payload: unknown = true;
    for (let depth = 0; depth < 12; depth += 1) payload = { child: payload };
    expect((await handlers["google-smart-home"](googleRequest("action.devices.EXECUTE", payload))).status).toBe(400);
    expect(mockFetchVoiceData).not.toHaveBeenCalled();
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
  });

  test("unlinks only the authenticated user/client through the atomic revocation RPC", async () => {
    const response = await handlers["google-smart-home"](googleRequest("action.devices.DISCONNECT"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(mockAdmin.rpc).toHaveBeenCalledWith("revoke_voice_link", {
      target_user_id: actorId, target_client_id: "voice-test",
    });
    expect(mockFetchVoiceData).not.toHaveBeenCalled();
    expect(mockEnqueueDeviceCommand).not.toHaveBeenCalled();
  });

  test("does not acknowledge unlink when token revocation fails", async () => {
    mockAdmin.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect((await handlers["google-smart-home"](googleRequest("action.devices.DISCONNECT"))).status).toBe(500);
  });

  test("rejects access and refresh after the revoked token family has disappeared", async () => {
    mockFindToken.mockResolvedValue(null);
    expect((await handlers["google-smart-home"](googleRequest("action.devices.SYNC"))).status).toBe(401);
    mockAdmin.from.mockReturnValue(queryResult(null));
    const response = await handlers["voice-token"](new Request("https://edge.example.test/voice-token", {
      method: "POST", body: new URLSearchParams({
        grant_type: "refresh_token", client_id: "voice-test", client_secret: "test-secret", refresh_token: token,
      }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_grant" });
  });
});

describe("OAuth response protections", () => {
  const authorizeUrl = "https://edge.example.test/voice-authorize?client_id=voice-test&response_type=code&redirect_uri=https%3A%2F%2Fvoice.example.test%2Fcallback";

  function expectProtected(response: Response) {
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  }

  test("protects the form and allows only its nonce-tagged inline style", async () => {
    const response = await handlers["voice-authorize"](new Request(authorizeUrl));
    expect(response.status).toBe(200);
    expectProtected(response);
    const html = await response.text();
    const nonce = html.match(/<style nonce="([a-z0-9]+)">/)?.[1];
    expect(nonce).toBeTruthy();
    expect(response.headers.get("content-security-policy")).toContain(`style-src 'nonce-${nonce}'`);
    expect(response.headers.get("content-security-policy")).toContain("form-action 'self'");
    expect(response.headers.get("content-security-policy")).toContain("form-action 'self' https://voice.example.test");
    expect(html).toContain('<form method="post">');
  });

  test.each([
    new Request("https://edge.example.test/voice-authorize"),
    new Request(authorizeUrl.replace("voice.example.test", "unregistered.example.test")),
    new Request(authorizeUrl, { method: "DELETE" }),
    new Request(authorizeUrl, { method: "POST", body: "invalid=form" }),
  ])("protects rejected requests too", async (request) => {
    const response = await handlers["voice-authorize"](request.clone());
    expect(response.status).toBeGreaterThanOrEqual(400);
    expectProtected(response);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  test("protects redirects while preserving the registered callback and state", async () => {
    const response = await handlers["voice-authorize"](new Request(authorizeUrl, {
      method: "POST", body: new URLSearchParams({
        client_id: "voice-test", redirect_uri: "https://voice.example.test/callback", state: "opaque-state",
        email: "owner@example.test", password: "test-password",
      }),
    }));
    expect(response.status).toBe(302);
    expectProtected(response);
    const redirect = new URL(response.headers.get("location")!);
    expect(redirect.origin).toBe("https://voice.example.test");
    expect(redirect.searchParams.get("state")).toBe("opaque-state");
    expect(redirect.searchParams.get("code")).toBeTruthy();
  });

  test("protects rate-limit responses", async () => {
    mockEnforceRateLimit.mockResolvedValue({ allowed: false });
    const response = await handlers["voice-authorize"](new Request(authorizeUrl));
    expect(response.status).toBe(429);
    expectProtected(response);
  });
});
