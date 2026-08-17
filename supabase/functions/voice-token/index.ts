import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  getVoiceClient,
  randomToken,
  verifyClientSecret,
} from "../_shared/voiceAuth.ts";
import {
  boundedString,
  readFormObject,
  RequestValidationError,
} from "../_shared/validation.ts";
import {
  createEdgeRequestContext,
  enforceEdgeRateLimit,
  finalizeEdgeResponse,
  rateLimitResponse,
} from "../_shared/edgeSecurity.ts";

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
  const securityContext = createEdgeRequestContext(req, "voice-token");

  try {
    const rateLimit = await enforceEdgeRateLimit(securityContext, {
      maxRequests: 60,
      windowSeconds: 60,
      requireClientIp: true,
    });
    if (!rateLimit.allowed) return rateLimitResponse(securityContext, rateLimit);
    const body = await readFormObject(req, 8_192, 8);
    const grantType = boundedString(body.grant_type, "grant_type", 64);
    const clientId = boundedString(body.client_id, "client_id", 128);
    const clientSecret = boundedString(
      body.client_secret,
      "client_secret",
      1_024,
    );

    const client = await getVoiceClient(clientId);
    if (!client) return jsonResponse({ error: "invalid_client" }, 401);
    const secretOk = await verifyClientSecret(client, clientSecret);
    if (!secretOk) return jsonResponse({ error: "invalid_client" }, 401);

    const admin = getSupabaseAdmin();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    if (grantType === "authorization_code") {
      const code = boundedString(body.code, "code", 256);
      const redirectUri = boundedString(
        body.redirect_uri,
        "redirect_uri",
        2_048,
      );

      const accessToken = randomToken(24);
      const refreshToken = randomToken(24);

      const { data: exchanged, error: exchangeError } = await admin.rpc(
        "exchange_voice_authorization_code",
        {
          oauth_code: code,
          oauth_client_id: clientId,
          oauth_redirect_uri: redirectUri,
          new_access_token: accessToken,
          new_refresh_token: refreshToken,
          new_expires_at: expiresAt,
        },
      );
      if (exchangeError) return jsonResponse({ error: "server_error" }, 500);
      if (!exchanged) return jsonResponse({ error: "invalid_grant" }, 400);

      return finalizeEdgeResponse(
        securityContext,
        jsonResponse({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: "Bearer",
          expires_in: 3600,
        }),
        "authorization_code_exchanged",
        rateLimit,
      );
    }

    if (grantType === "refresh_token") {
      const refreshToken = boundedString(
        body.refresh_token,
        "refresh_token",
        256,
      );

      const { data: tokenRow } = await admin
        .from("voice_oauth_tokens")
        .select("*")
        .eq("refresh_token", refreshToken)
        .eq("client_id", clientId)
        .maybeSingle();

      if (!tokenRow) return jsonResponse({ error: "invalid_grant" }, 400);
      if (new Date(tokenRow.refresh_expires_at).getTime() <= Date.now()) {
        await admin
          .from("voice_oauth_tokens")
          .delete()
          .eq("refresh_token", refreshToken)
          .eq("client_id", clientId);
        return jsonResponse({ error: "invalid_grant" }, 400);
      }

      const newAccess = randomToken(24);
      const newRefresh = randomToken(24);
      const { data: rotatedToken, error: updateError } = await admin
        .from("voice_oauth_tokens")
        .update({
          access_token: newAccess,
          refresh_token: newRefresh,
          expires_at: expiresAt,
        })
        .eq("refresh_token", refreshToken)
        .eq("client_id", clientId)
        .select("refresh_token")
        .maybeSingle();

      if (updateError) return jsonResponse({ error: "server_error" }, 500);
      // Selecting the updated row makes concurrent refresh-token reuse fail:
      // only the request that rotated the old token can return a new pair.
      if (!rotatedToken) return jsonResponse({ error: "invalid_grant" }, 400);

      return finalizeEdgeResponse(
        securityContext,
        jsonResponse({
          access_token: newAccess,
          refresh_token: newRefresh,
          token_type: "Bearer",
          expires_in: 3600,
        }),
        "refresh_rotated",
        rateLimit,
      );
    }

    return jsonResponse({ error: "unsupported_grant_type" }, 400);
  } catch (err) {
    if (err instanceof RequestValidationError) {
      return finalizeEdgeResponse(
        securityContext,
        jsonResponse({ error: "invalid_request" }, 400),
        "invalid_request",
      );
    }
    return finalizeEdgeResponse(
      securityContext,
      jsonResponse({ error: "server_error" }, 500),
      "server_error",
    );
  }
});
