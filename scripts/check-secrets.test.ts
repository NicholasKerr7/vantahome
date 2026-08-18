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

  test("allows documented placeholders and empty values", () => {
    expect(isPlaceholder("your-token")).toBe(true);
    expect(isPlaceholder("postgresql://...")).toBe(true);
    expect(scanText("AUTH_TOKEN=...\nPASSWORD=", ".env.example")).toEqual([]);
  });

  test("deduplicates identical findings", () => {
    const finding = { location: "fixture", line: 1, type: "JWT" };
    expect(uniqueFindings([finding, finding])).toEqual([finding]);
  });
});
