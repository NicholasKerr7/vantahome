#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const ACCEPTED_ADVISORIES = new Set([
  "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
  "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
]);

function concreteAdvisories(audit) {
  return Object.entries(audit?.vulnerabilities ?? {}).flatMap(
    ([dependency, vulnerability]) =>
      (vulnerability.via ?? [])
        .filter((item) => typeof item === "object" && item !== null)
        .map((item) => ({ dependency, ...item })),
  );
}

function unexpectedAdvisories(audit) {
  return concreteAdvisories(audit).filter(
    ({ dependency, url }) =>
      dependency !== "image-size" || !ACCEPTED_ADVISORIES.has(url),
  );
}

function main() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
  });

  let audit;
  try {
    audit = JSON.parse(result.stdout);
  } catch {
    console.error("Dependency audit did not return valid JSON.");
    if (result.stderr) console.error(result.stderr.trim());
    process.exitCode = 1;
    return;
  }

  if (audit.error) {
    console.error(
      `Dependency audit failed: ${audit.error.summary ?? "unknown npm audit error"}`,
    );
    process.exitCode = 1;
    return;
  }

  const unexpected = unexpectedAdvisories(audit);
  if (unexpected.length > 0) {
    console.error("Unaccepted production dependency advisories found:");
    unexpected.forEach(({ dependency, title, url }) =>
      console.error(`- ${dependency}: ${title} (${url})`),
    );
    process.exitCode = 1;
    return;
  }

  const accepted = concreteAdvisories(audit).filter(({ url }) =>
    ACCEPTED_ADVISORIES.has(url),
  );
  console.log(
    `Dependency audit passed; ${accepted.length} documented image-size advisories remain accepted.`,
  );
}

if (require.main === module) main();

module.exports = {
  ACCEPTED_ADVISORIES,
  concreteAdvisories,
  unexpectedAdvisories,
};
