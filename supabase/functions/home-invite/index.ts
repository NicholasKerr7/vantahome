import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/supabaseClient.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  boundedString,
  isUuid,
  readJsonObject,
  RequestValidationError,
} from "../_shared/validation.ts";

const ROLES = ["admin", "member", "guest", "tenant"] as const;
type InviteRole = (typeof ROLES)[number];

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

    const body = await readJsonObject(req, 8_192);
    const email = boundedString(body.email, "email", 320).toLowerCase();
    const name = boundedString(body.name, "name", 120, false);
    const roleInput =
      typeof body?.role === "string" ? body.role.trim().toLowerCase() : "member";
    if (!ROLES.includes(roleInput as InviteRole)) {
      throw new RequestValidationError("role is invalid.");
    }
    const role = roleInput as InviteRole;
    const roomIds = Array.isArray(body?.roomIds)
      ? [...new Set(body.roomIds.filter(isUuid))]
      : [];

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new RequestValidationError("email is invalid.");
    }
    if (Array.isArray(body.roomIds) && roomIds.length !== body.roomIds.length) {
      throw new RequestValidationError("roomIds contains an invalid identifier.");
    }

    const { data: membership, error: membershipError } = await supabase
      .from("home_members")
      .select("home_id, role")
      .eq("user_id", userData.user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      return new Response(JSON.stringify({ error: "Home not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: canInvite, error: permissionError } = await supabase.rpc(
      "effective_member_has_action_permission",
      {
        target_home_id: membership.home_id,
        target_user_id: userData.user.id,
        requested_permission: "member.invite",
      },
    );
    if (permissionError || canInvite !== true) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (["guest", "tenant"].includes(role) && roomIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Guests and tenants need room access." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const admin = getSupabaseAdmin();
    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: name ? { name } : undefined,
      });

    let invitedUserId = inviteData?.user?.id ?? "";
    if (!invitedUserId) {
      const { data: existingUsers, error: listError } =
        await admin.auth.admin.listUsers({
          filter: `email=eq.${email}`,
          perPage: 1,
          page: 1,
        });
      if (listError || !existingUsers?.users?.length) {
        return new Response(
          JSON.stringify({
            error: inviteError?.message ?? "Unable to invite member.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      invitedUserId = existingUsers.users[0].id;
    }
    const { data: existingMember } = await admin
      .from("home_members")
      .select("user_id, role")
      .eq("home_id", membership.home_id)
      .eq("user_id", invitedUserId)
      .limit(1)
      .maybeSingle();
    if (!existingMember) {
      const { data: rooms } = await admin
        .from("rooms")
        .select("id")
        .eq("home_id", membership.home_id)
        .in("id", roomIds);
      const validRoomIds = rooms?.map((r) => r.id) ?? [];
      const { error: inviteRecordError } = await admin
        .from("home_invites")
        .upsert({
          home_id: membership.home_id,
          email,
          invited_user_id: invitedUserId || null,
          role,
          room_ids: validRoomIds,
          status: "pending",
        });
      if (inviteRecordError) {
        return new Response(
          JSON.stringify({ error: inviteRecordError.message }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    return new Response(
      JSON.stringify({
        member: {
          userId: invitedUserId,
          email,
          name: name || inviteData.user.user_metadata?.name || email,
          role,
        },
        status: existingMember ? "already_member" : "invited",
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
