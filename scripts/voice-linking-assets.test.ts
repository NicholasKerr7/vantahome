import fs from "node:fs";
import path from "node:path";
const { productionConfig, securityHeaders, renderPage, assetFiles } = require("./voice-linking-assets");
const { build } = require("./build-voice-linking");

const project = "a".repeat(20);
const site = "https://link.example.test";
const api = `https://${project}.supabase.co`;

describe("isolated voice linking build", () => {
  test("requires explicit public target values and pins the API path", () => {
    expect(productionConfig(project, site)).toEqual({
      api: `${api}/functions/v1/voice-authorize?format=json`, siteOrigin: site, preview: false,
    });
    expect(() => build([])).toThrow("Usage:");
    expect(() => build(["--project-ref", project])).toThrow("Usage:");
  });
  test.each([undefined, "", "A".repeat(20), "a".repeat(19), "a".repeat(21), "https://other.example", "x/../../x"])("rejects invalid project reference %s", (value) => {
    expect(() => productionConfig(value, site)).toThrow();
  });
  test.each([
    undefined, "", "http://link.example.test", `${site}/`, `${site}/path`, `${site}?secret=x`, `${site}#part`,
    "https://user:password@link.example.test", "https://localhost", "https://localhost.", "https://dev.localhost.",
    "https://127.0.0.1", "https://[::1]", "https://LINK.example.test", " https://link.example.test",
  ])("rejects unsafe or noncanonical page origin %s", (value) => {
    expect(() => productionConfig(project, value)).toThrow();
  });
  test("builds a password-bearing document without inline code or request-derived endpoints", () => {
    const page = renderPage(productionConfig(project, site));
    expect(page).toContain(`${api}/functions/v1/voice-authorize?format=json`);
    expect(page).toContain(`name="vanta-linking-origin" content="${site}"`);
    expect(page).toContain('name="vanta-linking-preview" content="false"');
    expect(page).not.toMatch(/__VANTA_|<style\b|on(?:click|load|error)=/i);
    expect(page).toContain('<script type="module" src="./main.js"></script>');
    expect(page).toContain('<form id="link-form" hidden>');
    expect(page).toContain('<label for="email">');
    expect(page).toContain('<label for="password">');
    expect(page).toContain('type="button" aria-controls="password"');
  });
  test("uses the supplied release icon and a small allowlist of static assets", () => {
    expect(assetFiles["/logo.png"][0]).toBe("assets/release/icon.png");
    expect(Object.keys(assetFiles).sort()).toEqual(["/linking.css", "/logo.png", "/main.js", "/protocol.js"]);
  });
  test("requires host-applied no-store CSP and no framing or native form posts", () => {
    const headers = securityHeaders(api);
    expect(headers["Content-Security-Policy"]).toBe([
      "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self'", `connect-src ${api}`,
      "base-uri 'none'", "frame-ancestors 'none'", "form-action 'none'", "object-src 'none'",
    ].join("; "));
    expect(headers["Cache-Control"]).toBe("no-store");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=");
  });
  test.each(["https://untrusted.example.test", `${api}:8443`, `${api}/path`, "http://127.0.0.1:8000", "https://localhost", "https://a.supabase.co"])("does not permit an arbitrary password destination %s", (origin) => {
    expect(() => securityHeaders(origin)).toThrow();
  });
  test("permits literal loopback only in clearly marked preview configuration", () => {
    const config = { api: "http://127.0.0.1:8123/api/voice-authorize?format=json", siteOrigin: "http://127.0.0.1:8124", preview: true };
    expect(renderPage(config)).toContain('name="vanta-linking-preview" content="true"');
    expect(securityHeaders("http://127.0.0.1:8123", true)["Strict-Transport-Security"]).toBeUndefined();
    expect(() => renderPage({ ...config, preview: false })).toThrow();
    expect(() => renderPage({ ...config, siteOrigin: "http://localhost:8124" })).toThrow();
    expect(() => renderPage({ ...config, api: "http://user@127.0.0.1:8123/api/voice-authorize?format=json" })).toThrow();
  });
  test("keeps the linking build outside the app's existing deployment and excludes generated output", () => {
    const root = path.resolve(__dirname, "..");
    const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
    expect(config.outputDirectory).toBe("dist");
    expect(config.buildCommand).toBe("npm run build");
    const typescript = JSON.parse(fs.readFileSync(path.join(root, "tsconfig.json"), "utf8"));
    expect(typescript.exclude).toContain("voice-linking-dist/**");
    expect(typescript.exclude).toContain("dist/**");
    expect(fs.readFileSync(path.join(root, ".gitignore"), "utf8")).toContain("voice-linking-dist/");
  });
});
