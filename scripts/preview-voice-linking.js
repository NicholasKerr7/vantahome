const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { repository, assetFiles, renderPage, securityHeaders } = require("./voice-linking-assets");

// Entirely local synthetic API. It never loads credentials, calls Supabase,
// sends email, creates users, or forwards a password to any external service.
async function startPreview({ pagePort = 0, apiPort = 0, scenario = "success" } = {}) {
  if (!["success", "invalid-credentials", "rate-limited", "unavailable", "untrusted-redirect", "unsafe-metadata"].includes(scenario)) {
    throw new Error("Unknown local preview scenario.");
  }
  let pageOrigin = "";
  let apiOrigin = "";
  const stats = { metadata: 0, submissions: 0, preflights: 0, callbacks: 0, completed: 0, cancelled: 0 };
  const servers = [];
  const listen = (server, port) => new Promise((resolve, reject) => {
    servers.push(server);
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
  const close = async () => {
    await Promise.all(servers.map((server) => new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    })));
  };
  const text = (response, status, body, headers = {}) => {
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers });
    response.end(body);
  };
  const json = (response, status, body, headers = {}) => {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
    response.end(JSON.stringify(body));
  };
  const correctContext = (value) => value?.client_id === "local-google" && value.response_type === "code" &&
    value.redirect_uri === `${apiOrigin}/callback` && value.state === " local state + 雪 ";
  const apiServer = http.createServer(async (request, response) => {
    try {
      if (request.headers.host !== new URL(apiOrigin).host) return text(response, 403, "Local host required.");
      const target = new URL(request.url, apiOrigin);
      if (target.pathname === "/callback" && request.method === "GET") {
        stats.callbacks++;
        const validState = target.searchParams.get("state") === " local state + 雪 ";
        const completed = validState && target.searchParams.get("code") === "local-synthetic-authorization-code";
        const cancelled = validState && target.searchParams.get("error") === "access_denied";
        if (completed) stats.completed++;
        if (cancelled) stats.cancelled++;
        response.writeHead(completed || cancelled ? 200 : 400, {
          ...securityHeaders(apiOrigin, true), "Content-Type": "text/html; charset=utf-8",
        });
        response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local handoff</title><main><h1>${completed ? "Local handoff verified" : cancelled ? "Local cancellation verified" : "Local handoff rejected"}</h1><p>Simulated provider only. No account was linked and no external service was contacted.</p></main></html>`);
        return;
      }
      if (target.pathname !== "/api/voice-authorize" || target.searchParams.get("format") !== "json") return text(response, 404, "Not found.");
      if (request.headers.origin !== pageOrigin) return json(response, 403, { error: "origin_not_allowed" });
      const cors = { "Access-Control-Allow-Origin": pageOrigin, "Vary": "Origin" };
      if (request.method === "OPTIONS") {
        stats.preflights++;
        if (!["GET", "POST"].includes(request.headers["access-control-request-method"]) ||
            (request.headers["access-control-request-headers"] ?? "").split(",").some((header) => header.trim() && header.trim().toLowerCase() !== "content-type")) {
          return json(response, 403, { error: "invalid_preflight" }, cors);
        }
        response.writeHead(204, { ...cors, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store" });
        response.end();
        return;
      }
      if (request.method === "GET") {
        stats.metadata++;
        const context = Object.fromEntries(["client_id", "redirect_uri", "response_type", "state"].map((key) => [key, target.searchParams.get(key)]));
        if (!correctContext(context)) return json(response, 400, { error: "invalid_request" }, cors);
        if (scenario === "unavailable") return json(response, 503, { error: "linking_unavailable" }, cors);
        return json(response, 200, { ...context, client: { name: scenario === "unsafe-metadata" ? '<img src=x onerror="alert(1)">' : "Google Home", provider: "google" } }, cors);
      }
      if (request.method !== "POST") return json(response, 405, { error: "method_not_allowed" }, cors);
      if ((request.headers["content-type"] ?? "").split(";", 1)[0] !== "application/json") return json(response, 415, { error: "unsupported_media_type" }, cors);
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 8192) return json(response, 400, { error: "invalid_request" }, cors);
        chunks.push(chunk);
      }
      const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
      stats.submissions++;
      if (!correctContext(body)) return json(response, 400, { error: "invalid_request" }, cors);
      if (scenario === "rate-limited") return json(response, 429, { error: "rate_limited" }, cors);
      if (scenario === "invalid-credentials" || body.email !== "linking@example.test" || body.password !== "local-fixture-only") {
        return json(response, 401, { error: "invalid_credentials" }, cors);
      }
      const redirect = new URL(scenario === "untrusted-redirect" ? "https://untrusted.example.invalid/callback" : `${apiOrigin}/callback`);
      redirect.searchParams.set("code", "local-synthetic-authorization-code");
      redirect.searchParams.set("state", body.state);
      json(response, 200, { redirect: redirect.href }, cors);
    } catch { json(response, 400, { error: "invalid_request" }); }
  });
  const pageServer = http.createServer((request, response) => {
    try {
      if (request.headers.host !== new URL(pageOrigin).host) return text(response, 403, "Local host required.");
      if (request.method !== "GET" && request.method !== "HEAD") return text(response, 405, "Method not allowed.");
      const target = new URL(request.url, pageOrigin);
      const headers = securityHeaders(apiOrigin, true);
      if (target.pathname === "/__preview/stats") return json(response, 200, stats, headers);
      if (target.pathname === "/" || target.pathname === "/index.html") {
        response.writeHead(200, { ...headers, "Content-Type": "text/html; charset=utf-8" });
        return response.end(request.method === "HEAD" ? undefined : renderPage({ api: `${apiOrigin}/api/voice-authorize?format=json`, siteOrigin: pageOrigin, preview: true }));
      }
      const asset = assetFiles[target.pathname];
      if (!asset) return text(response, 404, "Not found.", headers);
      response.writeHead(200, { ...headers, "Content-Type": asset[1] });
      response.end(request.method === "HEAD" ? undefined : fs.readFileSync(path.join(repository, asset[0])));
    } catch { text(response, 500, "Local preview unavailable."); }
  });
  try {
    await listen(apiServer, apiPort);
    apiOrigin = `http://127.0.0.1:${apiServer.address().port}`;
    await listen(pageServer, pagePort);
    pageOrigin = `http://127.0.0.1:${pageServer.address().port}`;
    const query = new URLSearchParams({ client_id: "local-google", redirect_uri: `${apiOrigin}/callback`, response_type: "code", state: " local state + 雪 " });
    return { pageOrigin, apiOrigin, url: `${pageOrigin}/?${query}`, close, stats };
  } catch (error) { await close(); throw error; }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--scenario")) {
    console.error("Usage: npm run preview:voice-linking [-- --scenario <synthetic-scenario>]");
    process.exitCode = 1;
  } else {
    startPreview({ scenario: args[1] }).then((preview) => {
      console.log(`Local simulated linking page: ${preview.url}`);
      console.log("Synthetic credentials: linking@example.test / local-fixture-only. No real accounts or external services.");
      const stop = () => void preview.close().then(() => { process.exitCode = 0; });
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    }).catch(() => { console.error("Local preview failed to start."); process.exitCode = 1; });
  }
}
module.exports = { startPreview };
