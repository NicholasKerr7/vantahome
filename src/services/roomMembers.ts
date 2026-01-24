import { supabase } from "./supabaseClient";

export type RoomMemberRole = "member" | "guest" | "tenant";

function assertSupabaseReady() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
}

export async function setRoomMembershipRemote(
  userId: string,
  roomIds: string[],
  role: RoomMemberRole,
) {
  assertSupabaseReady();

  const { error: deleteError } = await supabase!
    .from("room_members")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  if (!roomIds.length) return;

  const payload = roomIds.map((roomId) => ({
    room_id: roomId,
    user_id: userId,
    role,
  }));
  const { error: insertError } = await supabase!
    .from("room_members")
    .insert(payload);
  if (insertError) throw new Error(insertError.message);
}
