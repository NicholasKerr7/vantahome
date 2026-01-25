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

  if (!roomIds.length) {
    const { error } = await supabase!
      .from("room_members")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return;
  }

  const payload = roomIds.map((roomId) => ({
    room_id: roomId,
    user_id: userId,
    role,
  }));
  const { error: upsertError } = await supabase!
    .from("room_members")
    .upsert(payload, { onConflict: "room_id,user_id" });
  if (upsertError) throw new Error(upsertError.message);

  const { error: deleteError } = await supabase!
    .from("room_members")
    .delete()
    .eq("user_id", userId)
    .not(
      "room_id",
      "in",
      `(${roomIds.map((id) => `"${id}"`).join(",")})`,
    );
  if (deleteError) throw new Error(deleteError.message);
}
