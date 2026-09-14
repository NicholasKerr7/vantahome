import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/supabaseClient.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  boundedString,
  isUuid,
  readJsonObject,
  RequestValidationError,
} from "../_shared/validation.ts";
import {
  createEdgeRequestContext,
  enforceEdgeRateLimit,
  finalizeEdgeResponse,
  rateLimitResponse,
} from "../_shared/edgeSecurity.ts";

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
  const securityContext = createEdgeRequestContext(req, "home-invite");

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
      maxRequests: 20,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) return rateLimitResponse(securityContext, rateLimit);

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

    if (role === "admin") {
      // Delegated administrators may invite ordinary members, but cannot create
      // another administrator to bypass restrictions set by the home's owner.
      const { data: ownedHome, error: ownerError } = await supabase
        .from("homes")
        .select("id")
        .eq("id", membership.home_id)
        .eq("owner_id", userData.user.id)
        .maybeSingle();
      if (ownerError || !ownedHome) {
        return new Response(JSON.stringify({ error: "Only the home owner can invite administrators." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    let invitedUserId: string | null = null;
    if (!inviteError && inviteData?.user?.email?.trim().toLowerCase() === email) {
      invitedUserId = inviteData.user.id;
    } else if (["email_exists", "user_already_exists"].includes(inviteError?.code)) {
      // The Auth directory API does not support an email filter. Resolve only
      // explicit existing-account errors through the exact, server-only lookup.
      const { data: existingUserId, error: lookupError } = await admin.rpc(
        "find_auth_user_id_by_email",
        { target_email: email },
      );
      if (!lookupError && isUuid(existingUserId)) invitedUserId = existingUserId;
    }
    if (!isUuid(invitedUserId)) {
      return finalizeEdgeResponse(
        securityContext,
        new Response(JSON.stringify({ error: "Unable to invite member." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }),
        "invitation_failed",
        rateLimit,
      );
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

    return finalizeEdgeResponse(
      securityContext,
      new Response(JSON.stringify({
        member: {
          userId: invitedUserId,
          email,
          name: name || inviteData?.user?.user_metadata?.name || email,
          role,
        },
        status: existingMember ? "already_member" : "invited",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
      existingMember ? "already_member" : "invited",
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
