import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/supabaseClient.ts";
import {
  isUuid,
  readJsonObject,
  RequestValidationError,
} from "../_shared/validation.ts";

type InviteAction = "accept" | "decline";

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

    const body = await readJsonObject(req, 4_096);
    const inviteId =
      typeof body?.inviteId === "string" ? body.inviteId.trim() : "";
    const action = body?.action as InviteAction;
    if (!isUuid(inviteId) || (action !== "accept" && action !== "decline")) {
      throw new RequestValidationError("inviteId or action is invalid.");
    }

    // The database function locks and processes the invite atomically, so a
    // partial membership cannot remain after a room-assignment failure.
    const { data: status, error } = await supabase.rpc("respond_home_invite", {
      target_invite_id: inviteId,
      response_action: action,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        status,
        inviteId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const status = err instanceof RequestValidationError ? 400 : 500;
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
