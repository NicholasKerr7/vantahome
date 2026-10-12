const { isPlaceholder, scanText, uniqueFindings } = require("./check-secrets.js");

describe("secret scanner", () => {
  test("detects high-confidence credentials without including their value", () => {
    const token = ["ghp", "abcdefghijklmnopqrstuvwxyz123456"].join("_");
    const findings = scanText(`TOKEN=${token}`, "fixture.env");

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ location: "fixture.env", type: "GitHub token" }),
      ]),
    );
    expect(JSON.stringify(findings)).not.toContain(token);
  });

  test("detects literal sensitive assignments", () => {
    const findings = scanText("SERVICE_ROLE_KEY=not-a-placeholder", "fixture.env");
    expect(findings).toEqual([
      expect.objectContaining({ type: "literal value assigned to SERVICE_ROLE_KEY" }),
    ]);
  });

  test("does not confuse a password visibility label with a credential assignment", () => {
    const label = 'showPassword ? "Hide password" : "Show password"';
    expect(scanText(label, "AuthScreen.tsx")).toEqual([]);
    expect(scanText(`+  ${label}`, "Git history")).toEqual([]);
  });

  test("retains object-member detection including multiple keys and names with spaces", () => {
    const values = ["invented", "fixture"].join("-");
    const source = `const config = { "PASSWORD": "${values}", "AUTH_TOKEN": "${values}" };`;
    expect(scanText(source, "fixture.ts")).toHaveLength(2);
    expect(scanText(`  "Database Password": "${values}",`, "fixture.json")).toHaveLength(1);
  });

  test("detects literal credentials in added and removed historical source lines", () => {
    const value = ["invented", "fixture"].join("-");
    for (const prefix of ["+", "-", " "]) {
      const lines = `${prefix}AUTH_TOKEN=${value}\n${prefix}  "PASSWORD": "${value}"`;
      const findings = scanText(lines, "Git history");
      expect(findings).toHaveLength(2);
      expect(findings.map((finding: { line: number }) => finding.line)).toEqual([1, 2]);
      expect(JSON.stringify(findings)).not.toContain(value);
    }
  });

  test("allows documented placeholders and empty values", () => {
    expect(isPlaceholder("your-token")).toBe(true);
    expect(isPlaceholder("postgresql://...")).toBe(true);
    // Retain this exact historical documentation placeholder because CI scans
    // committed history as well as the current tree.
    expect(isPlaceholder("postgresql://review-database-url")).toBe(true);
    expect(scanText("AUTH_TOKEN=...\nPASSWORD=", ".env.example")).toEqual([]);
  });

  test("does not treat real-looking database URLs as placeholders", () => {
    expect(isPlaceholder("postgresql://database.internal/vantahome")).toBe(false);
    expect(
      scanText(
        "SUPABASE_DB_URL=postgresql://database.internal/vantahome",
        "fixture.env",
      ),
    ).toEqual([
      expect.objectContaining({ type: "literal value assigned to SUPABASE_DB_URL" }),
    ]);
  });

  test("only exempts the reviewed invalid preview fixtures in their historical path", () => {
    const key = ["SUPABASE", "SERVICE_ROLE_KEY"].join("_");
    const path = "scripts/build-ios-preview.test.mjs";
    const source = `+ { "${key}": "synthetic-rejected-value" }`;
    const patch = `diff --git a/${path} b/${path}\n${source}`;
    expect(scanText(patch, "Git history")).toEqual([]);
    expect(scanText(patch.replaceAll(path, "src/config.ts"), "Git history")).toHaveLength(1);
    expect(scanText(source.slice(1), path)).toHaveLength(1);
    expect(scanText(patch.replace("synthetic-rejected-value", "invented-real-value"), "Git history")).toHaveLength(1);
    expect(scanText(patch + "\ndiff --git a/other.ts b/other.ts\n" + source, "Git history")).toHaveLength(1);
    const token = ["ghp", "abcdefghijklmnopqrstuvwxyz123456"].join("_");
    expect(scanText(patch + " " + token, "Git history")).toEqual([
      expect.objectContaining({ type: "GitHub token" }),
    ]);
  });

  test("deduplicates identical findings", () => {
    const finding = { location: "fixture", line: 1, type: "JWT" };
    expect(uniqueFindings([finding, finding])).toEqual([finding]);
  });
});
