import fs from "fs";
import path from "path";

const migration = fs.readFileSync(
  path.resolve(
    __dirname,
    "../migrations/008_member_permission_overrides.sql",
  ),
  "utf8",
);
const voiceData = fs.readFileSync(
  path.resolve(__dirname, "../functions/_shared/voiceData.ts"),
  "utf8",
);
const inviteFunction = fs.readFileSync(
  path.resolve(__dirname, "../functions/home-invite/index.ts"),
  "utf8",
);

describe("member permission override migration guardrails", () => {
  test("binds every override to a real household member", () => {
    expect(migration).toContain("primary key (home_id, user_id, permission)");
    expect(migration).toContain(
      "references home_members(home_id, user_id) on delete cascade",
    );
  });

  test("prevents delegated managers from overriding the owner", () => {
    expect(migration).toContain(
      "user_id <> (select h.owner_id from homes h where h.id = home_id)",
    );
    expect(migration).toContain("when hm.role = 'owner' then true");
  });

  test("uses the effective permission for device and camera policies", () => {
    expect(migration).toContain("effective_member_has_action_permission(");
    expect(migration).toContain(
      "can_perform_device_action(id, 'device.view')",
    );
    expect(migration).toContain(
      "kind <> 'camera' or can_perform_device_action(id, 'camera.live')",
    );
  });

  test("applies the same decision to voice commands", () => {
    expect(migration).toContain("voice_member_can_perform_device_action(");
    expect(migration).toMatch(
      /if not voice_member_can_perform_device_action\([\s\S]*raise exception 'Voice command forbidden'/,
    );
  });

  test("filters privileged voice discovery through member overrides", () => {
    expect(voiceData).toContain('.from("member_permission_overrides")');
    expect(voiceData).toContain(
      'hasPermission(device.home_id, "device.view")',
    );
    expect(voiceData).toContain(
      "hasPermission(device.home_id, voicePermissionForKind(device.kind))",
    );
  });

  test("enforces member invite overrides in the privileged invite function", () => {
    expect(inviteFunction).toContain(
      '"effective_member_has_action_permission"',
    );
    expect(inviteFunction).toContain(
      'requested_permission: "member.invite"',
    );
  });

  test("keeps privileged voice helpers service-role only", () => {
    expect(migration).toMatch(
      /revoke all on function voice_member_can_perform_device_action[\s\S]*from public;/,
    );
    expect(migration).toMatch(
      /grant execute on function enqueue_voice_device_command[\s\S]*to service_role;/,
    );
  });
});
