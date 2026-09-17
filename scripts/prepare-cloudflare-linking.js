const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { repository, assetFiles, productionConfig, renderPage, securityHeaders } = require("./voice-linking-assets");

const usage = "Usage: npm run prepare:voice-linking:cloudflare -- --project-ref <approved-project-ref> --site-origin https://<approved-linking-host> --account-id <approved-cloudflare-account-id> --worker-name <new-approved-worker-name>";
const outputDirectory = path.join(repository, "voice-linking-cloudflare");

function configuration(args) {
  const flags = ["--project-ref", "--site-origin", "--account-id", "--worker-name"];
  if (args.length !== flags.length * 2 || flags.some((flag, index) => args[index * 2] !== flag)) {
    throw new Error(usage);
  }
  const page = productionConfig(args[1], args[3]);
  const accountId = args[5];
  const workerName = args[7];
  if (new URL(page.siteOrigin).port) throw new Error("Cloudflare linking requires the standard HTTPS port.");
  if (typeof accountId !== "string" || !/^[a-f0-9]{32}$/.test(accountId)) {
    throw new Error("An explicit Cloudflare account ID is required, not a credential.");
  }
  if (typeof workerName !== "string" || !/^[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(workerName)) {
    throw new Error("Use a lowercase Worker name of 2–63 letters, digits, and internal hyphens.");
  }
  return {
    page,
    worker: {
      name: workerName,
      account_id: accountId,
      compatibility_date: "2026-09-17",
      // Preparation never grants an Internet route. These switches are not
      // authentication: an existing Worker may have independently bound domains.
      workers_dev: false,
      preview_urls: false,
      routes: [],
      send_metrics: false,
      logpush: false,
      observability: { enabled: false, logs: { enabled: false, invocation_logs: false } },
      assets: {
        directory: "./public",
        html_handling: "none",
        not_found_handling: "none",
      },
    },
  };
}

function headersFile(headers) {
  // One rule avoids comma-joining duplicate CSP values. Cloudflare applies
  // this to static responses; platform error/header behavior still needs testing.
  const lines = Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`);
  if (lines.some((line) => line.length > 2000 || /[\r\n]/.test(line))) {
    throw new Error("Invalid static header configuration.");
  }
  return `/*\n${lines.join("\n")}\n`;
}

function inspectOutput(target, shape) {
  let stat;
  try { stat = fs.lstatSync(target); } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error("Linking output must not contain symbolic links.");
  if (shape === null) {
    if (!stat.isFile() || stat.nlink !== 1) throw new Error("Linking output must contain only unlinked regular files.");
    return;
  }
  if (!stat.isDirectory()) throw new Error("Linking output must use dedicated directories.");
  for (const name of fs.readdirSync(target)) {
    if (!Object.hasOwn(shape, name)) throw new Error("Unexpected linking output files require review; nothing was overwritten.");
    inspectOutput(path.join(target, name), shape[name]);
  }
}

function prepare(args, target = outputDirectory) {
  const config = configuration(args);
  const headers = securityHeaders(new URL(config.page.api).origin);
  const sources = ["web/voice-linking/index.html", ...Object.values(assetFiles).map(([source]) => source)];
  for (const source of sources) {
    // Validate parent directories too, so a linked folder cannot redirect an
    // allowlisted asset outside the repository.
    const parts = source.split("/");
    let current = repository;
    for (const [index, part] of parts.entries()) {
      current = path.join(current, part);
      const stat = fs.lstatSync(current);
      const leaf = index === parts.length - 1;
      if (stat.isSymbolicLink() || (leaf ? !stat.isFile() || stat.size > 25 * 1024 * 1024 : !stat.isDirectory())) {
        throw new Error("Invalid linking source asset.");
      }
    }
  }
  const files = {
    "index.html": renderPage(config.page),
    "_headers": headersFile(headers),
  };
  for (const [destination, [source]] of Object.entries(assetFiles)) {
    files[destination.slice(1)] = fs.readFileSync(path.join(repository, source));
  }
  const readiness = {
    status: "prepared-only-not-published",
    siteOrigin: config.page.siteOrigin,
    // Disabling HTML handling deliberately removes implicit / -> index.html.
    authorizationUrl: `${config.page.siteOrigin}/index.html`,
    apiEndpoint: config.page.api,
    requiredStaticHeaders: headers,
    outstandingChecks: [
      "Approve the new standalone Worker identity, account, plan eligibility, and canonical HTTPS origin.",
      "Inspect existing domain bindings before any deployment; disabled generated URLs do not remove existing routes.",
      "Approve query/body logging, retention, and integrations across the host and Supabase; disabled Worker logs alone are not proof.",
      "Verify the actual asset responses, redirects, unknown paths, unsupported methods, and platform errors on the approved host.",
      "Deploy the matching API and exact VOICE_LINKING_ORIGIN only to the approved Supabase environment.",
      "Verify the client-IP trust boundary without weakening fail-closed rate protection.",
      "Complete hosted synthetic browser linking before real credentials/provider linking; independent review and physical gates remain open.",
    ],
  };
  const shape = {
    "wrangler.json": null,
    "readiness.json": null,
    public: Object.fromEntries(Object.keys(files).map((name) => [name, null])),
  };
  // Inspect the entire existing tree before replacing any known generated file.
  // Do not recursively clean, copy a previous export, read .env, or invoke a CLI.
  inspectOutput(target, shape);
  fs.mkdirSync(path.join(target, "public"), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(target, "public", name), content);
  }
  fs.writeFileSync(path.join(target, "wrangler.json"), `${JSON.stringify(config.worker, null, 2)}\n`);
  fs.writeFileSync(path.join(target, "readiness.json"), `${JSON.stringify(readiness, null, 2)}\n`);
  return target;
}

if (require.main === module) {
  try {
    prepare(process.argv.slice(2));
    console.log("Prepared isolated Cloudflare assets and headers. Not published; account, origin, logging, and hosted verification gates remain open.");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { configuration, headersFile, prepare };
