import fs from "fs";
import path from "path";

const repositoryRoot = path.resolve(__dirname, "../..");
const migration = fs.readFileSync(
  path.join(repositoryRoot, "supabase/migrations/009_edge_abuse_controls.sql"),
  "utf8",
);
const helper = fs.readFileSync(
  path.join(repositoryRoot, "supabase/functions/_shared/edgeSecurity.ts"),
  "utf8",
);
const protectedEndpoints = [
  "alexa-smart-home",
  "device-audit",
  "device-command",
  "google-smart-home",
  "home-bootstrap",
  "home-invite",
  "home-invite-respond",
  "voice-authorize",
  "voice-token",
];

describe("Docker-free Edge abuse-control guardrails", () => {
  test("stores only validated HMAC hashes in a private schema", () => {
    expect(migration).toContain("private.edge_rate_limit_buckets");
    expect(migration).toContain("key_hash ~ '^[0-9a-f]{64}$'");
    expect(migration).toContain(
      "revoke all on schema private from public, anon, authenticated",
    );
  });

  test("increments buckets atomically and returns retry guidance", () => {
    expect(migration).toContain(
      "on conflict (endpoint, key_hash, window_started_at)",
    );
    expect(migration).toContain("request_count + 1");
    expect(migration).toContain("retry_after_seconds");
  });

  test("keeps the bucket RPC service-role only", () => {
    expect(migration).toMatch(
      /revoke all on function consume_edge_rate_limit[\s\S]*from public, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function consume_edge_rate_limit[\s\S]*to service_role;/,
    );
  });

  test("fails closed when proxy or hashing configuration is unavailable", () => {
    expect(helper).toContain('reason: "missing_secret"');
    expect(helper).toContain('reason: "missing_client_ip"');
    expect(helper).toContain('reason: "storage_error"');
  });

  test.each(protectedEndpoints)("protects the %s Edge endpoint", (endpoint) => {
    const source = fs.readFileSync(
      path.join(repositoryRoot, `supabase/functions/${endpoint}/index.ts`),
      "utf8",
    );
    expect(source).toContain("enforceEdgeRateLimit(");
    expect(source).toContain("rateLimitResponse(");
  });

  test.each(["alexa-smart-home", "google-smart-home"])(
    "limits %s before bearer-token lookup",
    (endpoint) => {
      const source = fs.readFileSync(
        path.join(repositoryRoot, `supabase/functions/${endpoint}/index.ts`),
        "utf8",
      );
      expect(source.indexOf("const ipRateLimit = await enforceEdgeRateLimit"))
        .toBeLessThan(source.indexOf("await getVoiceUserId"));
      expect(source).toContain("includeClientIp: false");
    },
  );

  test("emits structured operational fields without logging the address", () => {
    expect(helper).toContain('type: "edge_operation"');
    expect(helper).toContain("durationMs:");
    expect(helper).toContain("clientIpResolved:");
    expect(helper).not.toContain("clientIp: context.clientIp");
  });
});
