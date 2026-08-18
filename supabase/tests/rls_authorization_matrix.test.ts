import fs from "fs";
import path from "path";

const repositoryRoot = path.resolve(__dirname, "../..");
const matrix = fs.readFileSync(
  path.join(repositoryRoot, "supabase/tests/rls_authorization_matrix.sql"),
  "utf8",
);
const helperMigration = fs.readFileSync(
  path.join(repositoryRoot, "supabase/migrations/010_rls_helper_hardening.sql"),
  "utf8",
);

describe("database RLS authorization matrix guardrails", () => {
  test("covers every app device category", () => {
    const kinds = [
      "ac", "light", "tv", "coffee", "fridge", "gate", "garage", "fan",
      "door", "vacuum", "camera", "window", "stove", "washer", "dryer",
      "dishwasher", "microwave", "energy", "water", "water-heater", "air",
      "sprinkler", "speaker", "smoke",
    ];

    kinds.forEach((kind) => expect(matrix).toContain(`('${kind}',`));
  });

  test.each(["owner", "admin", "member", "guest", "tenant", "outsider"])(
    "covers the %s authorization boundary",
    (role) => expect(matrix).toContain(role),
  );

  test("executes as authenticated users and rolls fixture data back", () => {
    expect(matrix).toContain("set local role authenticated");
    expect(matrix).toContain("request.jwt.claims");
    expect(matrix.trimEnd().endsWith("rollback;")).toBe(true);
  });

  test("tests room, state, command, actor, and override isolation", () => {
    expect(matrix).toContain("tenant cannot command an unassigned room");
    expect(matrix).toContain("owner cannot mutate observed device state");
    expect(matrix).toContain("unassigned-room command insert is rejected");
    expect(matrix).toContain("spoofed command actor is rejected");
    expect(matrix).toContain("explicit denial removes a member role permission");
  });

  test("prevents recursive household policy evaluation", () => {
    for (const helper of [
      "can_access_home",
      "can_manage_home",
      "can_access_home_full",
    ]) {
      expect(helperMigration).toContain(`function ${helper}(hid uuid)`);
    }
    expect(helperMigration.match(/security definer/g)).toHaveLength(3);
    expect(helperMigration.match(/set row_security = off/g)).toHaveLength(3);
    expect(helperMigration).toContain(
      "revoke all on function can_manage_home(uuid) from public",
    );
  });
});
