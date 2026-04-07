import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/supabaseClient.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

type PushRegisterBody = {
  installationId?: string;
  expoPushToken?: string | null;
  platform?: string;
  deviceName?: string | null;
  deviceModel?: string | null;
  appVersion?: string | null;
  preferenceState?: Record<string, unknown>;
  disabled?: boolean;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    const supabase = getSupabaseClient(req);
    const admin = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as PushRegisterBody;
    const installationId =
      typeof body.installationId === "string" ? body.installationId.trim() : "";
    const expoPushToken =
      typeof body.expoPushToken === "string" ? body.expoPushToken.trim() : null;
    const platform =
      body.platform === "ios" || body.platform === "android" || body.platform === "web"
        ? body.platform
        : "unknown";
    const disabled = body.disabled === true;
    const preferenceState =
      body.preferenceState && typeof body.preferenceState === "object"
        ? body.preferenceState
        : {};

    if (!installationId) {
      return jsonResponse({ error: "installationId is required." }, 400);
    }

    const { data: membership, error: membershipError } = await supabase
      .from("home_members")
      .select("home_id")
      .eq("user_id", userData.user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      return jsonResponse({ error: "Home not found." }, 404);
    }

    const nowIso = new Date().toISOString();
    const row = {
      installation_id: installationId,
      home_id: membership.home_id,
      user_id: userData.user.id,
      expo_push_token: disabled ? null : expoPushToken,
      platform,
      device_name:
        typeof body.deviceName === "string" ? body.deviceName.trim() || null : null,
      device_model:
        typeof body.deviceModel === "string" ? body.deviceModel.trim() || null : null,
      app_version:
        typeof body.appVersion === "string" ? body.appVersion.trim() || null : null,
      preference_state: preferenceState,
      disabled_at: disabled ? nowIso : null,
      last_seen_at: nowIso,
      last_receipt_status: null,
      last_receipt_error: null,
    };

    const { data, error } = await admin
      .from("push_notification_devices")
      .upsert(row, { onConflict: "installation_id" })
      .select(
        "id, home_id, user_id, installation_id, expo_push_token, disabled_at, last_seen_at",
      )
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ device: data });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
