#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

/** Report concrete advisories once, excluding npm's propagated package names. */
function concreteAdvisories(audit) {
  return Object.entries(audit?.vulnerabilities ?? {}).flatMap(
    ([dependency, vulnerability]) =>
      (vulnerability.via ?? [])
        .filter((item) => typeof item === "object" && item !== null)
        .map((item) => ({ dependency, ...item })),
  );
}

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

/** Require a completed, clean production audit; no advisory exceptions remain. */
function main() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    timeout: 60000,
  });
  try {
    const audit = readAuditResult(result);
    if (result.status !== 0 || Object.keys(audit.vulnerabilities).length > 0) {
      console.error("Production dependency vulnerabilities found; none are accepted:");
      concreteAdvisories(audit).forEach(({ dependency, title, url }) =>
        console.error(`- ${dependency}: ${title} (${url})`),
      );
      process.exitCode = 1;
      return;
    }
    console.log("Dependency audit passed; no production vulnerabilities found.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  concreteAdvisories,
  main,
  readAuditResult,
};
