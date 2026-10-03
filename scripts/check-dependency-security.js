#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { ensureSecurityPatches } = require("./patch-security-dependencies");
const { assessRemediations } = require("./dependency-audit-remediation");

/** Reject unavailable or malformed audits instead of mistaking them for a pass. */
function readAuditResult(result) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    throw new Error("Dependency audit could not complete successfully.");
  }
  let audit;
  try {
    audit = JSON.parse(result.stdout);
  } catch {
    throw new Error("Dependency audit did not return valid JSON.");
  }
  if (audit?.error) {
    throw new Error("Dependency audit service reported an error.");
  }
  if (
    audit?.auditReportVersion !== 2 ||
    !audit.vulnerabilities ||
    typeof audit.vulnerabilities !== "object" ||
    Array.isArray(audit.vulnerabilities) ||
    !Object.values(audit.vulnerabilities).every(
      (vulnerability) => vulnerability && Array.isArray(vulnerability.via),
    )
  ) {
    throw new Error("Dependency audit returned an unsupported report.");
  }
  return audit;
}

/** Run attack regressions in a bounded fresh process against the installed dependency bytes. */
function checkSecurityRegressions() {
  const result = spawnSync(process.execPath, ["--test",
    path.join(__dirname, "security-regressions/braces.test.cjs"),
    path.join(__dirname, "security-regressions/node-forge.test.cjs"),
  ], { encoding: "utf8", timeout: 45000, maxBuffer: 2 * 1024 * 1024, cwd: path.resolve(__dirname, "..") });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`Installed security patch regressions failed.\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
}

/** Fail on unknown findings; explicitly distinguish source-patched advisories from a clean npm audit. */
function main() {
  try {
    const verified = ensureSecurityPatches({ checkOnly: true });
    checkSecurityRegressions();
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(npmCommand, ["audit", "--include=dev", "--json"], {
      encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024,
      cwd: path.resolve(__dirname, ".."),
    });
    const audit = readAuditResult(result);
    const { remediated, unresolved } = assessRemediations(audit, verified);
    if (unresolved.length || (result.status !== 0 && !Object.keys(audit.vulnerabilities).length)) {
      console.error("Unremediated dependency findings (including development tooling):");
      unresolved.forEach((finding) => console.error(`- ${finding}`));
      if (!unresolved.length) console.error("- npm audit returned a failing exit code without advisory details.");
      process.exitCode = 1;
      return;
    }
    if (remediated.length) {
      console.log("Dependency source verification passed; all reported defects have verified local patches.");
      console.log("Registry audit still reports these versions. They are locally remediated, not upstream-fixed:");
      remediated.forEach(({ dependency, url }) => console.log(`- ${dependency}: installed hashes and attack regressions verified (${url}).`));
    } else console.log("Dependency audit passed; no vulnerabilities found, including development tooling.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  checkSecurityRegressions,
  main,
  readAuditResult,
};
