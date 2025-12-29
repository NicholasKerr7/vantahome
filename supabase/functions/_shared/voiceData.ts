import { getSupabaseAdmin } from "./supabaseAdmin.ts";

export type VoiceDevice = {
  id: string;
  name: string;
  kind: string;
  room_id: string | null;
  home_id: string;
};

export type VoiceStateRow = {
  device_id: string;
  state: Record<string, unknown>;
};

export async function fetchVoiceData(userId: string) {
  const admin = getSupabaseAdmin();
  const { data: memberships, error: memberError } = await admin
    .from("home_members")
    .select("home_id")
    .eq("user_id", userId);

  if (memberError) throw memberError;
  const homeIds = (memberships ?? []).map((m) => m.home_id).filter(Boolean);
  if (!homeIds.length) {
    return {
      devices: [],
      rooms: new Map<string, string>(),
      states: new Map<string, Record<string, unknown>>(),
    };
  }

  const { data: rooms } = await admin
    .from("rooms")
    .select("id, name")
    .in("home_id", homeIds);

  const roomMap = new Map<string, string>();
  (rooms ?? []).forEach((room) => roomMap.set(room.id, room.name));

  const { data: devices } = await admin
    .from("devices")
    .select("id, name, kind, room_id, home_id")
    .in("home_id", homeIds);

  const deviceIds = (devices ?? []).map((d) => d.id);

  const { data: states } = deviceIds.length
    ? await admin
        .from("device_state")
        .select("device_id, state")
        .in("device_id", deviceIds)
    : { data: [] };

  const stateMap = new Map<string, Record<string, unknown>>();
  (states ?? []).forEach((row: VoiceStateRow) => {
    stateMap.set(row.device_id, row.state ?? {});
  });

  return {
    devices: (devices ?? []) as VoiceDevice[],
    rooms: roomMap,
    states: stateMap,
  };
}

export async function upsertDeviceState(
  deviceId: string,
  patch: Record<string, unknown>,
) {
  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("device_state")
    .select("state")
    .eq("device_id", deviceId)
    .maybeSingle();

  const mergedState = { ...(existing?.state ?? {}), ...patch };
  await admin
    .from("device_state")
    .upsert({ device_id: deviceId, state: mergedState });
  return mergedState;
}

export async function enqueueDeviceCommand(
  deviceId: string,
  command: Record<string, unknown>,
) {
  const admin = getSupabaseAdmin();
  await admin.from("device_commands").insert({ device_id: deviceId, command });
}
