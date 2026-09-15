const mockGetVoiceClient = jest.fn();
const mockCreateClient = jest.fn();
const mockSignIn = jest.fn();
const mockInsert = jest.fn();
const mockEnforceRateLimit = jest.fn();
const mockAdmin = { from: jest.fn() };

jest.mock("./supabaseAdmin.ts", () => ({ getSupabaseAdmin: () => mockAdmin }));
jest.mock("./voiceAuth.ts", () => ({
  getVoiceClient: (...args: unknown[]) => mockGetVoiceClient(...args),
  randomToken: () => "a".repeat(32),
}));
jest.mock("https://esm.sh/@supabase/supabase-js@2.49.1", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}), { virtual: true });
jest.mock("./edgeSecurity.ts", () => ({
  createEdgeRequestContext: (_request: Request, endpoint: string) => ({ endpoint }),
  enforceEdgeRateLimit: (...args: unknown[]) => mockEnforceRateLimit(...args),
  finalizeEdgeResponse: (_context: unknown, response: Response) => response,
  rateLimitResponse: (_context: unknown, result: { reason?: string }) => new Response("private implementation detail", {
    status: result.reason ? 503 : 429,
    headers: {
      "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*",
      "x-request-id": "test-request", "retry-after": "10",
    },
  }),
}));

type Handler = (request: Request) => Promise<Response>;
let handler: Handler;
const originalDeno = (globalThis as any).Deno;
const originalUrl = globalThis.URL;
const originalSearchParams = globalThis.URLSearchParams;
const origin = "https://link.example.test";
const callback = "https://voice.example.test/callback?registered=one";
const endpoint = "https://edge.example.test/voice-authorize";
let configuredOrigin: string | undefined;
const client = { id: "voice-test", name: "Test Voice", provider: "alexa", redirect_uris: [callback], client_secret_hash: "never-return-this" };

function oauthFields(overrides: Record<string, unknown> = {}) {
  return { client_id: client.id, redirect_uri: callback, response_type: "code", state: " opaque + unicode 🏠 & state ", ...overrides };
}

function passwordFields(overrides: Record<string, unknown> = {}) {
  return { ...oauthFields(), email: " Owner@Example.Test ", password: " synthetic-password ", ...overrides };
}

function getRequest(overrides: Record<string, unknown> = {}, headers: Record<string, string> = { Origin: origin }) {
  const query = new URLSearchParams({ format: "json", ...oauthFields(overrides) } as Record<string, string>);
  return new Request(`${endpoint}?${query}`, { headers });
}

function postRequest(overrides: Record<string, unknown> = {}, headers: Record<string, string> = { Origin: origin, "Content-Type": "application/json" }) {
  return new Request(`${endpoint}?format=json`, { method: "POST", headers, body: JSON.stringify(passwordFields(overrides)) });
}

function expectProtected(response: Response, expectedOrigin: string | null = origin) {
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(expectedOrigin);
  expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  expect(response.headers.get("Access-Control-Allow-Headers")).not.toBe("*");
  expect(response.headers.get("Access-Control-Allow-Methods")).not.toBe("*");
  expect(response.headers.get("Vary")).toContain("Origin");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
}

beforeAll(() => {
  // Deno uses the standard URL implementation; the mobile test preset's URL
  // shim does not canonicalize host names as the Edge runtime does.
  globalThis.URL = require("node:url").URL;
  globalThis.URLSearchParams = require("node:url").URLSearchParams;
  (globalThis as any).Deno = {
    env: { get: (name: string) => name === "VOICE_LINKING_ORIGIN" ? configuredOrigin : "local-test-placeholder" },
    serve: (value: Handler) => { handler = value; },
  };
  require("../voice-authorize/index.ts");
});
afterAll(() => {
  (globalThis as any).Deno = originalDeno;
  globalThis.URL = originalUrl;
  globalThis.URLSearchParams = originalSearchParams;
});
beforeEach(() => {
  jest.resetAllMocks();
  configuredOrigin = origin;
  mockGetVoiceClient.mockImplementation(async (id: string) => id === client.id ? client : null);
  mockCreateClient.mockReturnValue({ auth: { signInWithPassword: mockSignIn } });
  mockSignIn.mockResolvedValue({ data: { user: { id: "synthetic-user" } }, error: null });
  mockAdmin.from.mockReturnValue({ insert: mockInsert });
  mockInsert.mockResolvedValue({ error: null });
  mockEnforceRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
});

describe("opt-in browser authorization origin", () => {
  test.each([
    undefined, "", "*", "not-an-origin", "http://link.example.test", `${origin}/`, `${origin}/path`,
    `${origin}?query=1`, `${origin}#fragment`, "https://user:password@link.example.test",
    "https://LINK.example.test", "https://link.example.test:443", "https://localhost", "https://local.localhost",
    "https://127.0.0.1", "https://127.1.2.3", "https://[::1]", "https://localhost.",
  ])("fails closed for noncanonical/unconfigured origin %s", async (configuration) => {
    configuredOrigin = configuration;
    const response = await handler(postRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "linking_unavailable" });
    expectProtected(response, null);
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockGetVoiceClient).not.toHaveBeenCalled();
  });

  test.each([undefined, "null", "https://evil.example.test", `${origin}.evil.example.test`, `${origin}/`, `${origin}, https://evil.example.test`])(
    "rejects an unapproved request origin %s before credential handling", async (requestOrigin) => {
      const response = await handler(postRequest({}, { "Content-Type": "application/json", ...(requestOrigin ? { Origin: requestOrigin } : {}) }));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "origin_not_allowed" });
      expectProtected(response, null);
      expect(mockCreateClient).not.toHaveBeenCalled();
      expect(mockEnforceRateLimit).not.toHaveBeenCalled();
    },
  );

  test("returns only validated public client metadata with exact OAuth bindings", async () => {
    const response = await handler(getRequest());
    expect(response.status).toBe(200);
    expectProtected(response);
    expect(await response.json()).toEqual({ client: { name: client.name, provider: client.provider }, ...oauthFields() });
    expect(mockGetVoiceClient).toHaveBeenCalledWith(client.id, { throwOnStorageError: true });
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockAdmin.from).not.toHaveBeenCalled();
  });

  test.each(["GET", "POST"])("allows a narrow %s preflight without authentication or rate consumption", async (method) => {
    const response = await handler(new Request(`${endpoint}?format=json`, { method: "OPTIONS", headers: {
      Origin: origin, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "content-type",
    } }));
    expect(response.status).toBe(204);
    expectProtected(response);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();
  });

  test.each([
    {}, { "Access-Control-Request-Method": "DELETE" },
    { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type, authorization" },
    { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-forwarded-for" },
    { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "*" },
  ])("rejects unsupported preflight details", async (headers) => {
    const response = await handler(new Request(`${endpoint}?format=json`, { method: "OPTIONS", headers: { Origin: origin, ...headers } }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invalid_preflight" });
    expectProtected(response);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  test.each([undefined, "missing_client_ip", "missing_secret", "storage_error"])("removes inherited wildcard CORS from rate failures: %s", async (reason) => {
    mockEnforceRateLimit.mockResolvedValue({ allowed: false, ...(reason ? { reason } : {}) });
    const response = await handler(postRequest());
    expect(response.status).toBe(reason ? 503 : 429);
    expectProtected(response);
    expect(response.headers.get("x-request-id")).toBe("test-request");
    expect(response.headers.get("retry-after")).toBe("10");
    expect(await response.json()).toEqual({ error: reason ? "abuse_protection_unavailable" : "rate_limited" });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});

describe("browser authorization input and storage boundaries", () => {
  test.each(["client_id", "redirect_uri", "response_type", "state", "format"])("rejects duplicate %s query parameters", async (field) => {
    const request = getRequest();
    const url = new URL(request.url);
    url.searchParams.append(field, "conflict");
    const response = await handler(new Request(url, { headers: { Origin: origin } }));
    expect(response.status).toBe(400);
    expectProtected(response);
    expect(mockGetVoiceClient).not.toHaveBeenCalled();
  });

  test("a json selector following an invalid selector cannot escape the Origin boundary", async () => {
    const response = await handler(new Request(`${endpoint}?format=html&format=json`));
    expect(response.status).toBe(403);
    expectProtected(response, null);
  });

  test.each([
    { client_id: " voice-test " }, { redirect_uri: ` ${callback} ` },
    { redirect_uri: "https://unregistered.example.test/callback" },
  ])("never trims or relaxes registered client/redirect matching", async (overrides) => {
    for (const request of [getRequest(overrides), postRequest(overrides)]) {
      const response = await handler(request);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "unknown_client" });
      expectProtected(response);
    }
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test.each([
    "http://voice.example.test/callback", "https://user:password@voice.example.test/callback",
    "https://voice.example.test/callback#fragment", "https://voice.example.test/callback#",
    "https://VOICE.example.test/callback", "https://voice.example.test:443/callback",
  ])("rejects a noncanonical HTTPS callback even if registered: %s", async (redirect) => {
    mockGetVoiceClient.mockResolvedValue({ ...client, redirect_uris: [redirect] });
    for (const request of [getRequest({ redirect_uri: redirect }), postRequest({ redirect_uri: redirect })]) {
      const response = await handler(request);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
    }
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  test.each([{ name: "" }, { name: "  " }, { name: "x".repeat(129) }, { provider: "other" }])("does not expose malformed client display metadata", async (overrides) => {
    mockGetVoiceClient.mockResolvedValue({ ...client, ...overrides });
    const response = await handler(getRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server_error" });
    expectProtected(response);
  });

  test.each([
    { response_type: "token" }, { response_type: undefined }, { state: undefined }, { state: null },
    { state: 42 }, { state: "x".repeat(513) }, { state: { nested: "state" } },
    { client_id: "x".repeat(129) }, { redirect_uri: "x".repeat(2_049) },
    { email: "x".repeat(321) }, { email: "" }, { password: "" }, { password: "x".repeat(1_025) },
    { password: 42 }, { unknown: "field" },
  ])("rejects invalid JSON authorization fields before authentication", async (overrides) => {
    const response = await handler(postRequest(overrides));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expectProtected(response);
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test.each(["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"])("rejects credential POST with %s content type", async (contentType) => {
    const response = await handler(postRequest({}, { Origin: origin, "Content-Type": contentType }));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "unsupported_media_type" });
    expectProtected(response);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  test.each(["{invalid", "[]", JSON.stringify({ ...passwordFields(), padding: "x".repeat(8_192) })])("rejects malformed or oversized JSON without side effects", async (body) => {
    const response = await handler(new Request(`${endpoint}?format=json`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body }));
    expect(response.status).toBe(400);
    expectProtected(response);
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test.each(["GET", "POST"])("returns a safe JSON server failure for %s lookup errors", async (method) => {
    mockGetVoiceClient.mockRejectedValue(new Error("private database location"));
    const response = await handler(method === "GET" ? getRequest() : postRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server_error" });
    expectProtected(response);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  test.each([{ status: 400 }, { status: 401 }, { code: "invalid_credentials" }])("reports credential rejection without exposing authentication details", async (error) => {
    mockSignIn.mockResolvedValue({ data: { user: null }, error: { ...error, message: "sensitive auth detail" } });
    const response = await handler(postRequest());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid_credentials" });
    expectProtected(response);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test("does not mask an authentication outage as bad credentials", async () => {
    mockSignIn.mockResolvedValue({ data: { user: null }, error: { status: 503, message: "private upstream detail" } });
    const response = await handler(postRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server_error" });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test("returns no redirect when authorization-code insertion fails", async () => {
    mockInsert.mockResolvedValue({ error: { message: "private insert detail" } });
    const response = await handler(postRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server_error" });
    expectProtected(response);
  });

  test.each([" opaque + unicode 🏠 & state ", "", " ", "x".repeat(512)])("preserves supplied state exactly in the server-built authorization redirect", async (state) => {
    const response = await handler(postRequest({ state }));
    expect(response.status).toBe(200);
    expectProtected(response);
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["redirect"]);
    const redirect = new URL(body.redirect);
    expect(redirect.origin).toBe(new URL(callback).origin);
    expect(redirect.pathname).toBe(new URL(callback).pathname);
    expect(redirect.searchParams.get("registered")).toBe("one");
    expect(redirect.searchParams.get("state")).toBe(state || null);
    expect(redirect.searchParams.get("code")).toBe("a".repeat(32));
    expect(mockSignIn).toHaveBeenCalledWith({ email: "owner@example.test", password: " synthetic-password " });
    expect(mockCreateClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ client_id: client.id, redirect_uri: callback, user_id: "synthetic-user" }));
  });

  test("empty incoming state removes inherited callback state and replaces an existing code", async () => {
    const registered = `${callback}&state=inherited&code=obsolete`;
    mockGetVoiceClient.mockResolvedValue({ ...client, redirect_uris: [registered] });
    const response = await handler(postRequest({ redirect_uri: registered, state: "" }));
    expect(response.status).toBe(200);
    const redirect = new URL((await response.json()).redirect);
    expect(redirect.searchParams.has("state")).toBe(false);
    expect(redirect.searchParams.getAll("code")).toEqual(["a".repeat(32)]);
    expect(redirect.searchParams.get("registered")).toBe("one");
  });

  test("rejects unsupported HTTP methods with protected JSON", async () => {
    const response = await handler(new Request(`${endpoint}?format=json`, { method: "DELETE", headers: { Origin: origin } }));
    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: "method_not_allowed" });
    expectProtected(response);
  });
});

describe("legacy compatibility and shared abuse protection", () => {
  function legacyPost(overrides: Record<string, string> = {}) {
    return new Request(endpoint, { method: "POST", body: new URLSearchParams({
      client_id: client.id, redirect_uri: callback, state: " state with whitespace ", email: "owner@example.test", password: "synthetic-password", ...overrides,
    }) });
  }

  test("legacy HTML and form requests remain usable while JSON is unconfigured", async () => {
    configuredOrigin = undefined;
    const url = new URL(getRequest().url);
    url.searchParams.delete("format");
    const getResponse = await handler(new Request(url));
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("Content-Type")).toContain("text/html");
    expect(await getResponse.text()).toContain('<form method="post">');
    const postResponse = await handler(legacyPost());
    expect(postResponse.status).toBe(302);
    expect(new URL(postResponse.headers.get("Location")!).searchParams.get("state")).toBe(" state with whitespace ");
  });

  test.each(["client_id", "redirect_uri", "response_type", "state", "format"])("legacy mode also rejects duplicate %s query fields", async (field) => {
    const url = new URL(getRequest().url);
    url.searchParams.delete("format");
    if (!url.searchParams.has(field)) url.searchParams.append(field, "first");
    url.searchParams.append(field, "second");
    const response = await handler(new Request(url));
    expect(response.status).toBe(400);
    expect(mockGetVoiceClient).not.toHaveBeenCalled();
  });

  test.each([{ client_id: " voice-test " }, { redirect_uri: ` ${callback} ` }])("legacy POST cannot trim a binding into a registered value", async (overrides) => {
    const response = await handler(legacyPost(overrides));
    expect(response.status).toBe(400);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  test("legacy lookup outages return a protected response instead of escaping the handler", async () => {
    mockGetVoiceClient.mockRejectedValue(new Error("private storage detail"));
    const url = new URL(getRequest().url);
    url.searchParams.delete("format");
    const response = await handler(new Request(url));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private storage detail");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("HTML and JSON requests share the password budget but not the form-load budget", async () => {
    const counts = new Map<string, number>();
    mockEnforceRateLimit.mockImplementation(async (context, policy) => {
      expect(policy.requireClientIp).toBe(true);
      expect(policy.windowSeconds).toBe(900);
      const count = (counts.get(context.endpoint) ?? 0) + 1;
      counts.set(context.endpoint, count);
      return { allowed: count <= policy.maxRequests };
    });
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await handler(legacyPost())).status).toBe(302);
      expect((await handler(postRequest())).status).toBe(200);
    }
    expect((await handler(postRequest())).status).toBe(429);
    expect((await handler(legacyPost())).status).toBe(429);
    expect((await handler(getRequest())).status).toBe(200);
    expect(mockSignIn).toHaveBeenCalledTimes(10);
    expect(counts.get("voice-authorize.post")).toBe(12);
    expect(counts.get("voice-authorize.get")).toBe(1);
  });
});
