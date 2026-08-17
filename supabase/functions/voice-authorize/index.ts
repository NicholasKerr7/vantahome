import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getVoiceClient, randomToken } from "../_shared/voiceAuth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  boundedString,
  readFormObject,
  RequestValidationError,
} from "../_shared/validation.ts";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function renderHtml(body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>VantaHome Linking</title>
<style>
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
  if (error) throw error;
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const params = url.searchParams;
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const responseType = params.get("response_type") ?? "";
  const state = params.get("state") ?? "";

  if (req.method === "GET") {
    if (
      !clientId ||
      clientId.length > 128 ||
      !redirectUri ||
      redirectUri.length > 2_048 ||
      responseType !== "code" ||
      state.length > 512
    ) {
      return new Response(
        renderHtml('<div class="error">Invalid OAuth request.</div>'),
        {
          status: 400,
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    const client = await getVoiceClient(clientId);
    if (!client || !client.redirect_uris.includes(redirectUri)) {
      return new Response(
        renderHtml('<div class="error">Unknown client.</div>'),
        {
          status: 400,
          headers: { "Content-Type": "text/html" },
        },
      );
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

    return new Response(renderHtml(body), {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const form = await readFormObject(req, 8_192, 8);
    const formClientId = boundedString(form.client_id, "client_id", 128);
    const formRedirect = boundedString(
      form.redirect_uri,
      "redirect_uri",
      2_048,
    );
    const formState = boundedString(form.state ?? "", "state", 512, false);
    const email = boundedString(form.email, "email", 320).toLowerCase();
    const password = form.password;
    if (typeof password !== "string" || !password || password.length > 1_024) {
      throw new RequestValidationError("Invalid login details.");
    }

    const client = await getVoiceClient(formClientId);
    if (!client || !client.redirect_uris.includes(formRedirect)) {
      return new Response(
        renderHtml('<div class="error">Unknown client.</div>'),
        {
          status: 400,
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    const user = await signInWithPassword(email, password);
    if (!user) {
      return new Response(
        renderHtml('<div class="error">Invalid credentials.</div>'),
        {
          status: 401,
          headers: { "Content-Type": "text/html" },
        },
      );
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
      return new Response(
        renderHtml(
          '<div class="error">Unable to create authorization code.</div>',
        ),
        {
          status: 500,
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    const redirect = new URL(formRedirect);
    redirect.searchParams.set("code", code);
    if (formState) redirect.searchParams.set("state", formState);

    return new Response(null, {
      status: 302,
      headers: { Location: redirect.toString() },
    });
  } catch (err) {
    const status = err instanceof RequestValidationError ? 400 : 500;
    return new Response(
      renderHtml('<div class="error">Unable to link this account.</div>'),
      {
        status,
        headers: { "Content-Type": "text/html" },
      },
    );
  }
});
