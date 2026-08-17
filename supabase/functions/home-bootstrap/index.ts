import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/supabaseClient.ts";
import {
  boundedString,
  readJsonObject,
  RequestValidationError,
} from "../_shared/validation.ts";
import {
  createEdgeRequestContext,
  enforceEdgeRateLimit,
  finalizeEdgeResponse,
  rateLimitResponse,
} from "../_shared/edgeSecurity.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const securityContext = createEdgeRequestContext(req, "home-bootstrap");

  try {
    const supabase = getSupabaseClient(req);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return finalizeEdgeResponse(
        securityContext,
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }),
        "unauthorized",
      );
    }
    const rateLimit = await enforceEdgeRateLimit(securityContext, {
      actorId: userData.user.id,
      maxRequests: 5,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) return rateLimitResponse(securityContext, rateLimit);

    const body = await readJsonObject(req, 2_048);
    const name = boundedString(body.name, "name", 120);
    const { data: home, error: homeError } = await supabase.rpc(
      "bootstrap_home",
      { home_name: name },
    );
    if (homeError || !home) {
      return new Response(
        JSON.stringify({
          error: homeError?.message ?? "Failed to create home.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return finalizeEdgeResponse(
      securityContext,
      new Response(JSON.stringify({ home }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
      "created",
      rateLimit,
    );
  } catch (err) {
    const status = err instanceof RequestValidationError ? 400 : 500;
    return finalizeEdgeResponse(
      securityContext,
      new Response(JSON.stringify({ error: (err as Error).message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
      status === 400 ? "invalid_request" : "server_error",
    );
  }
});
