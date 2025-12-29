import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  getVoiceClient,
  randomToken,
  verifyClientSecret,
} from "../_shared/voiceAuth.ts";

function parseForm(body: string) {
  const params = new URLSearchParams(body);
  const entries: Record<string, string> = {};
  params.forEach((value, key) => {
    entries[key] = value;
  });
  return entries;
}

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = parseForm(await req.text());
    const grantType = body.grant_type ?? "";
    const clientId = body.client_id ?? "";
    const clientSecret = body.client_secret ?? "";

    if (!grantType || !clientId || !clientSecret) {
      return jsonResponse({ error: "invalid_request" }, 400);
    }

    const client = await getVoiceClient(clientId);
    if (!client) return jsonResponse({ error: "invalid_client" }, 401);
    const secretOk = await verifyClientSecret(client, clientSecret);
    if (!secretOk) return jsonResponse({ error: "invalid_client" }, 401);

    const admin = getSupabaseAdmin();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    if (grantType === "authorization_code") {
      const code = body.code ?? "";
      const redirectUri = body.redirect_uri ?? "";
      if (!code || !redirectUri)
        return jsonResponse({ error: "invalid_request" }, 400);

      const { data: codeRow } = await admin
        .from("voice_oauth_codes")
        .select("*")
        .eq("code", code)
        .maybeSingle();

      if (
        !codeRow ||
        codeRow.client_id !== clientId ||
        codeRow.redirect_uri !== redirectUri
      ) {
        return jsonResponse({ error: "invalid_grant" }, 400);
      }

      if (new Date(codeRow.expires_at).getTime() <= Date.now()) {
        return jsonResponse({ error: "invalid_grant" }, 400);
      }

      const accessToken = randomToken(24);
      const refreshToken = randomToken(24);

      const { error: insertError } = await admin
        .from("voice_oauth_tokens")
        .insert({
          access_token: accessToken,
          refresh_token: refreshToken,
          client_id: clientId,
          user_id: codeRow.user_id,
          expires_at: expiresAt,
        });

      if (insertError) return jsonResponse({ error: "server_error" }, 500);

      await admin.from("voice_oauth_codes").delete().eq("code", code);

      return jsonResponse({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: 3600,
      });
    }

    if (grantType === "refresh_token") {
      const refreshToken = body.refresh_token ?? "";
      if (!refreshToken) return jsonResponse({ error: "invalid_request" }, 400);

      const { data: tokenRow } = await admin
        .from("voice_oauth_tokens")
        .select("*")
        .eq("refresh_token", refreshToken)
        .eq("client_id", clientId)
        .maybeSingle();

      if (!tokenRow) return jsonResponse({ error: "invalid_grant" }, 400);

      const newAccess = randomToken(24);
      const { error: updateError } = await admin
        .from("voice_oauth_tokens")
        .update({ access_token: newAccess, expires_at: expiresAt })
        .eq("refresh_token", refreshToken)
        .eq("client_id", clientId);

      if (updateError) return jsonResponse({ error: "server_error" }, 500);

      return jsonResponse({
        access_token: newAccess,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: 3600,
      });
    }

    return jsonResponse({ error: "unsupported_grant_type" }, 400);
  } catch (err) {
    return jsonResponse(
      { error: (err as Error).message ?? "server_error" },
      500,
    );
  }
});
