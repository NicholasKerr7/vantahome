import { ACTION_PERMISSIONS, type ActionPermission } from "../security/permissions";
import { supabase } from "./supabaseClient";

const permissionSet = new Set<string>(ACTION_PERMISSIONS);

function assertUuid(value: string, label: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error(`${label} is invalid.`);
  }
}

export async function setMemberPermissionOverrideRemote(
  userId: string,
  permission: ActionPermission,
  allowed: boolean | null,
) {
  if (!supabase) throw new Error("Supabase is not configured.");
  assertUuid(userId, "Member");
  if (!permissionSet.has(permission)) throw new Error("Permission is invalid.");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sign in again to continue.");

  const { data: membership, error: membershipError } = await supabase
    .from("home_members")
    .select("home_id")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) {
    throw new Error("No household membership was found.");
  }

  if (allowed === null) {
    const { error } = await supabase
      .from("member_permission_overrides")
      .delete()
      .eq("home_id", membership.home_id)
      .eq("user_id", userId)
      .eq("permission", permission);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("member_permission_overrides").upsert(
    {
      home_id: membership.home_id,
      user_id: userId,
      permission,
      allowed,
      updated_by: userData.user.id,
    },
    { onConflict: "home_id,user_id,permission" },
  );
  if (error) throw new Error(error.message);
}
