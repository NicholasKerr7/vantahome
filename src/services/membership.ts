import { supabase } from "./supabaseClient";
import type {
  HouseholdMember,
  MemberPermissionOverride,
  RoomMembership,
} from "../store/useHomeStore";
import { ACTION_PERMISSIONS, type ActionPermission } from "../security/permissions";

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

type PermissionOverrideRow = {
  user_id: string;
  permission: string;
  allowed: boolean;
};

export type MembershipSyncResult = {
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

export async function syncMembershipFromSupabase(): Promise<
  MembershipSyncResult | null
> {
  if (!supabase) return null;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return null;

  const userId = userData.user.id;
  const { data: membership, error: membershipError } = await supabase
    .from("home_members")
    .select("home_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) return null;

  const { data: membersData } = await supabase
    .from("home_members")
    .select("user_id, role")
    .eq("home_id", membership.home_id);

  const { data: roomsData } = await supabase
    .from("rooms")
    .select("id")
    .eq("home_id", membership.home_id);

  const roomIds = (roomsData as RoomRow[] | null)?.map((room) => room.id) ?? [];
  let roomMembers: RoomMembership[] = [];
  if (roomIds.length) {
    const { data: roomMembersData } = await supabase
      .from("room_members")
      .select("room_id, user_id")
      .in("room_id", roomIds);
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
          ? userData.user.user_metadata?.name ??
            userData.user.email ??
            "You"
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
  if (overrideError) return null;
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
    household,
    roomMembers,
    permissionOverrides,
    activeMemberId: userId,
  };
}
