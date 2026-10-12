"use strict";

// These fingerprints describe fixed defects, not packages to ignore. Changed advisories require review.
const REVIEWED_ADVISORIES = {
  braces: {
    id: "GHSA-vfj7-8cjw-p6xm",
    title: "braces vulnerable to stack-exhaustion denial of service through deeply nested patterns",
    range: "<=3.0.3",
  },
  "node-forge": {
    id: "GHSA-86w9-cpqp-85rv",
    title: "node-forge RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm elements",
    range: "<=1.4.0",
  },
};

// Cold npm caches can propose replacing the surrounding stack instead of a
// patched package. These exact alternatives were reviewed; other proposals fail.
const REVIEWED_ANCESTOR_FIXES = {
  braces: { name: "jest", version: "30.5.2", isSemVerMajor: true },
  "node-forge": { name: "expo", version: "44.0.6", isSemVerMajor: true },
};

/** Accept only reviewed resolver suggestions backed by an unchanged live release catalog. */
function hasReviewedFixDisposition(dependency, vulnerability, patch, upstreamVersions) {
  const suggestion = vulnerability.fixAvailable;
  if (suggestion === false) return true;
  if (upstreamVersions?.get(dependency) !== patch?.version) return false;
  if (suggestion === true) return true;
  const ancestor = REVIEWED_ANCESTOR_FIXES[dependency];
  return Boolean(ancestor && suggestion && typeof suggestion === "object"
    && Object.keys(suggestion).length === 3
    && Object.entries(ancestor).every(([key, value]) => suggestion[key] === value));
}

/** Match one precise advisory only after the caller has verified every installed source patch. */
function isPatchedAdvisory(dependency, advisory, vulnerability, verified, upstreamVersions) {
  const reviewed = REVIEWED_ADVISORIES[dependency];
  const patch = verified.find((item) => item.name === dependency && item.advisory === reviewed?.id);
  return Boolean(reviewed && patch && advisory.name === dependency
    && (advisory.dependency === undefined || advisory.dependency === dependency)
    && advisory.url === `https://github.com/advisories/${reviewed.id}`
    && advisory.title === reviewed.title && advisory.range === reviewed.range
    && advisory.severity === "high"
    && hasReviewedFixDisposition(dependency, vulnerability, patch, upstreamVersions)
    && Array.isArray(vulnerability.nodes) && vulnerability.nodes.length > 0
    && new Set(vulnerability.nodes).size === vulnerability.nodes.length
    && vulnerability.nodes.every((node) => patch.nodes.includes(node)));
}

/** Distinguish verified source remediation from a clean registry audit without hiding new findings. */
function assessRemediations(audit, verified, upstreamVersions) {
  const vulnerabilities = audit.vulnerabilities;
  const remediated = [];
  const unresolved = [];
  const concrete = new Set();
  for (const [dependency, vulnerability] of Object.entries(vulnerabilities)) {
    if (!vulnerability.via.length) unresolved.push(`${dependency}: missing advisory provenance`);
    for (const via of vulnerability.via) {
      if (typeof via === "string") {
        if (!Object.hasOwn(vulnerabilities, via)) unresolved.push(`${dependency}: unknown advisory dependency ${via}`);
      } else if (via && typeof via === "object") {
        concrete.add(dependency);
        if (isPatchedAdvisory(dependency, via, vulnerability, verified, upstreamVersions)) {
          remediated.push({ dependency, title: via.title, url: via.url,
            reviewedSuggestion: vulnerability.fixAvailable === false ? null : vulnerability.fixAvailable });
        } else if (REVIEWED_ADVISORIES[dependency] && vulnerability.fixAvailable) {
          unresolved.push(`${dependency}: npm reports an unreviewed remediation proposal; review the local backport and proposed dependency tree.`);
        } else unresolved.push(`${dependency}: ${via.title ?? "unrecognized advisory"} (${via.url ?? "no advisory URL"})`);
      } else unresolved.push(`${dependency}: invalid advisory provenance`);
    }
  }
  /** Cycles in npm's propagated graph are valid only when they lead to a concrete advisory. */
  function hasConcreteOrigin(dependency, visited = new Set()) {
    if (concrete.has(dependency)) return true;
    if (visited.has(dependency)) return false;
    visited.add(dependency);
    return (vulnerabilities[dependency]?.via ?? []).some((via) => typeof via === "string" && hasConcreteOrigin(via, visited));
  }
  for (const dependency of Object.keys(vulnerabilities)) {
    if (!hasConcreteOrigin(dependency)) unresolved.push(`${dependency}: no concrete advisory origin`);
  }
  return { remediated, unresolved };
}

module.exports = { assessRemediations, isPatchedAdvisory, REVIEWED_ADVISORIES, REVIEWED_ANCESTOR_FIXES };
