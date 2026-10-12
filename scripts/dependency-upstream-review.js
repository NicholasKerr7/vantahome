"use strict";

const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Official npm catalogs reviewed on 2026-10-12. Any newly published version,
// including a prerelease or an older-line backport, requires a fresh review.
const REVIEWED_RELEASES = {
  braces: { version: "3.0.3", versionsHash: "315f66a372d392e77e89af09ff264a245b37f057e2c4027d34c573afc41c8707" },
  "node-forge": { version: "1.4.0", versionsHash: "1b118396be51afac017fc95a2d44ba78d0c8117266379bf9bf9a9a4658698438" },
};

/** Verify fresh registry evidence against the complete reviewed release catalog, not just latest. */
function readReviewedReleaseCatalog(result, name, reviewed) {
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`Cannot verify published ${name} releases; the upstream review remains required.`);
  }
  let release;
  try { release = JSON.parse(result.stdout); }
  catch { throw new Error(`Invalid published-release response for ${name}.`); }
  if (!release || release.name !== name || release.version !== reviewed.version
    || !Array.isArray(release.versions) || !release.versions.length
    || !release.versions.every((version) => typeof version === "string")
    || new Set(release.versions).size !== release.versions.length
    || !release.versions.includes(reviewed.version)) {
    throw new Error(`Published ${name} release metadata changed or is incomplete; review the backport.`);
  }
  const hash = createHash("sha256").update(JSON.stringify([...release.versions].sort())).digest("hex");
  if (hash !== reviewed.versionsHash) {
    throw new Error(`Published ${name} versions changed; review and replace or retire the local backport.`);
  }
  return reviewed.version;
}

/** Check reported patched dependencies against live official releases, regardless of npm cache-dependent suggestions. */
function verifyUpstreamAvailability(audit, verified) {
  const reviewedVersions = new Map();
  for (const patch of verified) {
    if (!audit.vulnerabilities[patch.name]) continue;
    const reviewed = REVIEWED_RELEASES[patch.name];
    if (!reviewed || reviewed.version !== patch.version) throw new Error(`Missing upstream review for ${patch.name}.`);
    // npm may serve a stale entry after a failed revalidation. A new empty cache
    // and explicit online flags make network failure fail closed instead.
    const cache = mkdtempSync(path.join(os.tmpdir(), "vantahome-upstream-review-"));
    try {
      const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", [
        "view", patch.name, "name", "version", "versions", "--json", "--prefer-online",
        "--offline=false", "--prefer-offline=false", `--cache=${cache}`,
        "--registry=https://registry.npmjs.org", "--fetch-retries=0", "--fetch-timeout=12000",
      ], { encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024 });
      reviewedVersions.set(patch.name, readReviewedReleaseCatalog(result, patch.name, reviewed));
    } finally { rmSync(cache, { recursive: true, force: true }); }
  }
  return reviewedVersions;
}

module.exports = { readReviewedReleaseCatalog, verifyUpstreamAvailability, REVIEWED_RELEASES };
