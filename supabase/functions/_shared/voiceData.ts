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

const VOICE_CONTROLLABLE_KINDS = new Set([
  "light",
  "ac",
  "tv",
  "fan",
  "speaker",
]);

export function isVoiceControllableKind(kind: string) {
  return VOICE_CONTROLLABLE_KINDS.has(kind);
}

function voicePermissionForKind(kind: string) {
  if (kind === "light") return "light.control";
  if (kind === "ac") return "climate.control";
  return "device.control";
}

function roleAllowsPermission(role: string, permission: string) {
  if (role === "owner" || role === "admin") return true;
  if (role === "member") {
    return [
      "device.view",
      "device.control",
      "light.control",
      "climate.control",
    ].includes(permission);
  }
  if (role === "tenant") {
    return [
      "device.view",
      "device.control",
      "light.control",
      "climate.control",
    ].includes(permission);
  }
  if (role === "guest") {
    return ["device.view", "light.control", "climate.control"].includes(
      permission,
    );
  }
  return false;
}

export async function fetchVoiceData(userId: string) {
  const admin = getSupabaseAdmin();
  const { data: memberships, error: memberError } = await admin
    .from("home_members")
    .select("home_id, role")
    .eq("user_id", userId);

  if (memberError) throw memberError;
  const fullHomeIds = (memberships ?? [])
    .filter((membership) => ["owner", "admin", "member"].includes(membership.role))
    .map((membership) => membership.home_id);
  const restrictedHomeIds = (memberships ?? [])
    .filter((membership) => ["guest", "tenant"].includes(membership.role))
    .map((membership) => membership.home_id);
  if (!fullHomeIds.length && !restrictedHomeIds.length) {
    return {
      devices: [],
      rooms: new Map<string, string>(),
      states: new Map<string, Record<string, unknown>>(),
    };
  }
  const homeIds = [...fullHomeIds, ...restrictedHomeIds];
  const membershipRoles = new Map<string, string>(
    (memberships ?? []).map((membership) => [
      membership.home_id,
      membership.role,
    ] as [string, string]),
  );
  const { data: overrideRows, error: overrideError } = await admin
    .from("member_permission_overrides")
    .select("home_id, permission, allowed")
    .eq("user_id", userId)
    .in("home_id", homeIds);
  if (overrideError) throw overrideError;
  const overrideMap = new Map<string, boolean>(
    (overrideRows ?? []).map((row) => [
      `${row.home_id}:${row.permission}`,
      row.allowed,
    ] as [string, boolean]),
  );
  const hasPermission = (homeId: string, permission: string) => {
    const role = membershipRoles.get(homeId) ?? "";
    if (role === "owner") return true;
    const override = overrideMap.get(`${homeId}:${permission}`);
    return override ?? roleAllowsPermission(role, permission);
  };

  const { data: assignedRooms, error: assignedRoomError } = restrictedHomeIds.length
    ? await admin
        .from("room_members")
        .select("room_id, rooms!inner(id, name, home_id)")
        .eq("user_id", userId)
        .in("rooms.home_id", restrictedHomeIds)
    : { data: [], error: null };
  if (assignedRoomError) throw assignedRoomError;
  const restrictedRooms = (assignedRooms ?? []).flatMap((row) => {
    const room = Array.isArray(row.rooms) ? row.rooms[0] : row.rooms;
    return room ? [room] : [];
  });
  const restrictedRoomIds = restrictedRooms.map((room) => room.id);

  const { data: fullRooms, error: fullRoomError } = fullHomeIds.length
    ? await admin
        .from("rooms")
        .select("id, name, home_id")
        .in("home_id", fullHomeIds)
    : { data: [], error: null };
  if (fullRoomError) throw fullRoomError;

  const roomMap = new Map<string, string>();
  [...(fullRooms ?? []), ...restrictedRooms].forEach((room) =>
    roomMap.set(room.id, room.name)
  );

  const { data: fullDevices, error: fullDeviceError } = fullHomeIds.length
    ? await admin
        .from("devices")
        .select("id, name, kind, room_id, home_id")
        .in("home_id", fullHomeIds)
    : { data: [], error: null };
  if (fullDeviceError) throw fullDeviceError;
  const { data: restrictedDevices, error: restrictedDeviceError } =
    restrictedRoomIds.length
      ? await admin
          .from("devices")
          .select("id, name, kind, room_id, home_id")
          .in("home_id", restrictedHomeIds)
          .in("room_id", restrictedRoomIds)
      : { data: [], error: null };
  if (restrictedDeviceError) throw restrictedDeviceError;

  const devices = [...(fullDevices ?? []), ...(restrictedDevices ?? [])].filter(
    (device) =>
      isVoiceControllableKind(device.kind) &&
      hasPermission(device.home_id, "device.view") &&
      hasPermission(device.home_id, voicePermissionForKind(device.kind)),
  );

  const deviceIds = devices.map((device) => device.id);

  const { data: states, error: stateError } = deviceIds.length
    ? await admin
        .from("device_state")
        .select("device_id, state")
        .in("device_id", deviceIds)
    : { data: [], error: null };
  if (stateError) throw stateError;

  const stateMap = new Map<string, Record<string, unknown>>();
  (states ?? []).forEach((row: VoiceStateRow) => {
    stateMap.set(row.device_id, row.state ?? {});
  });

  return {
    devices: devices as VoiceDevice[],
    rooms: roomMap,
    states: stateMap,
  };
}

export async function enqueueDeviceCommand(
  userId: string,
  deviceId: string,
  source: "alexa" | "google",
  patch: Record<string, unknown>,
) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("enqueue_voice_device_command", {
    target_user_id: userId,
    target_device_id: deviceId,
    voice_source: source,
    command_patch: patch,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}
