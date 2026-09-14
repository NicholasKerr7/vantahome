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
};

type RoomMemberRow = {
  room_id: string;
  user_id: string;
};

type RoomRow = {
  id: string;
};

type DeviceRow = {
  id: string;
  name: string;
  kind: Device["kind"];
  room_id: string | null;
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

export async function syncMembershipFromSupabase(
  expectedUserId?: string,
): Promise<MembershipSyncResult | null> {
  if (!supabase) return null;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData?.user) return null;

  const userId = userData.user.id;
  if (expectedUserId && expectedUserId !== userId) return null;
  const { data: membership, error: membershipError } = await supabase
    .from("home_members")
    .select("home_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return null;

  const { data: membersData, error: membersError } = await supabase
    .from("home_members")
    .select("user_id, role")
    .eq("home_id", membership.home_id);

  const { data: roomsData, error: roomsError } = await supabase
    .from("rooms")
    .select("id, name")
    .eq("home_id", membership.home_id);
  if (membersError || roomsError) throw membersError ?? roomsError;

  const { data: devicesData, error: devicesError } = await supabase
    .from("devices")
    .select("id, name, kind, room_id, device_state(state, updated_at)")
    .eq("home_id", membership.home_id);
  if (devicesError) throw devicesError;
  const devices = ((devicesData ?? []) as unknown as DeviceRow[]).map((row) => {
    const device: Device = {
      id: row.id,
      name: row.name,
      kind: row.kind,
      roomId: row.room_id ?? "",
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
      observedAt: Number.isFinite(timestamp) ? timestamp : 0,
    };
  });

  const roomIds = (roomsData as RoomRow[] | null)?.map((room) => room.id) ?? [];
  let roomMembers: RoomMembership[] = [];
  if (roomIds.length) {
    const { data: roomMembersData, error: roomMembersError } = await supabase
      .from("room_members")
      .select("room_id, user_id")
      .in("room_id", roomIds);
    if (roomMembersError) throw roomMembersError;
    const grouped: Record<string, string[]> = {};
    (roomMembersData as RoomMemberRow[] | null)?.forEach((row) => {
      if (!grouped[row.user_id]) grouped[row.user_id] = [];
      grouped[row.user_id].push(row.room_id);
    });
    roomMembers = Object.keys(grouped).map((memberId) => ({
      memberId,
      roomIds: grouped[memberId],
    }));
  }

  const household: HouseholdMember[] =
    (membersData as HomeMemberRow[] | null)?.map((row) => ({
      id: row.user_id,
      userId: row.user_id,
      name:
        row.user_id === userId
          ? (userData.user.user_metadata?.name ?? userData.user.email ?? "You")
          : "Member",
      role: mapRole(row.role),
      status: "away",
    })) ?? [];

  const { data: overrideData, error: overrideError } = await supabase
    .from("member_permission_overrides")
    .select("user_id, permission, allowed")
    .eq("home_id", membership.home_id);
  // Do not replace a previously synchronized security policy with role defaults
  // when the override read fails.
  if (overrideError) throw overrideError;
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
    rooms: (roomsData ?? []) as Room[],
    devices,
    household,
    roomMembers,
    permissionOverrides,
    activeMemberId: userId,
  };
}

/** Install registry and policy atomically, and reject an old account's late response. */
export function applyMembershipSnapshot(result: MembershipSyncResult) {
  const current = useHomeStore.getState();
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
    accountHomeId: result.homeId,
    activeHomeId: result.homeId,
    membershipReady: true,
    rooms: result.rooms,
    devices,
    household: result.household,
    roomMembers: result.roomMembers,
    memberPermissionOverrides: result.permissionOverrides,
    activeMemberId: result.activeMemberId,
  });
  return true;
}
