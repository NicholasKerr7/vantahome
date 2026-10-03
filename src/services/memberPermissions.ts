import { ACTION_PERMISSIONS, type ActionPermission } from "../security/permissions";
import { supabase } from "./supabaseClient";

const permissionSet = new Set<string>(ACTION_PERMISSIONS);

/** Reject local/demo identifiers before a cloud permission mutation. */
function assertUuid(value: string, label: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error(`${label} is invalid.`);
  }
}

/** Write only the reviewed household's override using the expected verified actor. */
export async function setMemberPermissionOverrideRemote(
  homeId: string,
  userId: string,
  permission: ActionPermission,
  allowed: boolean | null,
  expectedUserId: string,
) {
  if (!supabase) throw new Error("Supabase is not configured.");
  assertUuid(homeId, "Home");
  assertUuid(userId, "Member");
  assertUuid(expectedUserId, "Account");
  if (!permissionSet.has(permission)) throw new Error("Permission is invalid.");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || userData.user?.id !== expectedUserId) throw new Error("Your account changed. Sign in again to continue.");

  if (allowed === null) {
    const { error } = await supabase
      .from("member_permission_overrides")
      .delete()
      .eq("home_id", homeId)
      .eq("user_id", userId)
      .eq("permission", permission);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("member_permission_overrides").upsert(
    {
      home_id: homeId,
      user_id: userId,
      permission,
      allowed,
      updated_by: userData.user.id,
    },
    { onConflict: "home_id,user_id,permission" },
  );
  if (error) throw new Error(error.message);
}
