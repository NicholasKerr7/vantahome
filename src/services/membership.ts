import { supabase } from "./supabaseClient";
import type {
  Device,
  Room,
  HouseholdMember,
  MemberPermissionOverride,
  RoomMembership,
} from "../store/useHomeStore";
import { clearHomeAccountState, useHomeStore } from "../store/useHomeStore";
import { applyDeviceStatePatch } from "../store/deviceState";
import { parseDeviceStatePatch } from "./transportSchemas";
import {
  ACTION_PERMISSIONS,
  type ActionPermission,
} from "../security/permissions";

type HomeMemberRow = {
  user_id: string;
  role: string;
  access_expires_at?: string | null;
  share_interior_layout?: boolean;
};

type RoomMemberRow = {
  room_id: string;
  user_id: string;
};

type RoomRow = {
  id: string;
  name: string;
  model_room_id?: string | null;
};

type DeviceRow = {
  id: string;
  name: string;
  kind: Device["kind"];
  room_id: string | null;
  model_device_id?: string | null;
  simulation_only?: boolean;
  device_state:
    | { state: unknown; updated_at: string }
    | Array<{ state: unknown; updated_at: string }>
    | null;
};

type PermissionOverrideRow = {
  user_id: string;
  permission: string;
  allowed: boolean;
};

export type MembershipSyncResult = {
  homeId: string;
  rooms: Room[];
  devices: Device[];
  household: HouseholdMember[];
  roomMembers: RoomMembership[];
  permissionOverrides: MemberPermissionOverride[];
  activeMemberId: string;
};

/** Translate server roles into the presentation and local authorization vocabulary. */
function mapRole(role: string): HouseholdMember["role"] {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "member":
      return "Member";
    case "tenant":
      return "Tenant";
    case "guest":
      return "Guest";
    default:
      return "Member";
  }
}

/** Reject any failed policy or registry read before an incomplete snapshot can escape. */
async function requireMembershipRead<Result extends { error: unknown }>(
  query: PromiseLike<Result>,
): Promise<Result> {
  const result = await query;
  if (result.error) throw result.error;
  return result;
}

/** Read an authorized home, retaining the active one unless an invitation selects another. */
export async function syncMembershipFromSupabase(
  expectedUserId?: string,
  preferredHomeId?: string,
): Promise<MembershipSyncResult | null> {
  const client = supabase;
  if (!client) return null;
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userData?.user) return null;

  const userId = userData.user.id;
  if (expectedUserId && expectedUserId !== userId) return null;
  const { data: memberships, error: membershipError } = await client
    .from("home_members")
    .select("home_id, role, access_expires_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (membershipError) throw membershipError;
  const rows = (memberships ?? []) as Array<{ home_id: string; role: string }>;
  const current = useHomeStore.getState();
  const retainedHomeId = current.authenticatedUserId === userId ? current.accountHomeId : null;
  // An explicit invitation must never silently open a different household.
  const membership = preferredHomeId !== undefined
    ? rows.find((row) => row.home_id === preferredHomeId)
    : rows.find((row) => row.home_id === retainedHomeId) ?? rows[0];
  if (!membership) return null;

  // These reads share the verified account/home scope, but do not depend on each
  // other. Only room grants wait for room IDs; the result remains one snapshot.
  const roomsRequest = requireMembershipRead(client
    .from("rooms")
    .select("id, name, model_room_id")
    .eq("home_id", membership.home_id));
  const roomMembersRequest = roomsRequest.then(async ({ data }): Promise<RoomMembership[]> => {
    const roomIds = ((data ?? []) as RoomRow[]).map((room) => room.id);
    if (!roomIds.length) return [];
    const { data: roomMembersData } = await requireMembershipRead(client
      .from("room_members")
      .select("room_id, user_id")
      .in("room_id", roomIds));
    const grouped: Record<string, string[]> = {};
    (roomMembersData as RoomMemberRow[] | null)?.forEach((row) => {
      if (!grouped[row.user_id]) grouped[row.user_id] = [];
      grouped[row.user_id].push(row.room_id);
    });
    return Object.keys(grouped).map((memberId) => ({
      memberId,
      roomIds: grouped[memberId],
    }));
  });
  const [
    { data: membersData },
    { data: roomsData },
    { data: devicesData },
    { data: overrideData },
    roomMembers,
  ] = await Promise.all([
    requireMembershipRead(client
      .from("home_members")
      .select("user_id, role, access_expires_at, share_interior_layout")
      .eq("home_id", membership.home_id)),
    roomsRequest,
    requireMembershipRead(client
      .from("devices")
      .select("id, name, kind, room_id, model_device_id, simulation_only, device_state(state, updated_at)")
      .eq("home_id", membership.home_id)),
    // Failed overrides must never silently become the role's default permissions.
    requireMembershipRead(client
      .from("member_permission_overrides")
      .select("user_id, permission, allowed")
      .eq("home_id", membership.home_id)),
    roomMembersRequest,
  ]);

  const devices = ((devicesData ?? []) as unknown as DeviceRow[]).map((row) => {
    const device: Device = {
      id: row.id,
      name: row.name,
      kind: row.kind,
      roomId: row.room_id ?? "",
      modelDeviceId: row.model_device_id,
      simulationOnly: row.simulation_only === true,
      isOn: false,
    };
    const observation = Array.isArray(row.device_state)
      ? row.device_state[0]
      : row.device_state;
    const patch = parseDeviceStatePatch(observation?.state);
    const timestamp = Date.parse(observation?.updated_at ?? "");
    return {
      ...device,
      ...patch,
      // Transport observations cannot change this authoritative registry boundary.
      simulationOnly: device.simulationOnly,
      observedAt: Number.isFinite(timestamp) ? timestamp : 0,
    };
  });

  // Account metadata is external input; only a nonempty string can label a member.
  const ownNames: unknown[] = [userData.user.user_metadata?.full_name, userData.user.user_metadata?.name, userData.user.email];
  const ownName = ownNames.find((name): name is string => typeof name === "string" && name.trim().length > 0)?.trim() ?? "You";
  const household: HouseholdMember[] =
    (membersData as HomeMemberRow[] | null)?.map((row) => ({
      id: row.user_id,
      userId: row.user_id,
      name:
        row.user_id === userId
          ? ownName
          : "Member",
      role: mapRole(row.role),
      accessExpiresAt: row.access_expires_at,
      shareInteriorLayout: row.share_interior_layout === true,
      status: "away",
    })) ?? [];

  const validPermissions = new Set<string>(ACTION_PERMISSIONS);
  const permissionOverrides =
    (overrideData as PermissionOverrideRow[] | null)
      ?.filter((row) => validPermissions.has(row.permission))
      .map((row) => ({
        memberId: row.user_id,
        permission: row.permission as ActionPermission,
        allowed: row.allowed,
      })) ?? [];

  return {
    homeId: membership.home_id,
    rooms: ((roomsData ?? []) as RoomRow[]).map((room) => ({ id: room.id, name: room.name, modelRoomId: room.model_room_id })),
    devices,
    household,
    roomMembers,
    permissionOverrides,
    activeMemberId: userId,
  };
}

/** Install registry and policy atomically, and reject an old account's late response. */
export function applyMembershipSnapshot(result: MembershipSyncResult, expectedSessionEpoch?: number) {
  const current = useHomeStore.getState();
  if (expectedSessionEpoch !== undefined && current.sessionEpoch !== expectedSessionEpoch) return false;
  if (current.authenticatedUserId !== result.activeMemberId) return false;
  if (!result.household.some((member) => member.id === result.activeMemberId))
    return false;
  if (current.accountHomeId && current.accountHomeId !== result.homeId) {
    clearHomeAccountState(result.activeMemberId);
  }
  const previousDevices =
    current.accountHomeId === result.homeId
      ? new Map(current.devices.map((device) => [device.id, device]))
      : new Map<string, Device>();
  const devices = result.devices.map((device) => {
    const previous = previousDevices.get(device.id);
    if (previous && (previous.observedAt ?? 0) >= (device.observedAt ?? 0)) {
      return {
        ...previous,
        id: device.id,
        name: device.name,
        kind: device.kind,
        roomId: device.roomId,
        modelDeviceId: device.modelDeviceId,
        simulationOnly: device.simulationOnly,
      };
    }
    return applyDeviceStatePatch(
      [previous ?? device],
      device.id,
      device,
      device.observedAt,
    )[0];
  });
  useHomeStore.setState({
    // Identity belongs to this verified account even when its household changes.
    profile: current.profile,
    userName: current.userName,
    accountHomeId: result.homeId,
    activeHomeId: result.homeId,
    membershipReady: true,
    membershipVerification: 'idle',
    rooms: result.rooms,
    devices,
    household: result.household,
    roomMembers: result.roomMembers,
    memberPermissionOverrides: result.permissionOverrides,
    activeMemberId: result.activeMemberId,
  });
  return true;
}
