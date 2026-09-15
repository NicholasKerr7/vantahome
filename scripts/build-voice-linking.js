const fs = require("node:fs");
const path = require("node:path");
const { repository, assetFiles, productionConfig, securityHeaders, renderPage } = require("./voice-linking-assets");

function build(args) {
  if (args.length !== 4 || args[0] !== "--project-ref" || args[2] !== "--site-origin") {
    throw new Error("Usage: npm run build:voice-linking -- --project-ref <approved-project-ref> --site-origin https://<approved-linking-host>");
  }
  // Explicit public identifiers only: never read the phone's .env or infer its
  // project, and never emit an anonymous key, private key, or service credential.
  const config = productionConfig(args[1], args[3]);
  const output = path.join(repository, "voice-linking-dist");
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error("Linking output must not be a symbolic link.");
  fs.mkdirSync(output, { recursive: true });
  const allowed = new Set(["index.html", "security-headers.json", ...Object.keys(assetFiles).map((name) => name.slice(1))]);
  for (const name of fs.readdirSync(output)) {
    if (!allowed.has(name) || !fs.lstatSync(path.join(output, name)).isFile()) {
      throw new Error("Unexpected output files require review; use a clean dedicated linking output directory.");
    }
  }
  fs.writeFileSync(path.join(output, "index.html"), renderPage(config));
  for (const [destination, [source]] of Object.entries(assetFiles)) {
    fs.copyFileSync(path.join(repository, source), path.join(output, destination.slice(1)));
  }
  fs.writeFileSync(path.join(output, "security-headers.json"), JSON.stringify({
    siteOrigin: config.siteOrigin,
    requiredForAllResponses: securityHeaders(new URL(config.api).origin),
    publicationGate: "Do not publish until the host applies these HTTP headers, logging policy is approved, the exact browser origin is configured on the API, and hosted linking is verified.",
  }, null, 2));
  return output;
}
if (require.main === module) {
  try {
    build(process.argv.slice(2));
    console.log("Built isolated voice-linking-dist. Not published; hosting/header/origin approval remains required.");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { build };
