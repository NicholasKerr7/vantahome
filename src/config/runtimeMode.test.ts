import {
  isAllowedDirectWebSocketUrl,
  resolveAuthExperience,
} from "./runtimeMode";

describe("runtime authentication policy", () => {
  test("allows seeded local data only for an explicit unauthenticated demo", () => {
    expect(
      resolveAuthExperience({
        hasSupabase: false,
        hasSession: false,
        allowUnauthenticatedDemo: true,
      }),
    ).toBe("demo");
  });

  test("fails closed when Supabase is missing outside demo mode", () => {
    expect(
      resolveAuthExperience({
        hasSupabase: false,
        hasSession: false,
        allowUnauthenticatedDemo: false,
      }),
    ).toBe("configuration-required");
  });

  test("requires sign-in when Supabase exists without a session", () => {
    expect(
      resolveAuthExperience({
        hasSupabase: true,
        hasSession: false,
      }),
    ).toBe("sign-in");
  });

  test("opens the authenticated app only with a configured session", () => {
    expect(
      resolveAuthExperience({
        hasSupabase: true,
        hasSession: true,
      }),
    ).toBe("authenticated");
  });
});

describe("runtime transport policy", () => {
  test("accepts local insecure sockets only in demo/development", () => {
    expect(isAllowedDirectWebSocketUrl("ws://localhost:8088", "demo")).toBe(
      true,
    );
    expect(
      isAllowedDirectWebSocketUrl("ws://localhost:8088", "development"),
    ).toBe(true);
  });

  test.each(["alpha", "production"] as const)(
    "requires TLS sockets in %s",
    (mode) => {
      expect(isAllowedDirectWebSocketUrl("ws://bridge.local", mode)).toBe(false);
      expect(isAllowedDirectWebSocketUrl("wss://bridge.example", mode)).toBe(
        true,
      );
    },
  );

  test("rejects malformed URLs and embedded credentials", () => {
    expect(isAllowedDirectWebSocketUrl("not-a-url", "production")).toBe(false);
    expect(
      isAllowedDirectWebSocketUrl(
        "wss://user:secret@bridge.example",
        "production",
      ),
    ).toBe(false);
  });
});
