const {
  concreteAdvisories,
  main,
  readAuditResult,
} = require("./check-dependency-security.js");
const { spawnSync } = require("node:child_process");

jest.mock("node:child_process", () => ({ spawnSync: jest.fn() }));

/** Exercise the CLI gate without network calls or leaking exit state into Jest. */
function auditExitCode(report: unknown, status = 0): number {
  const previousExitCode = process.exitCode;
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    process.exitCode = undefined;
    spawnSync.mockReturnValue({ status, stdout: JSON.stringify(report) });
    main();
    return Number(process.exitCode ?? 0);
  } finally {
    process.exitCode = previousExitCode;
    log.mockRestore();
    error.mockRestore();
    spawnSync.mockReset();
  }
}

const vulnerableAudit = {
  auditReportVersion: 2,
  vulnerabilities: {
    "image-size": {
      via: [
        {
          title: "ICNS parser denial of service",
          url: "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
        },
        {
          title: "JXL and HEIF parser denial of service",
          url: "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
        },
      ],
    },
    metro: { via: ["image-size"] },
  },
};

describe("dependency security audit", () => {
  test("reports previously accepted advisories and excludes propagated duplicates", () => {
    const audit = readAuditResult({ status: 1, stdout: JSON.stringify(vulnerableAudit) });
    expect(concreteAdvisories(audit)).toEqual([
      expect.objectContaining({
        dependency: "image-size", url: vulnerableAudit.vulnerabilities["image-size"].via[0].url,
      }),
      expect.objectContaining({
        dependency: "image-size", url: vulnerableAudit.vulnerabilities["image-size"].via[1].url,
      }),
    ]);
  });

  test("accepts a completed clean audit report", () => {
    const audit = { auditReportVersion: 2, vulnerabilities: {} };
    expect(readAuditResult({ status: 0, stdout: JSON.stringify(audit) })).toEqual(audit);
    expect(concreteAdvisories(audit)).toEqual([]);
    expect(auditExitCode(audit)).toBe(0);
  });

  test("fails the CLI for either previously exempted advisory", () => {
    for (const advisory of vulnerableAudit.vulnerabilities["image-size"].via) {
      expect(auditExitCode({
        auditReportVersion: 2,
        vulnerabilities: { "image-size": { via: [advisory] } },
      }, 1)).toBe(1);
    }
  });

  test("fails the CLI even when npm provides only a propagated finding or a failing exit code", () => {
    expect(auditExitCode({
      auditReportVersion: 2,
      vulnerabilities: { metro: { via: ["image-size"] } },
    })).toBe(1);
    expect(auditExitCode({ auditReportVersion: 2, vulnerabilities: {} }, 1)).toBe(1);
  });

  test.each([
    { status: null, error: new Error("Unable to start npm") },
    { status: null, signal: "SIGTERM" },
    { status: 2 },
  ])("fails closed when the audit process cannot complete: %j", (result) => {
    expect(() => readAuditResult({ ...result, stdout: "{}" })).toThrow("could not complete");
  });

  test.each([
    "not json",
    JSON.stringify(null),
    JSON.stringify({ error: { summary: "registry unavailable" } }),
    JSON.stringify({}),
    JSON.stringify({ auditReportVersion: 1, vulnerabilities: {} }),
    JSON.stringify({ auditReportVersion: 2, vulnerabilities: [] }),
    JSON.stringify({ auditReportVersion: 2, vulnerabilities: { metro: {} } }),
  ])("rejects an invalid or unavailable audit report: %s", (stdout) => {
    expect(() => readAuditResult({ status: 0, stdout })).toThrow();
  });
});
