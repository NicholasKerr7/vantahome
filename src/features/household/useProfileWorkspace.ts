import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Alert, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import {
  selectActiveMember,
  selectVisibleDevices,
  selectVisibleRooms,
  type IntegrationProvider,
  useHomeStore,
} from "../../store/useHomeStore";
import { setRoomMembershipRemote } from "../../services/roomMembers";
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
import { canEditMemberPermission, useMemberPermissionUpdate } from "./useMemberPermissionUpdate";
import {
  canAdministerMember,
  roleHasPermission,
} from "../../security/permissions";
import { runtimePolicy } from "../../config/runtimeMode";
import { buildInvitationAccess, type GuestAccessHours } from "./invitationAccess";
import { isInvitationExpired } from "../home-access/invitationExpiry";
import { useInteriorLayoutSharing } from "./useInteriorLayoutSharing";
import { useProfileDraft } from "./useProfileDraft";
import { useAccountPreferences } from "../account/useAccountPreferences";
import { useAccountIdentity } from "../account/useAccountIdentity";
import { isAccountScopeCurrent, type AccountScope } from "../account/accountIdentity";
import { discardPreparedPortrait, prepareProfilePortrait } from "./profilePortrait";

/** Reject delayed household mutations after changing home, account, or session. */
function scopeIsCurrent(previous: ReturnType<typeof useHomeStore.getState>) {
  const state = useHomeStore.getState();
  return (
    isAccountScopeCurrent(previous, state) &&
    state.sessionEpoch === previous.sessionEpoch &&
    state.activeHomeId === previous.activeHomeId &&
    state.activeMemberId === previous.activeMemberId &&
    (!supabase || state.membershipReady)
  );
}

/** Re-evaluate invitation authority against the current role and its effective overrides. */
function canInviteFromState(state: ReturnType<typeof useHomeStore.getState>, requestedRole: string) {
  const actor = selectActiveMember(state);
  return Boolean(actor && ["Owner", "Admin"].includes(actor.role) &&
    (requestedRole !== "Admin" || actor.role === "Owner") && roleHasPermission(
    actor.role, "member.invite", state.memberPermissionOverrides.filter((item) => item.memberId === actor.id),
  ));
}

/** Keep profile edits and protected household actions separate from their paged presentation. */
export function useProfileWorkspace(navigation: { goBack: () => void }) {
  const interiorLayoutSharing = useInteriorLayoutSharing();
  const permissionUpdates = useMemberPermissionUpdate();
  const draft = useProfileDraft(navigation.goBack);
  const { scope: accountScope } = useAccountIdentity();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const { preferences: prefs, setComfortPreferences: setPreferences, preferenceError } = useAccountPreferences();
  const integrations = useHomeStore((s) => s.integrations);
  const roomsCount = useHomeStore((s) => selectVisibleRooms(s).length);
  const devicesCount = useHomeStore((s) => selectVisibleDevices(s).length);
  const household = useHomeStore((s) => s.household);
  const rooms = useHomeStore(useShallow(selectVisibleRooms));
  const activeMember = useHomeStore(selectActiveMember);
  const activeMemberId = useHomeStore((s) => s.activeMemberId);
  const roomMembers = useHomeStore((s) => s.roomMembers);
  const memberPermissionOverrides = useHomeStore(
    (s) => s.memberPermissionOverrides,
  );
  const setRoomMembership = useHomeStore((s) => s.setRoomMembership);
  const addHouseholdMember = useHomeStore((s) => s.addHouseholdMember);
  const removeHouseholdMember = useHomeStore((s) => s.removeHouseholdMember);

  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<
    "Admin" | "Member" | "Guest" | "Tenant"
  >("Guest");
  const [newMemberRoomIds, setNewMemberRoomIds] = useState<string[]>([]);
  const [guestAccessHours, setGuestAccessHours] = useState<GuestAccessHours>(0);
  const [memberPortrait, setMemberPortrait] = useState<{ scope: AccountScope; asset: ImagePicker.ImagePickerAsset } | null>(null);
  const portraitCurrent = memberPortrait && isAccountScopeCurrent(memberPortrait.scope, accountScope);
  const newMemberAvatar = portraitCurrent ? memberPortrait.asset.uri : "";
  const memberPhotoPending = useRef(false);
  const invitationPending = useRef(false);
  const [pendingInvites, setPendingInvites] = useState<HomeInvite[]>([]);
  const [invitesRefreshing, setInvitesRefreshing] = useState(false);
  const [inviteInboxError, setInviteInboxError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [roomAccessBusy, setRoomAccessBusy] = useState(false);
  const roomAccessPending = useRef(false);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);
  const [acceptedInviteId, setAcceptedInviteId] = useState<string | null>(null);
  const inviteResponsePending = useRef(false);
  const acceptedInvite = useRef<{ inviteId: string; homeId: string; userId: string | null; epoch: number } | null>(null);
  const canManageRooms = activeMember
    ? ["Owner", "Admin"].includes(activeMember.role)
    : false;
  const canManageHousehold = canManageRooms;
  /** Resolve administration rights against the current actor. */
  const canEditMember = (member: (typeof household)[number]) =>
    canAdministerMember(selectActiveMember(useHomeStore.getState()), member);
  const canEditPermission = canEditMemberPermission;
  const activePermissionOverrides = memberPermissionOverrides.filter(
    (item) => item.memberId === activeMember?.id,
  );
  const canInviteMembers = Boolean(
    activeMember &&
    ["Owner", "Admin"].includes(activeMember.role) &&
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
  /** Avoid sending local demo identifiers to cloud membership endpoints. */
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  /** Save room access only after an atomic, home-scoped server confirmation. */
  const updateRoomAccess = async (
    memberId: string,
    userId: string | undefined,
    role: (typeof household)[number]["role"],
    nextRoomIds: string[],
  ) => {
    const scope = useHomeStore.getState();
    const target = scope.household.find((member) => member.id === memberId);
    if (roomAccessPending.current || !target || !canEditMember(target) || !["Member", "Guest", "Tenant"].includes(role)) return;
    roomAccessPending.current = true;
    setRoomAccessBusy(true);
    try {
      if (!(await confirmHouseholdAdminChange())) return;
      if (!scopeIsCurrent(scope) || !canEditMember(target)) return;
      if (!supabase) {
        if (runtimePolicy.allowUnauthenticatedDemo) setRoomMembership(memberId, nextRoomIds);
        return;
      }
      if (!scope.activeHomeId || !userId || !isUuid(userId)
        || !nextRoomIds.every((id) => isUuid(id) && scope.rooms.some((room) => room.id === id))) {
        throw new Error("Refresh your home before changing room access.");
      }
      await setRoomMembershipRemote(scope.activeHomeId, userId, nextRoomIds);
      if (scopeIsCurrent(scope)) setRoomMembership(memberId, nextRoomIds);
    } catch (err) {
      if (!scopeIsCurrent(scope)) return;
      Alert.alert(
        "Room access update failed",
        (err as Error).message ?? "Unable to update room access.",
      );
    } finally {
      roomAccessPending.current = false;
      if (scopeIsCurrent(scope)) setRoomAccessBusy(false);
    }
  };
  /** Fetch invitations only for the account and home that requested them. */
  const refreshInvites = useCallback(async () => {
    const scope = useHomeStore.getState();
    // Keep the accepted invitation visible until its exact home's registry can be installed.
    if (acceptedInvite.current?.userId === scope.authenticatedUserId && acceptedInvite.current?.epoch === scope.sessionEpoch) return;
    if (!supabase) {
      setPendingInvites([]);
      return;
    }
    setInvitesRefreshing(true);
    setInviteInboxError(null);
    try {
      const invites = await listPendingInvites(scope.authenticatedUserId ?? undefined);
      if (scopeIsCurrent(scope)) setPendingInvites(invites);
    } catch {
      if (scopeIsCurrent(scope)) setInviteInboxError("Your invitation inbox could not be loaded. Please try again.");
    } finally {
      if (scopeIsCurrent(scope)) setInvitesRefreshing(false);
    }
  }, []);
  useEffect(() => {
    refreshInvites();
  }, [refreshInvites]);
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

  /** Keep a scoped demo selection in memory; copy it only when the local member is saved. */
  const pickHouseholdAvatar = async () => {
    const scope = useHomeStore.getState();
    if (supabase || !runtimePolicy.allowUnauthenticatedDemo || memberPhotoPending.current || invitationPending.current
      || !mounted.current || !isAccountScopeCurrent(accountScope, scope) || !canInviteFromState(scope, newMemberRole)) return;
    memberPhotoPending.current = true;
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!mounted.current || !scopeIsCurrent(scope)) return;
        if (status !== "granted") throw new Error("Enable photo access to add a household member.");
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.65,
      });
      if (!mounted.current || !scopeIsCurrent(scope) || !canInviteFromState(useHomeStore.getState(), newMemberRole)) return;
      if (!result.canceled && result.assets?.[0]?.uri) setMemberPortrait({ scope: accountScope, asset: result.assets[0] });
    } catch (error) {
      if (mounted.current && scopeIsCurrent(scope)) Alert.alert("Photo unavailable", error instanceof Error ? error.message : "Please choose the photo again.");
    } finally {
      memberPhotoPending.current = false;
    }
  };

  /** Removing a draft selection never touches another person's saved photo. */
  const setNewMemberAvatar = (_uri: string) => {
    if (mounted.current && !invitationPending.current && isAccountScopeCurrent(accountScope, useHomeStore.getState())) setMemberPortrait(null);
  };

  /** Invite members using authoritative cloud membership or the explicit demo path. */
  const submitMember = async () => {
    const scope = useHomeStore.getState();
    if (!mounted.current || !isAccountScopeCurrent(accountScope, scope)) return;
    const trimmed = newMemberName.trim();
    const email = newMemberEmail.trim().toLowerCase();
    if (!trimmed || !canInviteFromState(scope, newMemberRole)) return;
    if (newMemberRole === "Admin" && activeMember?.role !== "Owner") return;
    if (!email) {
      Alert.alert("Email required", "Add an email to invite this member.");
      return;
    }
    let access: ReturnType<typeof buildInvitationAccess>;
    try {
      access = buildInvitationAccess(newMemberRole, newMemberRoomIds, rooms.map((room) => room.id), guestAccessHours);
    } catch (error) {
      Alert.alert("Review room access", (error as Error).message);
      return;
    }
    if (!(await confirmHouseholdAdminChange())) return;
    if (!scopeIsCurrent(scope) || !canInviteFromState(useHomeStore.getState(), newMemberRole)) return;
    if (!supabase) {
      if (!runtimePolicy.allowUnauthenticatedDemo) return;
      let prepared: string | null = null;
      let applied = false;
      const localId = `m${Date.now()}`;
      setInviteLoading(true);
      try {
        if (portraitCurrent) prepared = await prepareProfilePortrait(memberPortrait.asset);
        if (!mounted.current || !scopeIsCurrent(scope) || !canInviteFromState(useHomeStore.getState(), newMemberRole)) {
          if (prepared) await discardPreparedPortrait(prepared);
          return;
        }
        applied = true;
        await addHouseholdMember({
          id: localId, userId: localId, name: trimmed, role: newMemberRole, status: "away",
          avatarUri: prepared ?? "", avatarColor: draft.avatarColor, accessExpiresAt: access.accessExpiresAt,
        });
        if (!scopeIsCurrent(scope)) return;
        if (access.roomIds.length) await setRoomMembership(localId, access.roomIds);
        if (!mounted.current || !scopeIsCurrent(scope)) return;
        setNewMemberName(""); setNewMemberEmail(""); setNewMemberRole("Guest");
        setMemberPortrait(null); setNewMemberRoomIds([]); setGuestAccessHours(0);
        Alert.alert("Invite added locally", "Sign in to send real invites from the cloud.");
        return true;
      } catch (error) {
        let removable = !applied;
        if (applied && scopeIsCurrent(scope)) {
          try { await removeHouseholdMember(localId); removable = true; } catch { /* Keep the file if a persisted member might still reference it. */ }
        }
        if (prepared && removable) {
          try { await discardPreparedPortrait(prepared); } catch { /* Keep the original save failure visible. */ }
        }
        if (mounted.current && scopeIsCurrent(scope)) Alert.alert("Invitation not saved", error instanceof Error ? error.message : "Please try again.");
      }
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
      const initialRoomIds = access.roomIds;
      const result = await inviteHomeMember(
        {
          homeId: scope.activeHomeId ?? undefined,
          email,
          name: trimmed,
          role: roleLower,
          roomIds: initialRoomIds.length ? initialRoomIds : undefined,
          accessExpiresAt: access.accessExpiresAt,
        },
        scope.authenticatedUserId ?? undefined,
      );
      if (!scopeIsCurrent(scope)) return;
      // A pending invitation is not accepted household membership.
      Alert.alert(
        result.status === "already_member"
          ? "Already a member"
          : result.delivery === "email_code" ? "Invitation emailed" : "Invitation ready",
        result.status === "already_member"
          ? "This person already belongs to your home."
          : result.delivery === "email_code"
            ? "They can open VantaHome and enter the code from their email to review and accept your invitation."
            : "Ask them to sign in and open People to review their invitation. They will appear as a member after accepting.",
      );
      setNewMemberName("");
      setNewMemberEmail("");
      setNewMemberRole("Guest");
      setMemberPortrait(null);
      setNewMemberRoomIds([]);
      setGuestAccessHours(0);
      await refreshInvites();
      return true;
    } catch (err) {
      if (!scopeIsCurrent(scope)) return;
      const message = (err as Error).message ?? "Unable to invite member.";
      Alert.alert("Invitation not sent", message);
    }
  };

  /** Latch confirmation and persistence so rapid taps cannot create duplicate invitations. */
  const handleAddMember = async () => {
    if (invitationPending.current || memberPhotoPending.current) return;
    invitationPending.current = true;
    try { return await submitMember(); }
    finally {
      invitationPending.current = false;
      if (mounted.current) setInviteLoading(false);
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
    const invitation = pendingInvites.find((item) => item.id === inviteId);
    if (!invitation || inviteResponsePending.current || !scopeIsCurrent(scope)) return;
    if (action === "accept" && isInvitationExpired(invitation) && acceptedInvite.current?.inviteId !== inviteId) {
      Alert.alert("Invitation expired", "Ask the home administrator for a new invitation.");
      return;
    }
    const accepted = acceptedInvite.current;
    const pendingAcceptance = accepted?.userId === scope.authenticatedUserId && accepted.epoch === scope.sessionEpoch;
    // Once the server accepts, retry only the registry read before another household decision.
    if (pendingAcceptance && (action !== "accept" || accepted.inviteId !== inviteId)) return;
    inviteResponsePending.current = true;
    setRespondingInviteId(inviteId);
    try {
      const alreadyAccepted = action === "accept" && accepted?.inviteId === inviteId
        && accepted.userId === scope.authenticatedUserId && accepted.epoch === scope.sessionEpoch;
      if (!alreadyAccepted) {
        const response = await respondHomeInvite(inviteId, action, scope.authenticatedUserId ?? undefined);
        if (response.inviteId !== inviteId || response.status !== (action === "accept" ? "accepted" : "declined")) throw new Error("The invitation was not confirmed. Please refresh and try again.");
        if (action === "accept" && scopeIsCurrent(scope)) {
          acceptedInvite.current = { inviteId, homeId: invitation.home_id, userId: scope.authenticatedUserId, epoch: scope.sessionEpoch };
          setAcceptedInviteId(inviteId);
        }
      }
      if (!scopeIsCurrent(scope)) return;
      if (action === "accept") {
        const result = await syncMembershipFromSupabase(scope.authenticatedUserId ?? undefined, invitation.home_id);
        if (!scopeIsCurrent(scope)) return;
        if (!result || result.homeId !== invitation.home_id || !applyMembershipSnapshot(result, scope.sessionEpoch)) throw new Error("Your invitation was accepted, but home access could not be refreshed. Tap Retry home access to continue.");
        acceptedInvite.current = null;
        setAcceptedInviteId(null);
      }
      setPendingInvites((prev) => prev.filter((item) => item.id !== inviteId));
    } catch (err) {
      if (!scopeIsCurrent(scope)) return;
      Alert.alert(
        "Invite response failed",
        (err as Error).message ?? "Unable to respond to invite.",
      );
    } finally {
      inviteResponsePending.current = false;
      if (scopeIsCurrent(scope)) setRespondingInviteId(null);
    }
  };


  return {
    ...draft,
    prefs,
    preferenceError,
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
    newMemberName,
    setNewMemberName,
    newMemberEmail,
    setNewMemberEmail,
    newMemberRole,
    setNewMemberRole,
    newMemberAvatar,
    setNewMemberAvatar,
    newMemberRoomIds,
    setNewMemberRoomIds,
    guestAccessHours,
    setGuestAccessHours,
    pendingInvites,
    invitesRefreshing,
    inviteInboxError,
    refreshInvites,
    inviteLoading,
    respondingInviteId,
    acceptedInviteId,
    canManageRooms,
    canManageHousehold,
    canInviteMembers,
    canEditMember,
    canEditPermission,
    updateRoomAccess, roomAccessBusy,
    interiorLayoutSharing,
    ...permissionUpdates,
    serviceItems,
    pickHouseholdAvatar,
    handleAddMember,
    handleRemoveMember,
    handleRespondInvite,
  };
}

export type ProfileWorkspaceModel = ReturnType<typeof useProfileWorkspace>;
