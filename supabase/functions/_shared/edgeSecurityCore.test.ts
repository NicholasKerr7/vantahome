import {
  hashRateLimitIdentity,
  normalizeIp,
  resolveTrustedClientIp,
} from "./edgeSecurityCore";

describe("trusted proxy edge security", () => {
  test("ignores forwarded headers until a trusted hop count is configured", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7" });
    expect(resolveTrustedClientIp(headers, 0)).toBeNull();
    expect(resolveTrustedClientIp(headers, 1)).toBe("203.0.113.7");
  });

  test("walks from the trusted side of a proxy chain", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.99, 203.0.113.7, 10.0.0.4",
    });
    expect(resolveTrustedClientIp(headers, 2)).toBe("203.0.113.7");
  });

  test("rejects malformed addresses instead of using a partial chain", () => {
    const headers = new Headers({
      "x-forwarded-for": "attacker, 203.0.113.7",
    });
    expect(resolveTrustedClientIp(headers, 1)).toBeNull();
    expect(normalizeIp("999.1.1.1")).toBeNull();
    expect(normalizeIp("[2001:db8::1]")).toBe("2001:db8::1");
  });

  test("hashes identities deterministically without exposing the input", async () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const first = await hashRateLimitIdentity("ip:203.0.113.7", secret);
    const second = await hashRateLimitIdentity("ip:203.0.113.7", secret);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("203.0.113.7");
  });
});
