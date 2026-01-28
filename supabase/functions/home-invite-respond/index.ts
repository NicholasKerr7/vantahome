import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/supabaseClient.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

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

    const body = await req.json().catch(() => ({}));
    const inviteId =
      typeof body?.inviteId === "string" ? body.inviteId.trim() : "";
    const action: InviteAction =
      body?.action === "decline" ? "decline" : "accept";

    const admin = getSupabaseAdmin();
    const { data: invite, error: inviteError } = await admin
      .from("home_invites")
      .select("*")
      .eq("id", inviteId)
      .maybeSingle();

    if (inviteError || !invite) {
      return new Response(JSON.stringify({ error: "Invite not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userEmail = userData.user.email?.toLowerCase() ?? "";
    if (
      invite.invited_user_id &&
      invite.invited_user_id !== userData.user.id
    ) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (invite.email?.toLowerCase() !== userEmail) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (invite.status !== "pending") {
      return new Response(JSON.stringify({ error: "Invite already processed." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "accept") {
      const { error: memberError } = await admin
        .from("home_members")
        .upsert({
          home_id: invite.home_id,
          user_id: userData.user.id,
          role: invite.role,
        });
      if (memberError) {
        return new Response(JSON.stringify({ error: memberError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (Array.isArray(invite.room_ids) && invite.room_ids.length) {
        const payload = invite.room_ids.map((roomId: string) => ({
          room_id: roomId,
          user_id: userData.user.id,
          role: invite.role,
        }));
        const { error: roomError } = await admin
          .from("room_members")
          .upsert(payload);
        if (roomError) {
          return new Response(JSON.stringify({ error: roomError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const { error: updateError } = await admin
      .from("home_invites")
      .update({
        status: action === "accept" ? "accepted" : "declined",
        responded_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        status: action === "accept" ? "accepted" : "declined",
        inviteId: invite.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
