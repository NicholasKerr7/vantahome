const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const repository = path.resolve(__dirname, "..");
const assetFiles = Object.freeze({
  "/linking.css": ["web/voice-linking/linking.css", "text/css; charset=utf-8"],
  "/main.js": ["web/voice-linking/main.js", "application/javascript; charset=utf-8"],
  "/protocol.js": ["web/voice-linking/protocol.js", "application/javascript; charset=utf-8"],
  "/logo.png": ["assets/release/icon.png", "image/png"],
});

function httpsOrigin(value) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("A canonical HTTPS site origin is required.");
  let url;
  try { url = new URL(value); } catch { throw new Error("A canonical HTTPS site origin is required."); }
  const host = url.hostname.replace(/\.$/, "");
  if (url.protocol !== "https:" || url.origin !== value || url.username || url.password ||
      url.hash || url.search || host === "localhost" || host.endsWith(".localhost") ||
      /^[\d.]+$/.test(host) || host.includes(":")) {
    throw new Error("A canonical HTTPS site origin is required.");
  }
  return url.origin;
}
function productionConfig(projectRef, siteOrigin) {
  if (typeof projectRef !== "string" || !/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("An explicit Supabase project reference is required.");
  return {
    api: `https://${projectRef}.supabase.co/functions/v1/voice-authorize?format=json`,
    siteOrigin: httpsOrigin(siteOrigin), preview: false,
  };
}
function securityHeaders(apiOrigin, preview = false) {
  const url = new URL(apiOrigin);
  const validPreview = preview && url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port;
  if (url.origin !== apiOrigin || (!validPreview && (url.protocol !== "https:" || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.port))) {
    throw new Error("Invalid linking API origin.");
  }
  return {
    "Content-Security-Policy": ["default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self'",
      `connect-src ${apiOrigin}`, "base-uri 'none'", "frame-ancestors 'none'", "form-action 'none'", "object-src 'none'"].join("; "),
    "Cache-Control": "no-store", "Pragma": "no-cache", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    ...(preview ? {} : { "Strict-Transport-Security": "max-age=31536000" }),
  };
}
function renderPage(config) {
  const api = new URL(config.api);
  if (api.href !== config.api || api.username || api.password || api.hash || config.api.includes("#")) {
    throw new Error("Invalid linking API configuration.");
  }
  securityHeaders(api.origin, config.preview);
  if (config.preview) {
    const site = new URL(config.siteOrigin);
    if (site.origin !== config.siteOrigin || site.protocol !== "http:" || site.hostname !== "127.0.0.1" || !site.port ||
        api.protocol !== "http:" || api.hostname !== "127.0.0.1" || !api.port || api.pathname !== "/api/voice-authorize" || api.search !== "?format=json") {
      throw new Error("Invalid local preview configuration.");
    }
  } else {
    httpsOrigin(config.siteOrigin);
    if (api.pathname !== "/functions/v1/voice-authorize" || api.search !== "?format=json" || api.username || api.password || api.hash) {
      throw new Error("Invalid production linking API.");
    }
  }
  const escape = (value) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  return fs.readFileSync(path.join(repository, "web/voice-linking/index.html"), "utf8")
    .replace("__VANTA_LINKING_API__", escape(config.api))
    .replace("__VANTA_LINKING_ORIGIN__", escape(config.siteOrigin))
    .replace("__VANTA_LINKING_PREVIEW__", config.preview ? "true" : "false");
}
module.exports = { repository, assetFiles, productionConfig, securityHeaders, renderPage };
