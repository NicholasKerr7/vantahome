const {
  main,
  readAuditResult,
} = require("./check-dependency-security.js");
const { spawnSync } = require("node:child_process");
const { ensureSecurityPatches } = require("./patch-security-dependencies");
const { assessRemediations, REVIEWED_ADVISORIES } = require("./dependency-audit-remediation");

jest.mock("node:child_process", () => ({ spawnSync: jest.fn() }));
jest.mock("./patch-security-dependencies", () => ({ ensureSecurityPatches: jest.fn(() => []) }));

/** Exercise the CLI gate without network calls or leaking exit state into Jest. */
function auditExitCode(report: unknown, status = 0): number {
  const previousExitCode = process.exitCode;
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    process.exitCode = undefined;
    spawnSync.mockImplementation((_command: string, args: string[]) => args[0] === '--test'
      ? { status: 0, stdout: 'security regressions passed' }
      : { status, stdout: JSON.stringify(report) });
    main();
    return Number(process.exitCode ?? 0);
  } finally {
    process.exitCode = previousExitCode;
    log.mockRestore();
    error.mockRestore();
    spawnSync.mockReset();
    ensureSecurityPatches.mockReset().mockReturnValue([]);
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
    expect(assessRemediations(audit, []).unresolved).toEqual([
      expect.stringContaining(vulnerableAudit.vulnerabilities['image-size'].via[0].url),
      expect.stringContaining(vulnerableAudit.vulnerabilities['image-size'].via[1].url),
    ]);
  });

  test("accepts a completed clean audit report", () => {
    const audit = { auditReportVersion: 2, vulnerabilities: {} };
    expect(readAuditResult({ status: 0, stdout: JSON.stringify(audit) })).toEqual(audit);
    expect(assessRemediations(audit, [])).toEqual({ remediated: [], unresolved: [] });
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

/** Build the exact advisory fingerprints independently of their propagated npm dependants. */
function patchedAudit() {
  const vulnerabilities: Record<string, { nodes: string[]; via: unknown[]; fixAvailable?: unknown }> = {};
  const verified = Object.entries(REVIEWED_ADVISORIES).map(([name, value]) => {
    const reviewed = value as { id: string; title: string; range: string };
    const nodes = [`node_modules/${name}`];
    vulnerabilities[name] = { nodes, fixAvailable: false, via: [{ name, dependency: name, title: reviewed.title,
      range: reviewed.range, severity: 'high', url: `https://github.com/advisories/${reviewed.id}` }] };
    return { name, version: name === 'braces' ? '3.0.3' : '1.4.0', advisory: reviewed.id, nodes };
  });
  return { audit: { auditReportVersion: 2, vulnerabilities }, verified };
}

describe('verified local source remediation', () => {
  test('accepts exact advisories only with verified installed copies and prints honest status', () => {
    const { audit, verified } = patchedAudit();
    ensureSecurityPatches.mockReturnValue(verified);
    expect(auditExitCode(audit, 1)).toBe(0);
    expect(assessRemediations(audit, verified)).toMatchObject({ unresolved: [] });
    expect(assessRemediations(audit, verified).remediated).toHaveLength(2);
  });

  test('rejects known advisories when source verification is absent', () => {
    expect(auditExitCode(patchedAudit().audit, 1)).toBe(1);
  });

  test('accepts npm reports that omit the redundant dependency field', () => {
    const { audit, verified } = patchedAudit();
    delete (audit.vulnerabilities.braces.via[0] as { dependency?: string }).dependency;
    expect(assessRemediations(audit, verified).unresolved).toEqual([]);
  });

  test('audits development dependencies as well as production dependencies', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      spawnSync.mockReturnValue({ status: 0, stdout: JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }) });
      main();
      expect(spawnSync).toHaveBeenCalledWith(expect.any(String), ['audit', '--include=dev', '--json'], expect.any(Object));
    } finally { log.mockRestore(); spawnSync.mockReset(); }
  });

  test.each(['title', 'url', 'range', 'name', 'dependency', 'severity'])('rejects a changed advisory %s', (field) => {
    const { audit, verified } = patchedAudit();
    Object.assign(audit.vulnerabilities.braces.via[0] as object, { [field]: 'changed' });
    expect(assessRemediations(audit, verified).unresolved).not.toHaveLength(0);
  });

  test('rejects missing, duplicate, or unverified audit paths', () => {
    for (const nodes of [[], ['node_modules/braces', 'node_modules/braces'], ['node_modules/unknown/node_modules/braces']]) {
      const { audit, verified } = patchedAudit();
      audit.vulnerabilities.braces.nodes = nodes;
      expect(assessRemediations(audit, verified).unresolved).not.toHaveLength(0);
    }
  });

  test('does not hide a second new vulnerability in a patched package', () => {
    const { audit, verified } = patchedAudit();
    audit.vulnerabilities.braces.via.push({ url: 'https://github.com/advisories/NEW', title: 'new flaw' });
    expect(assessRemediations(audit, verified).unresolved).toEqual([expect.stringContaining('new flaw')]);
  });

  test.each([true, { name: 'braces', version: '3.0.4', isSemVerMajor: false }, undefined])('requires review when upstream fix status changes: %j', (fixAvailable) => {
    const { audit, verified } = patchedAudit();
    audit.vulnerabilities.braces.fixAvailable = fixAvailable;
    expect(assessRemediations(audit, verified).unresolved).not.toHaveLength(0);
  });

  test('handles cyclic npm propagation only when all findings have known concrete origins', () => {
    const { audit, verified } = patchedAudit();
    audit.vulnerabilities.expo = { nodes: ['node_modules/expo'], via: ['metro', 'node-forge'] };
    audit.vulnerabilities.metro = { nodes: ['node_modules/metro'], via: ['expo', 'braces'] };
    expect(assessRemediations(audit, verified).unresolved).toEqual([]);
    audit.vulnerabilities.orphanA = { nodes: [], via: ['orphanB'] };
    audit.vulnerabilities.orphanB = { nodes: [], via: ['orphanA'] };
    expect(assessRemediations(audit, verified).unresolved).toEqual([
      'orphanA: no concrete advisory origin', 'orphanB: no concrete advisory origin',
    ]);
  });

  test('rejects missing references, empty provenance and malformed via entries', () => {
    for (const via of [[], ['not-in-report'], [null], [42]]) {
      const { audit, verified } = patchedAudit();
      audit.vulnerabilities.unknown = { nodes: [], via };
      expect(assessRemediations(audit, verified).unresolved.length).toBeGreaterThan(0);
    }
  });

  test('fails before audit if source integrity cannot be verified', () => {
    ensureSecurityPatches.mockImplementationOnce(() => { throw new Error('tampered package'); });
    expect(auditExitCode({ auditReportVersion: 2, vulnerabilities: {} })).toBe(1);
  });

  test('fails if installed attack regressions fail, time out, or cannot launch', () => {
    const previousExitCode = process.exitCode;
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const result of [{ status: 1 }, { status: null, signal: 'SIGTERM' }, { error: new Error('cannot launch') }]) {
        process.exitCode = undefined;
        spawnSync.mockReset().mockReturnValue(result);
        main();
        expect(process.exitCode).toBe(1);
        expect(spawnSync).toHaveBeenCalledTimes(1);
      }
    } finally { process.exitCode = previousExitCode; error.mockRestore(); spawnSync.mockReset(); }
  });
});
