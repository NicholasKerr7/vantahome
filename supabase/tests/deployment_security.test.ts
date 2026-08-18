import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "../..");
const config = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/011_security_function_lint_fixes.sql"),
  "utf8",
);
const voiceAuthorize = fs.readFileSync(
  path.join(root, "supabase/functions/voice-authorize/index.ts"),
  "utf8",
);
const voiceToken = fs.readFileSync(
  path.join(root, "supabase/functions/voice-token/index.ts"),
  "utf8",
);
const voiceHandlers = fs.readFileSync(
  path.join(root, "supabase/functions/_shared/voiceHandlers.ts"),
  "utf8",
);

function configuredJwtSetting(name: string) {
  return config.match(
    new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt = (true|false)`),
  )?.[1];
}

describe("deployed security configuration", () => {
  test.each([
    "home-bootstrap",
    "device-command",
    "device-state",
    "device-state-batch",
    "device-audit",
    "home-invite",
    "home-invite-respond",
  ])("requires a Supabase user JWT for %s", (name) => {
    expect(configuredJwtSetting(name)).toBe("true");
  });

  test.each([
    "voice-authorize",
    "voice-token",
    "alexa-smart-home",
    "google-smart-home",
  ])("lets the %s handler authenticate its external caller", (name) => {
    expect(configuredJwtSetting(name)).toBe("false");
  });

  test("public voice handlers enforce their own credentials", () => {
    expect(voiceAuthorize).toContain("signInWithPassword");
    expect(voiceToken).toContain("verifyClientSecret");
    expect(voiceHandlers).toContain("findToken(token)");
    expect(voiceHandlers).toContain("client.provider !== expectedProvider");
  });

  test("replaces both database-lint failures without widening grants", () => {
    expect(migration).toContain("assigned_room_id uuid");
    expect(migration).not.toContain("gen_random_bytes");
    expect(migration).toContain(
      "revoke all on function respond_home_invite(uuid, text) from public",
    );
    expect(migration).toMatch(
      /revoke all on function enqueue_voice_device_command[\s\S]*from public;/,
    );
  });
});
