#!/usr/bin/env node

const fs = require("node:fs");
const { Client } = require("pg");
const { readLocalEnv } = require("./check-supabase-readiness.js");

function projectRefFromUrl(value) {
  try {
    const parsed = new URL(value);
    const directHost = parsed.hostname.match(
      /^(?:db\.)?([a-z0-9]{20})\.supabase\.co$/,
    );
    if (directHost) return directHost[1];

    // Supavisor pooler hosts are shared, so the project ref is carried in the
    // database username instead of the hostname.
    return decodeURIComponent(parsed.username).match(
      /^postgres\.([a-z0-9]{20})$/,
    )?.[1];
  } catch {
    return undefined;
  }
}

function validateRemoteTestTarget({ databaseUrl, appUrl, confirmation }) {
  if (confirmation !== "true") {
    throw new Error(
      "Set VANTAHOME_DISPOSABLE_DB_CONFIRMED=true only for a disposable database.",
    );
  }

  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("SUPABASE_DB_URL must be a valid PostgreSQL URL.");
  }
  if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
    throw new Error("SUPABASE_DB_URL must use postgres:// or postgresql://.");
  }

  const testProjectRef = projectRefFromUrl(databaseUrl);
  const appProjectRef = projectRefFromUrl(appUrl);
  if (!testProjectRef || !appProjectRef) {
    throw new Error(
      "Both database and app URLs must identify distinct Supabase projects.",
    );
  }
  if (testProjectRef === appProjectRef) {
    throw new Error("Refusing to run database tests against the active app project.");
  }
}

function tapLinesFromQueryResult(result) {
  const results = Array.isArray(result) ? result : [result];
  return results.flatMap(({ rows = [] }) =>
    rows.flatMap((row) =>
      Object.values(row).flatMap((value) => typeof value === "string" ? value.split(/\r?\n/) : []).filter(
        (value) =>
          typeof value === "string" &&
          (/^(?:not )?ok\b/.test(value) || /^1\.\.\d+$/.test(value) || /^Bail out!/i.test(value)),
      ),
    ),
  );
}

function validateTapLines(tapLines) {
  const plans = tapLines.filter((line) => /^1\.\.\d+$/.test(line));
  const assertions = tapLines.filter((line) => /^(?:not )?ok\b/.test(line));
  if (plans.length !== 1) throw new Error("Expected exactly one pgTAP plan.");
  const planned = Number(plans[0].slice(3));
  if (planned < 1 || planned !== assertions.length) {
    throw new Error("pgTAP assertion count does not match its plan.");
  }
  if (tapLines.some((line) => line.startsWith("not ok") || /^Bail out!/i.test(line))) {
    throw new Error("pgTAP reported a failure or bailout.");
  }
  assertions.forEach((line, index) => {
    if (Number(line.match(/^ok (\d+)\b/)?.[1]) !== index + 1) {
      throw new Error("pgTAP assertion numbering is incomplete or duplicated.");
    }
  });
}

function databaseClientOptions(databaseUrl, ca) {
  const url = new URL(databaseUrl);
  // pg URL SSL options can replace the SSL object. Keep verification explicit
  // and accept a project CA separately, never an insecure fallback.
  for (const key of url.searchParams.keys()) {
    if (/^ssl|^uselibpqcompat$/i.test(key)) {
      if (key !== "sslmode" || url.searchParams.get(key) !== "verify-full") {
        throw new Error("Database URL SSL options must use sslmode=verify-full only.");
      }
    }
  }
  url.searchParams.delete("sslmode");
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } };
}

async function runSqlTest(databaseUrl, path) {
  const caPath = process.env.SUPABASE_DB_CA_FILE;
  const client = new Client(databaseClientOptions(databaseUrl, caPath ? fs.readFileSync(caPath, "utf8") : undefined));
  try {
    await client.connect();
    const result = await client.query(fs.readFileSync(path, "utf8"));
    const tapLines = tapLinesFromQueryResult(result);
    tapLines.forEach((line) => console.log(line));
    validateTapLines(tapLines);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const localEnv = readLocalEnv();
  const databaseUrl = process.env.SUPABASE_DB_URL ?? "";
  const appUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    localEnv.EXPO_PUBLIC_SUPABASE_URL ??
    "";
  try {
    validateRemoteTestTarget({
      databaseUrl,
      appUrl,
      confirmation: process.env.VANTAHOME_DISPOSABLE_DB_CONFIRMED,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unsafe database target.");
    process.exitCode = 1;
    return;
  }

  const tests = fs
    .readdirSync("supabase/tests")
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => `supabase/tests/${name}`);
  try {
    for (const path of tests) {
      console.log(`Running ${path}`);
      await runSqlTest(databaseUrl, path);
    }
    console.log(`${tests.length} remote pgTAP files passed.`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Remote database tests failed.",
    );
    process.exitCode = 1;
  }
}

if (require.main === module) void main();

module.exports = {
  projectRefFromUrl,
  tapLinesFromQueryResult,
  validateRemoteTestTarget,
  databaseClientOptions,
  validateTapLines,
};
