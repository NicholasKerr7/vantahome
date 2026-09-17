import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const { configuration, headersFile, prepare } = require("./prepare-cloudflare-linking");
const { repository, assetFiles, productionConfig, renderPage, securityHeaders } = require("./voice-linking-assets");

const project = "a".repeat(20);
const account = "0".repeat(32);
const origin = "https://linking.example.invalid";
const args = ["--project-ref", project, "--site-origin", origin, "--account-id", account, "--worker-name", "vantahome-linking-check"];
const changed = (index: number, value: string) => args.map((item, position) => position === index ? value : item);

describe("Cloudflare linking preparation", () => {
  let fixture: string;
  let output: string;
  beforeEach(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), "vantahome-linking-package-"));
    output = path.join(fixture, "output");
  });
  afterEach(() => {
    jest.restoreAllMocks();
    // Only this test's freshly created fixture directory is removed.
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  test("uses explicit identifiers and produces an assets-only, unexposed configuration", () => {
    const { page, worker } = configuration(args);
    expect(page).toEqual(productionConfig(project, origin));
    expect(worker).toEqual({
      name: "vantahome-linking-check", account_id: account, compatibility_date: "2026-09-17",
      workers_dev: false, preview_urls: false, routes: [], send_metrics: false, logpush: false,
      observability: { enabled: false, logs: { enabled: false, invocation_logs: false } },
      assets: { directory: "./public", html_handling: "none", not_found_handling: "none" },
    });
    expect(worker).not.toHaveProperty("main");
    expect(worker).not.toHaveProperty("vars");
    expect(worker).not.toHaveProperty("build");
  });

  test.each([[], args.slice(0, 6), [...args, "--deploy"], changed(0, "--unknown"), changed(4, "--site-origin")].map((input) => ({ input })))("rejects incomplete, duplicate, or unknown options: $input", ({ input }) => {
    expect(() => prepare(input, output)).toThrow("Usage:");
    expect(fs.existsSync(output)).toBe(false);
  });
  test.each(["", "x".repeat(32), "A".repeat(32), "a".repeat(31), "a".repeat(33), "../account"])("rejects invalid account ID %s", (value) => {
    expect(() => configuration(changed(5, value))).toThrow("account ID");
  });
  test.each(["", "a", "-worker", "worker-", "Worker", "worker_name", "worker/name", "a".repeat(64), "worker\nname"])("rejects unsafe Worker name %s", (value) => {
    expect(() => configuration(changed(7, value))).toThrow("Worker name");
  });
  test.each(["http://link.example.invalid", "https://link.example.invalid:8443", `${origin}/`, "https://localhost", "https://127.0.0.1", `${origin}?next=elsewhere`])("rejects unsupported origin %s", (value) => {
    expect(() => configuration(changed(3, value))).toThrow();
  });
  test("rejects an inferred or malformed Supabase target", () => {
    expect(() => configuration(changed(1, "linked-project"))).toThrow("project reference");
  });

  test("writes one bounded static header rule without wildcard CORS", () => {
    const headers = securityHeaders(`https://${project}.supabase.co`);
    const contents = headersFile(headers);
    expect(contents.split("\n")[0]).toBe("/*");
    expect(contents.match(/^\//gm)).toHaveLength(1);
    for (const [name, value] of Object.entries(headers)) expect(contents).toContain(`  ${name}: ${value}\n`);
    expect(contents).not.toMatch(/Access-Control-|unsafe-inline|unsafe-eval/);
    expect(contents.split("\n").every((line: string) => line.length <= 2000)).toBe(true);
    expect(() => headersFile({ "X-Test": "value\nInjected: yes" })).toThrow();
    expect(() => headersFile({ "X-Test\rInjected": "value" })).toThrow();
    expect(() => headersFile({ "X-Test": "x".repeat(2000) })).toThrow();
  });

  test("packages only exact current assets; metadata stays outside the public directory", () => {
    expect(prepare(args, output)).toBe(output);
    expect(fs.readdirSync(output).sort()).toEqual(["public", "readiness.json", "wrangler.json"]);
    const publicPath = path.join(output, "public");
    expect(fs.readdirSync(publicPath).sort()).toEqual(["_headers", "index.html", "linking.css", "logo.png", "main.js", "protocol.js"]);
    expect(fs.readFileSync(path.join(publicPath, "index.html"), "utf8")).toBe(renderPage(productionConfig(project, origin)));
    for (const [destination, [source]] of Object.entries(assetFiles) as [string, [string, string]][]) {
      expect(fs.readFileSync(path.join(publicPath, destination.slice(1))).equals(fs.readFileSync(path.join(repository, source)))).toBe(true);
    }
    expect(JSON.parse(fs.readFileSync(path.join(output, "wrangler.json"), "utf8"))).toEqual(configuration(args).worker);
    const readiness = JSON.parse(fs.readFileSync(path.join(output, "readiness.json"), "utf8"));
    expect(readiness).toMatchObject({ status: "prepared-only-not-published", authorizationUrl: `${origin}/index.html`, siteOrigin: origin });
    expect(readiness.outstandingChecks.join(" ")).toMatch(/logging/);
    expect(readiness.outstandingChecks.join(" ")).toMatch(/existing domain bindings/);
    expect(prepare(args, output)).toBe(output);
  });

  test.each([".env", "public/.env", "public/old.js", "public/security-headers.json", "public/.assetsignore", ".wrangler/cache"])("refuses unknown leftovers before any overwrite: %s", (relative) => {
    prepare(args, output);
    const generated = path.join(output, "public", "index.html");
    fs.writeFileSync(generated, "preserve-this-existing-content");
    const unexpected = path.join(output, relative);
    fs.mkdirSync(path.dirname(unexpected), { recursive: true });
    fs.writeFileSync(unexpected, "user-owned-fixture");
    expect(() => prepare(args, output)).toThrow("Unexpected linking output");
    expect(fs.readFileSync(generated, "utf8")).toBe("preserve-this-existing-content");
    expect(fs.readFileSync(unexpected, "utf8")).toBe("user-owned-fixture");
  });

  test.each(["", "public", "public/index.html", "public/_headers", "wrangler.json", "readiness.json"])("refuses symbolic links at output path %s", (relative) => {
    const outside = path.join(fixture, "outside");
    fs.writeFileSync(outside, "untouched");
    const target = path.join(output, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(outside, target);
    expect(() => prepare(args, output)).toThrow("symbolic links");
    expect(fs.readFileSync(outside, "utf8")).toBe("untouched");
  });
  test("rejects dangling links rather than treating them as missing directories", () => {
    fs.symlinkSync(path.join(fixture, "missing"), output);
    expect(() => prepare(args, output)).toThrow("symbolic links");
    expect(fs.existsSync(path.join(fixture, "missing"))).toBe(false);
  });
  test("rejects hardlinked files and directories masquerading as generated files", () => {
    fs.mkdirSync(output);
    const outside = path.join(fixture, "outside");
    fs.writeFileSync(outside, "untouched");
    fs.linkSync(outside, path.join(output, "wrangler.json"));
    expect(() => prepare(args, output)).toThrow("unlinked regular files");
    expect(fs.readFileSync(outside, "utf8")).toBe("untouched");
    fs.unlinkSync(path.join(output, "wrangler.json"));
    fs.mkdirSync(path.join(output, "wrangler.json"));
    expect(() => prepare(args, output)).toThrow("unlinked regular files");
  });
  test.each(["web", "web/voice-linking", "assets", "assets/release", "web/voice-linking/index.html", "web/voice-linking/main.js", "assets/release/icon.png"])("refuses linked source asset path %s without writing output", (relative) => {
    const lstat = fs.lstatSync.bind(fs);
    jest.spyOn(fs, "lstatSync").mockImplementation(((target: fs.PathLike) => target === path.join(repository, relative)
      ? { isFile: () => false, isSymbolicLink: () => true, size: 1 } : lstat(target)) as typeof fs.lstatSync);
    expect(() => prepare(args, output)).toThrow("Invalid linking source asset");
    expect(fs.existsSync(output)).toBe(false);
  });
  test("leaves the app deploy target unchanged and ignores generated package files", () => {
    const app = JSON.parse(fs.readFileSync(path.join(repository, "vercel.json"), "utf8"));
    expect(app.outputDirectory).toBe("dist");
    expect(app.buildCommand).toBe("npm run build");
    expect(fs.readFileSync(path.join(repository, ".gitignore"), "utf8")).toContain("voice-linking-cloudflare/");
    expect(JSON.parse(fs.readFileSync(path.join(repository, "tsconfig.json"), "utf8")).exclude).toContain("voice-linking-cloudflare/**");
  });
});
