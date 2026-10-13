import { withMembershipMutation } from "./membershipRevision";
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

  const { data, error } = await withMembershipMutation(async () => supabase!.rpc('set_member_permission_override', {
    target_home_id: homeId,
    target_user_id: userId,
    requested_permission: permission,
    requested_allowed: allowed,
  }));
  if (error) throw new Error(error.message);
  // SQL NULL means an authorized reset, including an already-absent override.
  // A filtered DELETE cannot establish that outcome; only the checked RPC can.
  if (data !== allowed) throw new Error('The server did not confirm this permission. Refresh home access.');
}
