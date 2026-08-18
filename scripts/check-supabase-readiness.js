#!/usr/bin/env node

const fs = require("fs");

const REQUIRED_TABLES = [
  "homes",
  "home_members",
  "rooms",
  "room_members",
  "devices",
  "device_state",
  "home_invites",
  "device_audit_logs",
  "device_commands",
  "member_permission_overrides",
];

const REQUIRED_FUNCTIONS = [
  "home-bootstrap",
  "device-command",
  "device-state",
  "device-state-batch",
  "device-audit",
  "home-invite",
  "home-invite-respond",
  "voice-authorize",
  "voice-token",
  "alexa-smart-home",
  "google-smart-home",
];

function readLocalEnv(path = ".env") {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const name = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [name, value];
      }),
  );
}

function publicConfig() {
  const local = readLocalEnv();
  const url =
    process.env.EXPO_PUBLIC_SUPABASE_URL || local.EXPO_PUBLIC_SUPABASE_URL;
  const key =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    local.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY first.",
    );
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("Supabase readiness checks require an HTTPS project URL.");
  }
  return { baseUrl: parsed.origin, host: parsed.host, key };
}

async function statusFor(url, init) {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
    return response.status;
  } catch {
    return 0;
  }
}

async function checkReadiness() {
  const { baseUrl, host, key } = publicConfig();
  // The publishable key is intentionally used exactly as the mobile SDK uses
  // it. The check never prints the key or requests privileged service data.
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const tables = await Promise.all(
    REQUIRED_TABLES.map(async (name) => ({
      name,
      status: await statusFor(
        `${baseUrl}/rest/v1/${encodeURIComponent(name)}?select=*&limit=0`,
        { headers },
      ),
    })),
  );
  const functions = await Promise.all(
    REQUIRED_FUNCTIONS.map(async (name) => ({
      name,
      status: await statusFor(`${baseUrl}/functions/v1/${name}`, {
        method: "OPTIONS",
        headers: { apikey: key, Origin: "https://localhost" },
      }),
    })),
  );
  return { host, tables, functions };
}

function isDeployedStatus(status) {
  // PostgREST proves a protected relation exists with 401/403 even though the
  // publishable-key probe is intentionally not allowed to read its rows.
  return (status >= 200 && status < 300) || status === 401 || status === 403;
}

function isReady(result) {
  return [...result.tables, ...result.functions].every(
    ({ status }) => isDeployedStatus(status),
  );
}

function printReport(result) {
  console.log(`Supabase project: ${result.host}`);
  for (const [label, entries] of [
    ["Tables", result.tables],
    ["Edge Functions", result.functions],
  ]) {
    console.log(`${label}:`);
    entries.forEach(({ name, status }) => {
      const marker =
        status === 401 || status === 403
          ? "ready (access protected)"
          : isDeployedStatus(status)
            ? "ready"
            : "missing";
      console.log(`  ${name}: ${marker} (HTTP ${status || "unreachable"})`);
    });
  }
  console.log(`Overall: ${isReady(result) ? "ready" : "not ready"}`);
}

if (require.main === module) {
  checkReadiness()
    .then((result) => {
      if (process.argv.includes("--json")) {
        console.log(JSON.stringify({ ...result, ready: isReady(result) }));
      } else {
        printReport(result);
      }
      if (!isReady(result)) process.exitCode = 1;
    })
    .catch(() => {
      console.error("Supabase readiness check failed.");
      process.exitCode = 1;
    });
}

module.exports = {
  REQUIRED_FUNCTIONS,
  REQUIRED_TABLES,
  isDeployedStatus,
  isReady,
  readLocalEnv,
};
