const {
  REQUIRED_FUNCTIONS,
  REQUIRED_TABLES,
  isReady,
} = require("./check-supabase-readiness.js");

describe("Supabase readiness inventory", () => {
  test("tracks the complete client-visible Sprint 2 surface", () => {
    expect(REQUIRED_TABLES).toContain("member_permission_overrides");
    expect(REQUIRED_TABLES).toContain("device_commands");
    expect(REQUIRED_FUNCTIONS).toContain("device-command");
    expect(REQUIRED_FUNCTIONS).toContain("voice-token");
  });

  test("passes only when every table and function responds successfully", () => {
    const ready = {
      tables: REQUIRED_TABLES.map((name: string) => ({ name, status: 200 })),
      functions: REQUIRED_FUNCTIONS.map((name: string) => ({
        name,
        status: 204,
      })),
    };
    expect(isReady(ready)).toBe(true);
    ready.functions[0].status = 404;
    expect(isReady(ready)).toBe(false);
  });
});
