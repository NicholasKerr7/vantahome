import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/supabaseClient.ts";

type EventPayload = {
  deviceId: string;
  state: Record<string, unknown>;
};

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

    const body = await req.json().catch(() => ({}));
    const events = Array.isArray(body?.events)
      ? (body.events as EventPayload[])
      : [];
    if (!events.length) {
      return new Response(JSON.stringify({ error: "events[] is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates = [] as Array<{
      device_id: string;
      state: Record<string, unknown>;
    }>;

    for (const evt of events) {
      if (!evt?.deviceId || typeof evt.deviceId !== "string") continue;
      if (!evt?.state || typeof evt.state !== "object") continue;
      const deviceId = evt.deviceId.trim();
      if (!deviceId) continue;

      const { data: existing } = await supabase
        .from("device_state")
        .select("state")
        .eq("device_id", deviceId)
        .maybeSingle();

      updates.push({
        device_id: deviceId,
        state: { ...(existing?.state ?? {}), ...evt.state },
      });
    }

    if (!updates.length) {
      return new Response(
        JSON.stringify({ error: "No valid events provided." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data, error } = await supabase
      .from("device_state")
      .upsert(updates)
      .select("device_id, updated_at");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ updated: data?.length ?? 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
