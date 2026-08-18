#!/usr/bin/env node

const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
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

function main() {
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
  const result = spawnSync(
    "supabase",
    ["test", "db", ...tests, "--db-url", databaseUrl],
    { stdio: "inherit" },
  );
  if (result.error) {
    console.error("Unable to start the Supabase database test runner.");
    process.exitCode = 1;
    return;
  }
  process.exitCode = result.status ?? 1;
}

if (require.main === module) main();

module.exports = { projectRefFromUrl, validateRemoteTestTarget };
