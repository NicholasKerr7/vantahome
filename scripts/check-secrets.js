const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const TOKEN_PATTERNS = [
  ["private key", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{20,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/],
  [
    "credentialed database URL",
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/:]+:[^\s/@]+@/i,
  ],
];

const SENSITIVE_NAME =
  /(?:SERVICE_ROLE(?:_KEY)?|PRIVATE_KEY|DATABASE_URL|DB_URL|CLIENT_SECRET|AUTH_TOKEN|ACCESS_TOKEN|API_SECRET|PASSWORD|_SECRET|_TOKEN|_PASSWORD)$/i;
const ENV_ASSIGNMENT =
  /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*["']?([^\s"'#]+)["']?/;
const JSON_ASSIGNMENT =
  /["']([^"']+)["']\s*:\s*["']([^"']+)["']/g;

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes("...") ||
    normalized === "changeme" ||
    normalized === "replace-me" ||
    normalized.startsWith("your-") ||
    normalized.startsWith("example") ||
    normalized.startsWith("<") ||
    normalized.includes("${")
  );
}

function scanText(text, location) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const [type, pattern] of TOKEN_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ location, line: index + 1, type });
      }
    }

    const envMatch = line.match(ENV_ASSIGNMENT);
    if (
      envMatch &&
      SENSITIVE_NAME.test(envMatch[1]) &&
      !isPlaceholder(envMatch[2])
    ) {
      findings.push({
        location,
        line: index + 1,
        type: `literal value assigned to ${envMatch[1]}`,
      });
    }

    JSON_ASSIGNMENT.lastIndex = 0;
    for (const match of line.matchAll(JSON_ASSIGNMENT)) {
      if (SENSITIVE_NAME.test(match[1]) && !isPlaceholder(match[2])) {
        findings.push({
          location,
          line: index + 1,
          type: `literal value assigned to ${match[1]}`,
        });
      }
    }
  }
  return findings;
}

function trackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error("Unable to list tracked files.");
  }
  return result.stdout.split("\0").filter(Boolean);
}

function scanTrackedFiles() {
  const findings = [];
  for (const path of trackedFiles()) {
    if (
      /(^|\/)\.env(?:\.|$)/.test(path) &&
      !/(^|\/)\.env\.example$/.test(path)
    ) {
      findings.push({ location: path, line: 1, type: "tracked env file" });
    }
    if (/\.(?:pem|key|p12|pfx|keystore|mobileprovision)$/i.test(path)) {
      findings.push({ location: path, line: 1, type: "tracked key material" });
    }

    const contents = readFileSync(path);
    if (!contents.includes(0)) {
      findings.push(...scanText(contents.toString("utf8"), path));
    }
  }
  return findings;
}

function scanHistory() {
  const result = spawnSync(
    "git",
    ["log", "-p", "--all", "--full-history", "--no-color", "--format="],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error("Unable to scan Git history.");
  }
  return scanText(result.stdout, "Git history");
}

function uniqueFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.location}:${finding.line}:${finding.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function main() {
  const includeHistory = process.argv.includes("--history");
  const findings = uniqueFindings([
    ...scanTrackedFiles(),
    ...(includeHistory ? scanHistory() : []),
  ]);
  if (findings.length) {
    console.error("Potential secrets found (values intentionally redacted):");
    for (const finding of findings) {
      console.error(`- ${finding.location}:${finding.line} — ${finding.type}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    `Secret scan passed for tracked files${includeHistory ? " and Git history" : ""}.`,
  );
}

if (require.main === module) main();

module.exports = { isPlaceholder, scanText, uniqueFindings };
