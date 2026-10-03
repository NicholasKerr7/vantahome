import { supabase } from "./supabaseClient";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Replace grants in one explicit home; the server derives the role and commits atomically. */
export async function setRoomMembershipRemote(
  homeId: string,
  userId: string,
  roomIds: string[],
): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!UUID_PATTERN.test(homeId) || !UUID_PATTERN.test(userId)
    || roomIds.length > 500 || roomIds.some((id) => !UUID_PATTERN.test(id))
    || new Set(roomIds).size !== roomIds.length) {
    throw new Error("Choose valid rooms in the current home.");
  }
  const { error } = await supabase.rpc("set_home_room_memberships", {
    target_home_id: homeId,
    target_user_id: userId,
    target_room_ids: roomIds,
  });
  if (error) throw new Error(error.message);
}
