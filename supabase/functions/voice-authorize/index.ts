import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getVoiceClient, randomToken } from "../_shared/voiceAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  boundedString,
  readFormObject,
  readJsonObject,
  RequestValidationError,
} from "../_shared/validation.ts";
import {
  exactOAuthString,
  isCanonicalVoiceRedirect,
  isVoiceLinkingPreflightAllowed,
  resolveVoiceLinkingOrigin,
  validateAuthorizationQuery,
  voiceLinkingHeaders,
} from "../_shared/voiceLinking.ts";
import {
  createEdgeRequestContext,
  enforceEdgeRateLimit,
  finalizeEdgeResponse,
  rateLimitResponse,
} from "../_shared/edgeSecurity.ts";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function oauthHeaders(extra: HeadersInit = {}, styleNonce?: string, formRedirect?: string) {
  const headers = new Headers(extra);
  const redirect = formRedirect ? new URL(formRedirect) : null;
  // Some browsers apply form-action to the final POST redirect too. Permit the
  // registered provider origin so the authorization-code handoff still works.
  const formTarget = redirect?.protocol === "https:" ? ` ${redirect.origin}` : "";
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy", [
    "default-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    `form-action 'self'${formTarget}`,
    `style-src ${styleNonce ? `'nonce-${styleNonce}'` : "'none'"}`,
  ].join("; "));
  return headers;
}

function htmlResponse(body: string, status: number, formRedirect?: string) {
  // A per-response style nonce preserves the linking form without allowing
  // arbitrary inline scripts or styles in this password-bearing document.
  const nonce = randomToken(16);
  return new Response(renderHtml(body, nonce), {
    status,
    headers: oauthHeaders({ "Content-Type": "text/html; charset=utf-8" }, nonce, formRedirect),
  });
}

function renderHtml(body: string, nonce: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>VantaHome Linking</title>
<style nonce="${nonce}">
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1b0e3d; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .card { width: min(420px, 92vw); background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); border-radius: 20px; padding: 24px; box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
  h1 { margin: 0 0 12px; font-size: 20px; }
  label { display: block; margin-top: 12px; font-weight: 600; }
  input { width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: #fff; }
  button { margin-top: 16px; width: 100%; padding: 12px; border-radius: 999px; border: none; background: #7a5cff; color: #fff; font-weight: 700; }
  .hint { font-size: 12px; opacity: 0.7; margin-top: 10px; }
  .error { background: rgba(255,80,80,0.18); border: 1px solid rgba(255,80,80,0.4); padding: 10px; border-radius: 12px; margin-bottom: 10px; }
</style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`;
}

class InvalidCredentialsError extends Error {}

async function signInWithPassword(email: string, password: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("Missing Supabase env.");
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    if (error.code === "invalid_credentials" || error.status === 400 || error.status === 401) {
      throw new InvalidCredentialsError();
    }
    throw error;
  }
  return data.user;
}

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  // Any json selector enters the restricted path, even when a duplicate later
  // causes rejection. A conflicting selector must not fall back to wildcard CORS.
  const jsonMode = params.getAll("format").includes("json");
  const origin = jsonMode
    ? resolveVoiceLinkingOrigin(req.headers.get("origin"), Deno.env.get("VOICE_LINKING_ORIGIN"))
    : null;
  const allowedOrigin = origin?.allowed ? origin.origin : null;
  const jsonResponse = (data: Record<string, unknown>, status: number, extra: HeadersInit = {}) => {
    const headers = voiceLinkingHeaders(oauthHeaders(extra), allowedOrigin);
    headers.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data), { status, headers });
  };
  const failure = (error: string, status: number) => jsonMode
    ? jsonResponse({ error }, status)
    : htmlResponse('<div class="error">Unable to link this account.</div>', status);

  if (origin && !origin.allowed) {
    return failure(origin.status === 503 ? "linking_unavailable" : "origin_not_allowed", origin.status);
  }
  try {
    validateAuthorizationQuery(params);
  } catch {
    return failure("invalid_request", 400);
  }
  if (req.method === "OPTIONS") {
    if (jsonMode) {
      if (!isVoiceLinkingPreflightAllowed(req)) return failure("invalid_preflight", 403);
      const headers = voiceLinkingHeaders(oauthHeaders(), allowedOrigin);
      headers.set("Access-Control-Allow-Methods", "GET, POST");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      return new Response(null, { status: 204, headers });
    }
    return new Response("ok", { headers: oauthHeaders(corsHeaders) });
  }
  const securityContext = createEdgeRequestContext(req, "voice-authorize");
  // Loading the form must not consume the smaller password-attempt budget.
  // Keep the operational endpoint name stable and split only the stored buckets.
  const rateContext = {
    ...securityContext,
    endpoint: req.method === "POST" ? "voice-authorize.post" : "voice-authorize.get",
  };
  const rateLimit = await enforceEdgeRateLimit(rateContext, {
    maxRequests: req.method === "POST" ? 10 : 120,
    windowSeconds: 900,
    requireClientIp: true,
  });
  if (!rateLimit.allowed) {
    const response = rateLimitResponse(securityContext, rateLimit);
    if (jsonMode) {
      return jsonResponse({ error: response.status === 503 ? "abuse_protection_unavailable" : "rate_limited" },
        response.status, response.headers);
    }
    return new Response(response.body, {
      status: response.status,
      headers: oauthHeaders(response.headers),
    });
  }

  try {
    if (req.method === "GET") {
      const clientId = exactOAuthString(params.get("client_id"), 128);
      const redirectUri = exactOAuthString(params.get("redirect_uri"), 2_048);
      const state = exactOAuthString(params.get("state") ?? "", 512, false);
      if (params.get("response_type") !== "code") throw new RequestValidationError("Invalid response type.");
      const client = await getVoiceClient(clientId, { throwOnStorageError: true });
      if (!client || !client.redirect_uris.includes(redirectUri)) return failure("unknown_client", 400);

      if (jsonMode) {
        if (!isCanonicalVoiceRedirect(redirectUri)) return failure("invalid_request", 400);
        if (typeof client.name !== "string" || !client.name.trim() || client.name.length > 128 ||
          !["alexa", "google"].includes(client.provider)) return failure("server_error", 500);
        return finalizeEdgeResponse(securityContext, jsonResponse({
          client: { name: client.name, provider: client.provider },
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: "code",
          state,
        }, 200), "linking_request_validated", rateLimit);
      }
      const safeClientId = escapeHtml(clientId);
      const safeRedirectUri = escapeHtml(redirectUri);
      const safeState = escapeHtml(state);
      const body = `
      <h1>Link ${escapeHtml(client.name)}</h1>
      <p class="hint">Sign in to VantaHome to link your account.</p>
      <form method="post">
        <input type="hidden" name="client_id" value="${safeClientId}" />
        <input type="hidden" name="redirect_uri" value="${safeRedirectUri}" />
        <input type="hidden" name="state" value="${safeState}" />
        <label>Email</label>
        <input type="email" name="email" required />
        <label>Password</label>
        <input type="password" name="password" required />
        <button type="submit">Link account</button>
      </form>
    `;

      return finalizeEdgeResponse(
        securityContext,
        htmlResponse(body, 200, redirectUri),
        "login_form_rendered",
        rateLimit,
      );
    }

    if (req.method !== "POST") {
      if (jsonMode) return failure("method_not_allowed", 405);
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: oauthHeaders({ ...corsHeaders, "Content-Type": "application/json" }),
      });
    }

    if (jsonMode && req.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return failure("unsupported_media_type", 415);
    }
    const form = jsonMode ? await readJsonObject(req, 8_192, 1) : await readFormObject(req, 8_192, 8);
    if (jsonMode) {
      const fields = ["client_id", "redirect_uri", "response_type", "state", "email", "password"];
      if (Object.keys(form).some((key) => !fields.includes(key)) || form.response_type !== "code" || !Object.hasOwn(form, "state")) {
        throw new RequestValidationError("Invalid authorization body.");
      }
    }
    const formClientId = exactOAuthString(form.client_id, 128);
    const formRedirect = exactOAuthString(form.redirect_uri, 2_048);
    const formState = exactOAuthString(jsonMode ? form.state : (form.state ?? ""), 512, false);
    const email = boundedString(form.email, "email", 320).toLowerCase();
    const password = form.password;
    if (typeof password !== "string" || !password || password.length > 1_024) {
      throw new RequestValidationError("Invalid login details.");
    }

    const client = await getVoiceClient(formClientId, { throwOnStorageError: true });
    if (!client || !client.redirect_uris.includes(formRedirect)) {
      return failure("unknown_client", 400);
    }
    if (jsonMode && !isCanonicalVoiceRedirect(formRedirect)) return failure("invalid_request", 400);

    const user = await signInWithPassword(email, password);
    if (!user) {
      return failure("invalid_credentials", 401);
    }

    const admin = getSupabaseAdmin();
    const code = randomToken(16);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error } = await admin.from("voice_oauth_codes").insert({
      code,
      client_id: formClientId,
      user_id: user.id,
      redirect_uri: formRedirect,
      expires_at: expiresAt,
    });

    if (error) {
      return failure("server_error", 500);
    }

    const redirect = new URL(formRedirect);
    redirect.searchParams.set("code", code);
    // Empty state must not accidentally inherit a parameter from the
    // registered redirect URI. Copy non-empty opaque state verbatim.
    redirect.searchParams.delete("state");
    if (formState) redirect.searchParams.set("state", formState);

    return finalizeEdgeResponse(
      securityContext,
      jsonMode ? jsonResponse({ redirect: redirect.toString() }, 200) : new Response(null, {
        status: 302,
        headers: oauthHeaders({ Location: redirect.toString() }),
      }),
      "authorization_code_issued",
      rateLimit,
    );
  } catch (err) {
    const status = err instanceof RequestValidationError ? 400 : err instanceof InvalidCredentialsError ? 401 : 500;
    const error = status === 400 ? "invalid_request" : status === 401 ? "invalid_credentials" : "server_error";
    return finalizeEdgeResponse(
      securityContext,
      failure(error, status),
      error,
      rateLimit,
    );
  }
});
