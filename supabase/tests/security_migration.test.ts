import fs from "fs";
import path from "path";

const repositoryRoot = path.resolve(__dirname, "../..");
const migration = fs.readFileSync(
  path.join(
    repositoryRoot,
    "supabase/migrations/007_security_trust_boundaries.sql",
  ),
  "utf8",
);

describe("Docker-free security migration guardrails", () => {
  test.each([
    "command_id",
    "home_id",
    "actor_user_id",
    "action",
    "payload",
    "nonce",
    "idempotency_key",
    "expires_at",
  ])("upgrades the legacy queue with %s", (column) => {
    expect(migration).toContain(
      `alter table device_commands add column if not exists ${column}`,
    );
  });

  test("preserves legacy rows but prevents them from dispatching", () => {
    expect(migration).toContain("status = case when dc.actor_user_id is null");
    expect(migration).toContain("status = 'expired'");
    expect(migration).toContain("device_commands_actor_check");
  });

  test("enforces layered command rate limits at the table boundary", () => {
    expect(migration).toContain("enforce_device_command_rate_limits");
    expect(migration).toContain("device_commands_rate_limit");
    expect(migration).toContain("where dc.home_id = new.home_id");
    expect(migration).toContain("where dc.device_id = new.device_id");
  });

  test("keeps privileged voice helpers service-role only", () => {
    expect(migration).toMatch(
      /revoke all on function enqueue_voice_device_command[\s\S]*from public;/,
    );
    expect(migration).toMatch(
      /grant execute on function enqueue_voice_device_command[\s\S]*to service_role;/,
    );
    expect(migration).toContain("exchange_voice_authorization_code");
    expect(migration).toContain("refresh_expires_at");
  });

  test("requires explicit camera read permission", () => {
    expect(migration).toContain(
      "kind <> 'camera' or can_perform_device_action(id, 'camera.live')",
    );
    expect(migration).toContain(
      "d.kind <> 'camera'\n        or can_perform_device_action(d.id, 'camera.live')",
    );
  });
});
