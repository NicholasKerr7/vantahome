const {
  projectRefFromUrl,
  tapLinesFromQueryResult,
  validateRemoteTestTarget,
} = require("./run-remote-db-tests.js");

const activeRef = "abcdefghijklmnopqrst";
const disposableRef = "zyxwvutsrqponmlkjihg";
const appUrl = `https://${activeRef}.supabase.co`;
const disposableUrl =
  `postgresql://postgres.${disposableRef}@` +
  "aws-0-us-west-1.pooler.supabase.com:6543/postgres";

describe("remote database test safety", () => {
  test("extracts refs from API, direct database, and pooler URLs", () => {
    expect(projectRefFromUrl(appUrl)).toBe(activeRef);
    expect(
      projectRefFromUrl(
        `postgresql://postgres@db.${disposableRef}.supabase.co:5432/postgres`,
      ),
    ).toBe(disposableRef);
    expect(projectRefFromUrl(disposableUrl)).toBe(disposableRef);
  });

  test("allows an explicitly confirmed, separate disposable project", () => {
    expect(() =>
      validateRemoteTestTarget({
        databaseUrl: disposableUrl,
        appUrl,
        confirmation: "true",
      }),
    ).not.toThrow();
  });

  test("fails closed without confirmation or identifiable project refs", () => {
    expect(() =>
      validateRemoteTestTarget({
        databaseUrl: disposableUrl,
        appUrl,
        confirmation: "false",
      }),
    ).toThrow("VANTAHOME_DISPOSABLE_DB_CONFIRMED=true");
    expect(() =>
      validateRemoteTestTarget({
        databaseUrl: "postgresql://localhost/test",
        appUrl,
        confirmation: "true",
      }),
    ).toThrow("distinct Supabase projects");
  });

  test("refuses the active app project even when explicitly confirmed", () => {
    expect(() =>
      validateRemoteTestTarget({
        databaseUrl: `postgresql://postgres@db.${activeRef}.supabase.co/postgres`,
        appUrl,
        confirmation: "true",
      }),
    ).toThrow("active app project");
  });

  test("extracts only pgTAP assertions and plans from query results", () => {
    expect(
      tapLinesFromQueryResult([
        { rows: [{ ok: "ok 1 - owner can unlock" }] },
        { rows: [{ set_config: '{"role":"authenticated"}' }] },
        { rows: [{ finish: "1..1" }] },
      ]),
    ).toEqual(["ok 1 - owner can unlock", "1..1"]);
  });
});
