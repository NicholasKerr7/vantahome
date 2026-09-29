import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { theme } from "../../theme/theme";
import {
  selectActiveMember,
  selectVisibleDevices,
  selectVisibleRooms,
  type IntegrationProvider,
  useHomeStore,
} from "../../store/useHomeStore";
import {
  setRoomMembershipRemote,
  type RoomMemberRole,
} from "../../services/roomMembers";
import {
  inviteHomeMember,
  listPendingInvites,
  respondHomeInvite,
  type HomeInvite,
} from "../../services/cloudRegistry";
import {
  applyMembershipSnapshot,
  syncMembershipFromSupabase,
} from "../../services/membership";
import { supabase } from "../../services/supabaseClient";
import { confirmProtectedAccess } from "../../security/biometricConfirmation";
import { setMemberPermissionOverrideRemote } from "../../services/memberPermissions";
import {
  canAdministerMember,
  roleHasPermission,
  type ActionPermission,
} from "../../security/permissions";
import { runtimePolicy } from "../../config/runtimeMode";
import { cancelAuthFlow, waitForAuthExchange } from "../../services/authFlow";

/** Reject delayed household mutations after changing home, account, or session. */
function scopeIsCurrent(previous: ReturnType<typeof useHomeStore.getState>) {
  const state = useHomeStore.getState();
  return (
    state.authenticatedUserId === previous.authenticatedUserId &&
    state.sessionEpoch === previous.sessionEpoch &&
    state.activeHomeId === previous.activeHomeId &&
    state.activeMemberId === previous.activeMemberId &&
    (!supabase || state.membershipReady)
  );
}

/** Keep profile edits and protected household actions separate from their paged presentation. */
export function useProfileWorkspace(navigation: { goBack: () => void }) {
  const profile = useHomeStore((s) => s.profile);
  const setProfile = useHomeStore((s) => s.setProfile);
  const prefs = useHomeStore((s) => s.preferences);
  const setPreferences = useHomeStore((s) => s.setPreferences);
  const integrations = useHomeStore((s) => s.integrations);
  const roomsCount = useHomeStore((s) => selectVisibleRooms(s).length);
  const devicesCount = useHomeStore((s) => selectVisibleDevices(s).length);
  const household = useHomeStore((s) => s.household);
  const rooms = useHomeStore(selectVisibleRooms);
  const activeMember = useHomeStore(selectActiveMember);
  const activeMemberId = useHomeStore((s) => s.activeMemberId);
  const roomMembers = useHomeStore((s) => s.roomMembers);
  const memberPermissionOverrides = useHomeStore(
    (s) => s.memberPermissionOverrides,
  );
  const setMemberPermissionOverride = useHomeStore(
    (s) => s.setMemberPermissionOverride,
  );
  const setRoomMembership = useHomeStore((s) => s.setRoomMembership);
  const addHouseholdMember = useHomeStore((s) => s.addHouseholdMember);
  const removeHouseholdMember = useHomeStore((s) => s.removeHouseholdMember);

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [homeName, setHomeName] = useState(profile.homeName ?? "");
  const [avatarColor, setAvatarColor] = useState(
    profile.avatarColor ?? theme.colors.accent2,
  );
  const [avatarUri, setAvatarUri] = useState(profile.avatarUri ?? "");
  const [timeFormat, setTimeFormat] = useState(profile.timeFormat ?? "12h");
  const [tempUnit, setTempUnit] = useState(profile.tempUnit ?? "C");
  const [timezone, setTimezone] = useState(profile.timezone ?? "Auto");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<
    "Admin" | "Member" | "Guest" | "Tenant"
  >("Guest");
  const [newMemberAvatar, setNewMemberAvatar] = useState("");
  const [pendingInvites, setPendingInvites] = useState<HomeInvite[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const canManageRooms = activeMember
    ? ["Owner", "Admin"].includes(activeMember.role)
    : false;
  const canManageHousehold = canManageRooms;
  /** Resolve administration rights against the current actor. */
  const canEditMember = (member: (typeof household)[number]) =>
    canAdministerMember(selectActiveMember(useHomeStore.getState()), member);
  /** An administrator may only delegate permissions they currently hold. */
  const canEditPermission = (
    member: (typeof household)[number],
    permission: ActionPermission,
  ) => {
    const state = useHomeStore.getState();
    const actor = selectActiveMember(state);
    return (
      canAdministerMember(actor, member) &&
      Boolean(
        actor &&
        roleHasPermission(
          actor.role,
          permission,
          state.memberPermissionOverrides.filter(
            (item) => item.memberId === actor.id,
          ),
        ),
      )
    );
  };
  const activePermissionOverrides = memberPermissionOverrides.filter(
    (item) => item.memberId === activeMember?.id,
  );
  const canInviteMembers = Boolean(
    activeMember &&
    roleHasPermission(
      activeMember.role,
      "member.invite",
      activePermissionOverrides,
    ),
  );
  /** Authenticate sensitive household changes before local or remote writes. */
  const confirmHouseholdAdminChange = async () => {
    try {
      await confirmProtectedAccess("Confirm household administration change");
      return true;
    } catch {
      Alert.alert(
        "Confirmation required",
        "Authenticate again before changing household access.",
      );
      return false;
    }
  };
  /** Translate household roles to the room membership service contract. */
  const resolveRoomRole = (
    role: (typeof household)[number]["role"],
  ): RoomMemberRole | null => {
    if (role === "Member") return "member";
    if (role === "Guest") return "guest";
    if (role === "Tenant") return "tenant";
    return null;
  };
  /** Avoid sending local demo identifiers to cloud membership endpoints. */
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  /** Save room access with protected confirmation and scoped rollback. */
  const updateRoomAccess = async (
    memberId: string,
    userId: string | undefined,
    role: (typeof household)[number]["role"],
    prevRoomIds: string[],
    nextRoomIds: string[],
  ) => {
    const scope = useHomeStore.getState();
    if (!(await confirmHouseholdAdminChange())) return;
    if (!scopeIsCurrent(scope)) return;
    setRoomMembership(memberId, nextRoomIds);
    const roomRole = resolveRoomRole(role);
    if (!userId || !roomRole || !isUuid(userId) || !nextRoomIds.every(isUuid))
      return;
    try {
      await setRoomMembershipRemote(userId, nextRoomIds, roomRole);
    } catch (err) {
      if (!scopeIsCurrent(scope)) return;
      setRoomMembership(memberId, prevRoomIds);
      Alert.alert(
        "Room access update failed",
        (err as Error).message ?? "Unable to update room access.",
      );
    }
  };
  /** Save a permission override without allowing stale-account mutations. */
  const updatePermissionOverride = async (
    member: (typeof household)[number],
    permission: ActionPermission,
    allowed: boolean | null,
  ) => {
    const scope = useHomeStore.getState();
    if (!canEditPermission(member, permission)) return;
    if (!(await confirmHouseholdAdminChange())) return;
    if (!scopeIsCurrent(scope) || !canEditPermission(member, permission))
      return;
    const previous = memberPermissionOverrides.find(
      (item) => item.memberId === member.id && item.permission === permission,
    );
    setMemberPermissionOverride(member.id, permission, allowed);
    if (!member.userId || !isUuid(member.userId)) return;
    try {
      await setMemberPermissionOverrideRemote(
        member.userId,
        permission,
        allowed,
      );
    } catch (err) {
      if (!scopeIsCurrent(scope)) return;
      setMemberPermissionOverride(
        member.id,
        permission,
        previous?.allowed ?? null,
      );
      Alert.alert(
        "Permission update failed",
        (err as Error).message ?? "Unable to update this permission.",
      );
    }
  };
  /** Fetch invitations only for the account and home that requested them. */
  const refreshInvites = useCallback(async () => {
    const scope = useHomeStore.getState();
    if (!supabase) {
      setPendingInvites([]);
      return;
    }
    try {
      const invites = await listPendingInvites();
      if (scopeIsCurrent(scope)) setPendingInvites(invites);
    } catch {
      if (scopeIsCurrent(scope)) setPendingInvites([]);
    }
  }, []);
  useEffect(() => {
    refreshInvites();
  }, [refreshInvites]);
  const [biometricLock, setBiometricLock] = useState(true);
  const [locationSharing, setLocationSharing] = useState(true);
  const [activitySharing, setActivitySharing] = useState(false);
  const [autoUpdates, setAutoUpdates] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const serviceItems: Array<{
    provider: IntegrationProvider;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    {
      provider: "alexa",
      label: "Amazon Alexa",
      icon: "logo-amazon",
    },
    {
      provider: "google",
      label: "Google Home",
      icon: "logo-google",
    },
    {
      provider: "homekit",
      label: "Apple HomeKit",
      icon: "logo-apple",
    },
    {
      provider: "matter",
      label: "Matter Bridge",
      icon: "link-outline",
    },
  ];
  const securityItems = [
    {
      id: "biometric",
      label: "Biometric lock",
      sub: "Face ID / Touch ID",
      value: biometricLock,
      onChange: setBiometricLock,
    },
    {
      id: "location",
      label: "Location sharing",
      sub: "Used for presence automations",
      value: locationSharing,
      onChange: setLocationSharing,
    },
    {
      id: "activity",
      label: "Activity sharing",
      sub: "Share usage with household",
      value: activitySharing,
      onChange: setActivitySharing,
    },
  ];
  const reportItems = [
    {
      id: "updates",
      label: "Auto updates",
      sub: "Install overnight",
      value: autoUpdates,
      onChange: setAutoUpdates,
    },
    {
      id: "digest",
      label: "Weekly digest",
      sub: "Energy and safety summary",
      value: weeklyDigest,
      onChange: setWeeklyDigest,
    },
  ];

  /** Persist the edited profile fields and return to the previous workspace. */
  const onSave = () => {
    setProfile({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      homeName: homeName.trim(),
      avatarColor,
      avatarUri,
      timeFormat,
      tempUnit,
      timezone: timezone.trim() || "Auto",
    });
    navigation.goBack();
  };

  /** Request photo access only when changing the profile avatar. */
  const pickAvatar = async () => {
    // Request library access at runtime to avoid startup permission prompts.
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Enable photo access to upload a profile avatar.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  /** Pick an optional invitation avatar without startup permission prompts. */
  const pickHouseholdAvatar = async () => {
    // Reuse the image picker for household members to keep uploads consistent.
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Enable photo access to add a household member.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setNewMemberAvatar(result.assets[0].uri);
    }
  };

  /** Invite members using authoritative cloud membership or the explicit demo path. */
  const handleAddMember = async () => {
    const scope = useHomeStore.getState();
    const trimmed = newMemberName.trim();
    const email = newMemberEmail.trim().toLowerCase();
    if (!trimmed || !canInviteMembers) return;
    if (newMemberRole === "Admin" && activeMember?.role !== "Owner") return;
    if (!email) {
      Alert.alert("Email required", "Add an email to invite this member.");
      return;
    }
    if (!(await confirmHouseholdAdminChange())) return;
    if (!scopeIsCurrent(scope)) return;
    /** Create a local demo person with the same initial room scope as an invite. */
    const addMemberLocally = () => {
      const localId = `m${Date.now()}`;
      const initialRoomIds =
        newMemberRole === "Guest" || newMemberRole === "Tenant"
          ? rooms.map((room) => room.id).slice(0, 1)
          : [];
      addHouseholdMember({
        id: localId,
        userId: localId,
        name: trimmed,
        role: newMemberRole,
        status: "away",
        avatarUri: newMemberAvatar,
        avatarColor: avatarColor,
      });
      if (initialRoomIds.length) {
        setRoomMembership(localId, initialRoomIds);
      }
      setNewMemberName("");
      setNewMemberEmail("");
      setNewMemberRole("Guest");
      setNewMemberAvatar("");
    };
    if (!supabase) {
      if (!runtimePolicy.allowUnauthenticatedDemo) return;
      addMemberLocally();
      Alert.alert(
        "Invite added locally",
        "Sign in to send real invites from the cloud.",
      );
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!scopeIsCurrent(scope)) return;
      if (!sessionData.session?.access_token) {
        Alert.alert(
          "Sign in required",
          "Sign in again to send this invitation.",
        );
        return;
      }
    } catch {
      if (scopeIsCurrent(scope))
        Alert.alert(
          "Sign in required",
          "Sign in again to send this invitation.",
        );
      return;
    }
    try {
      setInviteLoading(true);
      const roleLower = newMemberRole.toLowerCase() as
        "admin" | "member" | "guest" | "tenant";
      const initialRoomIds =
        newMemberRole === "Guest" || newMemberRole === "Tenant"
          ? rooms.map((room) => room.id).slice(0, 1)
          : [];
      const result = await inviteHomeMember(
        {
          email,
          name: trimmed,
          role: roleLower,
          roomIds: initialRoomIds.length ? initialRoomIds : undefined,
        },
        scope.authenticatedUserId ?? undefined,
      );
      if (!scopeIsCurrent(scope)) return;
      // A pending invitation is not accepted household membership.
      Alert.alert(
        result.status === "already_member"
          ? "Already a member"
          : "Invitation sent",
        result.status === "already_member"
          ? "This person already belongs to your home."
          : "They will appear as a member after accepting.",
      );
      setNewMemberName("");
      setNewMemberEmail("");
      setNewMemberRole("Guest");
      setNewMemberAvatar("");
      await refreshInvites();
    } catch (err) {
      if (!scopeIsCurrent(scope)) return;
      const message = (err as Error).message ?? "Unable to invite member.";
      Alert.alert("Invitation not sent", message);
    } finally {
      if (scopeIsCurrent(scope)) setInviteLoading(false);
    }
  };

  /** Remove only authorized members after the server confirms deletion. */
  const handleRemoveMember = async (memberId: string) => {
    const member = household.find((item) => item.id === memberId);
    const scope = useHomeStore.getState();
    if (!member || !canEditMember(member)) return;
    if (!(await confirmHouseholdAdminChange())) return;
    if (!scopeIsCurrent(scope) || !canEditMember(member)) return;
    if (!supabase) {
      if (runtimePolicy.allowUnauthenticatedDemo)
        removeHouseholdMember(memberId);
      return;
    }
    try {
      if (!scope.activeHomeId || !member.userId)
        throw new Error("Verify home access again.");
      const { data, error } = await supabase
        .from("home_members")
        .delete()
        .eq("home_id", scope.activeHomeId)
        .eq("user_id", member.userId)
        .select("user_id")
        .maybeSingle();
      if (!scopeIsCurrent(scope)) return;
      if (error || !data)
        throw new Error("You do not have permission to remove this member.");
      removeHouseholdMember(memberId);
    } catch (error) {
      if (scopeIsCurrent(scope))
        Alert.alert("Member not removed", (error as Error).message);
    }
  };

  /** Accept or decline an invite and refresh accepted membership. */
  const handleRespondInvite = async (
    inviteId: string,
    action: "accept" | "decline",
  ) => {
    const scope = useHomeStore.getState();
    try {
      await respondHomeInvite(
        inviteId,
        action,
        scope.authenticatedUserId ?? undefined,
      );
      if (!scopeIsCurrent(scope)) return;
      setPendingInvites((prev) => prev.filter((item) => item.id !== inviteId));
      if (action === "accept") {
        const result = await syncMembershipFromSupabase();
        if (result) {
          applyMembershipSnapshot(result);
        }
      }
    } catch (err) {
      if (!scopeIsCurrent(scope)) return;
      Alert.alert(
        "Invite response failed",
        (err as Error).message ?? "Unable to respond to invite.",
      );
    }
  };

  /** Confirm sign-out before ending the current local authentication session. */
  const handleSignOut = () => {
    Alert.alert(
      "Sign out",
      "You will need to sign in again to access the home.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            if (supabase) {
              await cancelAuthFlow();
              await waitForAuthExchange();
              const { error } = await supabase.auth.signOut({ scope: "local" });
              if (error) Alert.alert("Sign-out failed", "Please try again.");
            }
          },
        },
      ],
    );
  };

  return {
    profile,
    prefs,
    setPreferences,
    integrations,
    roomsCount,
    devicesCount,
    household,
    rooms,
    activeMember,
    activeMemberId,
    roomMembers,
    memberPermissionOverrides,
    name,
    setName,
    email,
    setEmail,
    phone,
    setPhone,
    homeName,
    setHomeName,
    avatarColor,
    setAvatarColor,
    avatarUri,
    setAvatarUri,
    timeFormat,
    setTimeFormat,
    tempUnit,
    setTempUnit,
    timezone,
    setTimezone,
    newMemberName,
    setNewMemberName,
    newMemberEmail,
    setNewMemberEmail,
    newMemberRole,
    setNewMemberRole,
    newMemberAvatar,
    setNewMemberAvatar,
    pendingInvites,
    inviteLoading,
    canManageRooms,
    canManageHousehold,
    canInviteMembers,
    canEditMember,
    canEditPermission,
    updateRoomAccess,
    updatePermissionOverride,
    serviceItems,
    securityItems,
    reportItems,
    onSave,
    pickAvatar,
    pickHouseholdAvatar,
    handleAddMember,
    handleRemoveMember,
    handleRespondInvite,
    handleSignOut,
  };
}

export type ProfileWorkspaceModel = ReturnType<typeof useProfileWorkspace>;
