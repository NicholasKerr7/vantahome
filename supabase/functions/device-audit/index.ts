import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/supabaseClient.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  boundedString,
  isPlainObject,
  isSafeJson,
  isUuid,
  readJsonObject,
  RequestValidationError,
} from "../_shared/validation.ts";

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

  try {
    const supabase = getSupabaseClient(req);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await readJsonObject(req, 16_384);
    const deviceId = boundedString(body.deviceId, "deviceId", 64);
    const action = boundedString(body.action ?? "command", "action", 64);
    const payload = body.payload ?? {};

    if (!isUuid(deviceId) || !isPlainObject(payload) || !isSafeJson(payload)) {
      throw new RequestValidationError("deviceId or payload is invalid.");
    }

    // Resolve the home from the exact device through caller-scoped RLS. Never
    // trust a caller-selected or first membership when writing with service role.
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("home_id")
      .eq("id", deviceId)
      .limit(1)
      .maybeSingle();

    if (deviceError || !device) {
      return new Response(JSON.stringify({ error: "Device not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getSupabaseAdmin();
    const { error: insertError } = await admin.from("device_audit_logs").insert({
      home_id: device.home_id,
      device_id: deviceId,
      actor_user_id: userData.user.id,
      actor_name: userData.user.user_metadata?.name ?? null,
      actor_email: userData.user.email ?? null,
      action,
      payload,
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const status = err instanceof RequestValidationError ? 400 : 500;
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
