import React, { useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import AvatarChip from "../../components/AvatarChip";
import Pressable from "../../components/Pressable";
import ModalCard from "../../components/ModalCard";
import ModalForm, { useModalViewportStyle } from "../../components/ModalForm";
import MemberPermissionEditor from "../../components/MemberPermissionEditor";
import {
  DeepAction,
  DeepCard,
  DeepPager,
  DeepTabs,
} from "../../components/deep/DeepScreen";
import { theme } from "../../theme/theme";
import { householdStyles as styles } from "./householdStyles";
import { ProfileChoice, ProfileField, ProfileForm } from "./ProfileControls";
import type { ProfileWorkspaceModel } from "./useProfileWorkspace";
import { GUEST_ACCESS_DURATIONS, formatGuestAccessExpiry } from "./invitationAccess";
import { isInvitationExpired } from "../home-access/invitationExpiry";
import { InteriorLayoutAccess } from "./InteriorLayoutAccess";
import { GuestAccessDeadline, GuestAccessExtension } from "./GuestAccessExtension";
import { canManageGuestAccessExtension } from "../../services/guestAccessExtension";
import { useHomeStore } from "../../store/useHomeStore";
import { supabase } from "../../services/supabaseClient";

const HOUSEHOLD_TABS = [
  { id: "people", label: "Members" },
  { id: "invite", label: "Invite" },
  { id: "inbox", label: "Inbox" },
] as const;

const MEMBER_ACCESS_TABS = [
  { id: "rooms", label: "Rooms" },
  { id: "layout", label: "Interior layout" },
] as const;

/** Present the complete invitation form without exposing accepted membership prematurely. */
function InvitePerson({ model }: { model: ProfileWorkspaceModel }) {
  const [step, setStep] = useState<"person" | "access">("person");
  const limitedRooms = model.newMemberRole === "Guest" || model.newMemberRole === "Tenant";
  if (step === "access") return <InvitationAccess model={model} onBack={() => setStep("person")} />;
  return (
    <ProfileForm>
      <View style={styles.section}>
        <Text style={styles.title}>Welcome someone home.</Text>
        <Text style={styles.subtitle}>
          Choose their role. Access remains under your control.
        </Text>
      </View>
      {!model.canInviteMembers && (
        <Text style={styles.detail}>
          Your effective permissions do not allow invitations.
        </Text>
      )}
      <ProfileField
        label="Full name"
        accessibilityLabel="New member name"
        value={model.newMemberName}
        onChangeText={model.setNewMemberName}
        placeholder="Full name"
        editable={model.canInviteMembers}
      />
      <ProfileField
        label="Email address"
        accessibilityLabel="New member email"
        value={model.newMemberEmail}
        onChangeText={model.setNewMemberEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        editable={model.canInviteMembers}
      />
      <View style={styles.section}>
        <Text style={styles.label}>Household role</Text>
        <View style={styles.choices}>
          {(["Admin", "Member", "Guest", "Tenant"] as const)
            .filter(
              (role) =>
                role !== "Admin" || model.activeMember?.role === "Owner",
            )
            .map((role) => (
              <ProfileChoice
                key={role}
                label={role}
                selected={model.newMemberRole === role}
                disabled={!model.canInviteMembers}
                onPress={() => model.setNewMemberRole(role)}
              />
            ))}
        </View>
      </View>
      <View style={styles.actions}>
        <DeepAction
          label={model.newMemberAvatar ? "Change photo" : "Add photo"}
          icon="image-outline"
          disabled={!model.canInviteMembers}
          onPress={() => void model.pickHouseholdAvatar()}
        />
        {Boolean(model.newMemberAvatar) && (
          <DeepAction
            label="Remove photo"
            disabled={!model.canInviteMembers}
            onPress={() => model.setNewMemberAvatar("")}
          />
        )}
      </View>
      <DeepAction
        label={limitedRooms ? "Choose room access" : "Review access"}
        accessibilityLabel="Review invitation access"
        icon="arrow-forward-outline"
        primary
        disabled={!model.canInviteMembers || !model.newMemberName.trim() || !model.newMemberEmail.trim()}
        onPress={() => setStep("access")}
      />
    </ProfileForm>
  );
}

/** Page room selection separately from the final deadline review; keep actions in a fixed footer. */
function InvitationAccess({ model, onBack }: { model: ProfileWorkspaceModel; onBack: () => void }) {
  const { height, fontScale } = useWindowDimensions();
  const limitedRooms = model.newMemberRole === "Guest" || model.newMemberRole === "Tenant";
  const [step, setStep] = useState<"rooms" | "review">(limitedRooms ? "rooms" : "review");
  const [page, setPage] = useState(0);
  const pageSize = fontScale > 1.2 || height < 750 ? 2 : 4;
  const pageCount = Math.max(1, Math.ceil(model.rooms.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const selectedRooms = model.newMemberRoomIds.filter((id) => model.rooms.some((room) => room.id === id));
  const roomCountLabel = `${selectedRooms.length} ${selectedRooms.length === 1 ? "room" : "rooms"} selected`;
  return <View style={styles.invitationStep}>
    <View style={styles.section}>
      <Text style={styles.title}>{step === "rooms" ? "Choose their rooms." : "Review their access."}</Text>
      <Text style={styles.subtitle}>{model.newMemberName} · {model.newMemberRole}</Text>
    </View>
    <View style={styles.invitationContent}>
      {step === "rooms" ? <>
        <Text style={styles.detail}>Select every room they can use, including shared spaces.</Text>
        <Text style={styles.label}>{roomCountLabel}</Text>
        <View style={styles.choices}>
          {model.rooms.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((room) => <ProfileChoice
            key={room.id}
            label={room.name}
            accessibilityLabel={`Invite access to ${room.name}`}
            selected={selectedRooms.includes(room.id)}
            disabled={!model.canInviteMembers || model.inviteLoading}
            onPress={() => model.setNewMemberRoomIds((previous) => previous.includes(room.id) ? previous.filter((id) => id !== room.id) : [...previous, room.id])}
          />)}
        </View>
        {!model.rooms.length && <Text style={styles.detail}>Add a room before inviting a guest or tenant.</Text>}
        <DeepPager label="invitation rooms" page={currentPage} pageCount={pageCount} onChange={setPage} />
      </> : <>
        <Text style={styles.label}>{limitedRooms ? roomCountLabel : "Whole-home room access"}</Text>
        {model.newMemberRole === "Guest" ? <View style={styles.section}>
          <Text style={styles.label}>Guest access duration</Text>
          <View style={styles.choices}>{GUEST_ACCESS_DURATIONS.map((duration) => <ProfileChoice
            key={duration.hours}
            label={duration.label}
            accessibilityLabel={`Guest access: ${duration.label}`}
            selected={model.guestAccessHours === duration.hours}
            disabled={!model.canInviteMembers || model.inviteLoading}
            onPress={() => model.setGuestAccessHours(duration.hours)}
          />)}</View>
          <Text style={styles.detail}>{model.guestAccessHours ? "Starts when sent. Access ends automatically, even with the app closed." : "Access stays active until you remove this guest."}</Text>
        </View> : <Text style={styles.detail}>{limitedRooms ? "This person can use their selected rooms until you change or remove their access." : "This role can access every room in the home."}</Text>}
        <Text style={styles.detail}>They review and accept your invitation before receiving access.</Text>
      </>}
    </View>
    <View style={styles.footer}>
      <DeepAction label="Back" disabled={model.inviteLoading} onPress={() => step === "review" && limitedRooms ? setStep("rooms") : onBack()} />
      {step === "rooms" ? <DeepAction
        label="Review invitation"
        icon="arrow-forward-outline"
        primary
        disabled={!model.canInviteMembers || model.inviteLoading || selectedRooms.length === 0}
        onPress={() => { if (selectedRooms.length > 0) setStep("review"); }}
      /> : <DeepAction
        label={model.inviteLoading ? "Sending…" : "Invite person"}
        accessibilityLabel="Invite member"
        icon="person-add-outline"
        primary
        disabled={model.inviteLoading || !model.canInviteMembers || (limitedRooms && selectedRooms.length === 0)}
        onPress={() => void model.handleAddMember().then((sent) => { if (sent) onBack(); })}
      />}
    </View>
  </View>;
}

/** Keep household invitations readable one at a time, including the empty state. */
function InvitationInbox({ model }: { model: ProfileWorkspaceModel }) {
  const [page, setPage] = useState(0);
  const currentPage = Math.min(
    page,
    Math.max(0, model.pendingInvites.length - 1),
  );
  const invite = model.pendingInvites[currentPage];
  const responsePending = model.respondingInviteId !== null;
  const waitingForAccess = model.acceptedInviteId === invite?.id;
  const anotherHomePending = model.acceptedInviteId !== null && !waitingForAccess;
  return (
    <View style={styles.body}>
      <View style={styles.section}>
        <Text style={styles.eyebrow}>PENDING INVITES</Text>
        <Text style={styles.title}>An invitation to belong.</Text>
      </View>
      {model.invitesRefreshing && <Text accessibilityLiveRegion="polite" style={styles.detail}>Refreshing your invitations…</Text>}
      {model.inviteInboxError && <View style={styles.section} accessibilityRole="alert">
        <Text style={styles.detail}>{model.inviteInboxError}</Text>
        <DeepAction label="Retry invitation inbox" disabled={model.invitesRefreshing || responsePending} onPress={() => void model.refreshInvites()} />
      </View>}
      {invite ? (
        <>
          <View style={styles.section}>
            <Text style={styles.title}>{invite.home_name}</Text>
            <Text style={styles.rowText}>Invite to join as {invite.role}</Text>
            <Text style={styles.subtitle}>{invite.email}</Text>
            {invite.role === "guest" && <Text style={styles.detail}>{formatGuestAccessExpiry(invite.access_expires_at)}</Text>}
          </View>
          <View style={styles.actions}>
            <DeepAction
              label={waitingForAccess ? "Retry home access" : "Accept"}
              accessibilityLabel={waitingForAccess ? "Retry home access" : "Accept"}
              primary
              disabled={responsePending || anotherHomePending || model.invitesRefreshing || Boolean(model.inviteInboxError) || (!waitingForAccess && isInvitationExpired(invite))}
              onPress={() =>
                void model.handleRespondInvite(invite.id, "accept")
              }
            />
            <DeepAction
              label="Decline"
              disabled={responsePending || Boolean(model.acceptedInviteId) || model.invitesRefreshing || Boolean(model.inviteInboxError)}
              onPress={() =>
                void model.handleRespondInvite(invite.id, "decline")
              }
            />
          </View>
          {responsePending && <Text accessibilityLiveRegion="polite" style={styles.detail}>Updating your invitation…</Text>}
          {!responsePending && waitingForAccess && <Text accessibilityLiveRegion="polite" style={styles.detail}>Invitation accepted. Retry to finish refreshing your home access.</Text>}
          <View style={styles.fill} />
          <DeepPager
            label="invitation"
            page={currentPage}
            pageCount={model.pendingInvites.length}
            onChange={setPage}
          />
        </>
      ) : !model.invitesRefreshing && !model.inviteInboxError ? (
        <View style={styles.empty}>
          <Ionicons
            name="mail-open-outline"
            size={36}
            color={theme.colors.accentText}
          />
          <Text style={styles.rowText}>No pending invites.</Text>
          <Text style={styles.detail}>
            New household invitations will appear here.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Use one member card at a time; reveal detailed permissions only when requested. */
function HouseholdMembers({ model }: { model: ProfileWorkspaceModel }) {
  const { height, fontScale } = useWindowDimensions();
  // Landscape tablets need the same room for fixed actions as smaller phones.
  const compact = height < 850 || fontScale > 1.2;
  const modalViewportStyle = useModalViewportStyle();
  const [selectedId, setSelectedId] = useState(model.household[0]?.id ?? "");
  const [sheet, setSheet] = useState<"rooms" | "layout" | "permissions" | "guest-access" | null>(null);
  const [roomPage, setRoomPage] = useState(0);
  const memberIndex = Math.max(
    0,
    model.household.findIndex((member) => member.id === selectedId),
  );
  const member = model.household[memberIndex];
  const roomPageCount = Math.max(1, Math.ceil(model.rooms.length / 6));
  const currentRoomPage = Math.min(roomPage, roomPageCount - 1);
  if (!member)
    return (
      <View style={styles.empty}>
        <Text style={styles.rowText}>No household members to show.</Text>
      </View>
    );
  const roomIds =
    model.roomMembers.find((entry) => entry.memberId === member.id)?.roomIds ??
    [];
  const limitedRooms = member.role === "Guest" || member.role === "Tenant";
  return (
    <View style={styles.body}>
      <View style={[styles.memberIdentity, compact && styles.memberIdentityCompact]}>
        <View style={[styles.memberIdentityHeader, compact && styles.memberIdentityHeaderCompact]}>
          <View style={[styles.avatarRing, compact && styles.avatarRingCompact]}>
            <AvatarChip name={member.name} size={compact ? 44 : 68} color={member.avatarColor} uri={member.avatarUri} />
          </View>
          <View style={[styles.memberIdentityCopy, compact && styles.memberIdentityCopyCompact]}>
            <Text numberOfLines={1} style={[styles.memberName, compact && styles.memberNameCompact]}>{member.name}</Text>
            <Text style={styles.memberMeta}>
              {member.role} · {member.status === "home" ? "Home" : "Away"}
            </Text>
          </View>
        </View>
        {member.role === "Guest" && <GuestAccessDeadline member={member} canEdit={Boolean(supabase && canManageGuestAccessExtension(useHomeStore.getState(), member.id))} onPress={() => setSheet("guest-access")} />}
      </View>
      <View style={styles.memberActions}>
        {limitedRooms && (
          <Pressable
            accessibilityLabel={`Room access for ${member.name}`}
            accessibilityHint="Review assigned rooms and interior layout sharing."
            style={styles.memberAction}
            onPress={() => {
              setRoomPage(0);
              setSheet("rooms");
            }}
          >
            <Ionicons
              name="grid-outline"
              size={21}
              color={theme.colors.accentText}
            />
            <View style={styles.heading}>
              <Text style={styles.rowText}>Rooms & interior layout</Text>
              <Text style={styles.detail}>{roomIds.length} {roomIds.length === 1 ? "room" : "rooms"} assigned</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.subtext}
            />
          </Pressable>
        )}
        {model.canManageHousehold && (
          <Pressable
            accessibilityLabel={`Permissions for ${member.name}`}
            style={styles.memberAction}
            onPress={() => setSheet("permissions")}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={21}
              color={theme.colors.accentText}
            />
            <View style={styles.heading}>
              <Text style={styles.rowText}>Action permissions</Text>
              <Text style={styles.detail}>
                {model.canEditMember(member)
                  ? "Review role and individual access"
                  : "Protected household role"}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.subtext}
            />
          </Pressable>
        )}
        <Pressable
          accessibilityLabel={`Remove ${member.name}`}
          accessibilityState={{ disabled: !model.canEditMember(member) }}
          disabled={!model.canEditMember(member)}
          style={[
            styles.dangerAction,
            !model.canEditMember(member) && styles.disabled,
          ]}
          onPress={() => void model.handleRemoveMember(member.id)}
        >
          <Text style={[styles.rowText, styles.danger]}>
            Remove from household
          </Text>
        </Pressable>
      </View>
      <View style={styles.fill} />
      <DeepPager
        label="household member"
        page={memberIndex}
        pageCount={model.household.length}
        onChange={(page) => setSelectedId(model.household[page].id)}
      />
      {sheet === "guest-access" && <GuestAccessExtension
        key={member.id}
        member={member}
        roomNames={model.rooms.filter((room) => roomIds.includes(room.id)).map((room) => room.name)}
        onClose={() => setSheet(null)}
      />}
      {sheet && sheet !== "guest-access" && (
        <ModalCard
          visible
          onRequestClose={() => setSheet(null)}
          onBackdropPress={() => setSheet(null)}
          backdropAccessibilityLabel="Close member details"
          colors={[theme.colors.glass, theme.colors.bg0]}
          animationType="none"
          cardStyle={[styles.sheet, modalViewportStyle]}
        >
          <ModalForm
            footer={<DeepAction label="Done" onPress={() => setSheet(null)} />}
          >
            <View style={styles.section}>
              <View style={styles.header}>
                <View style={styles.heading}>
                  <Text style={styles.eyebrow}>
                    {sheet === "permissions" ? "ACTION PERMISSIONS" : "HOME VISIBILITY"}
                  </Text>
                  <Text style={styles.title}>{member.name}</Text>
                </View>
              </View>
              {sheet !== "permissions" && <DeepTabs items={MEMBER_ACCESS_TABS} selectedId={sheet} onSelect={setSheet} />}
              {sheet === "permissions" ? (
                <MemberPermissionEditor
                  role={member.role}
                  disabled={!model.canEditMember(member)}
                  canChange={(permission) =>
                    model.canEditPermission(member, permission)
                  }
                  overrides={model.memberPermissionOverrides.filter(
                    (item) => item.memberId === member.id,
                  )}
                  onChange={(permission, allowed) =>
                    void model.updatePermissionOverride(
                      member,
                      permission,
                      allowed,
                    )
                  }
                />
              ) : sheet === "layout" ? (
                <InteriorLayoutAccess member={member} sharing={model.interiorLayoutSharing} />
              ) : (
                <View style={styles.section}>
                  <Text style={styles.subtitle}>
                    {model.canManageRooms
                      ? "Choose the rooms this person can use."
                      : "Rooms available to this household member."}
                  </Text>
                  <View style={styles.choices}>
                    {model.rooms
                      .slice(currentRoomPage * 6, (currentRoomPage + 1) * 6)
                      .map((room) => (
                        <ProfileChoice
                          key={room.id}
                          label={room.name}
                          selected={roomIds.includes(room.id)}
                          disabled={!model.canEditMember(member) || model.roomAccessBusy}
                          onPress={() => {
                            if (!model.canEditMember(member) || model.roomAccessBusy) return;
                            const next = roomIds.includes(room.id)
                              ? roomIds.filter((id) => id !== room.id)
                              : [...roomIds, room.id];
                            void model.updateRoomAccess(
                              member.id,
                              member.userId,
                              member.role,
                              next,
                            );
                          }}
                        />
                      ))}
                  </View>
                  {model.rooms.length === 0 && (
                    <Text style={styles.detail}>No rooms available.</Text>
                  )}
                  <DeepPager
                    label="room access"
                    page={currentRoomPage}
                    pageCount={roomPageCount}
                    onChange={setRoomPage}
                  />
                </View>
              )}
            </View>
          </ModalForm>
        </ModalCard>
      )}
    </View>
  );
}

/** Separate membership, invitations, and inbox navigation within the household workspace. */
export function HouseholdPage({ model }: { model: ProfileWorkspaceModel }) {
  const [page, setPage] = useState<"people" | "invite" | "inbox">("people");
  return (
    <View style={styles.body}>
      <DeepTabs items={HOUSEHOLD_TABS} selectedId={page} onSelect={setPage} />
      <DeepCard style={styles.fill}>
        {page === "people" ? (
          <HouseholdMembers model={model} />
        ) : page === "invite" ? (
          <InvitePerson model={model} />
        ) : (
          <InvitationInbox model={model} />
        )}
      </DeepCard>
    </View>
  );
}
