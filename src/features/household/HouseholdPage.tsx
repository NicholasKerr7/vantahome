import React, { useState } from "react";
import { Text, View } from "react-native";
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

const HOUSEHOLD_TABS = [
  { id: "people", label: "Members" },
  { id: "invite", label: "Invite" },
  { id: "inbox", label: "Inbox" },
] as const;

/** Present the complete invitation form without exposing accepted membership prematurely. */
function InvitePerson({ model }: { model: ProfileWorkspaceModel }) {
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
        label={model.inviteLoading ? "Sending invitation…" : "Invite person"}
        accessibilityLabel="Invite member"
        icon="person-add-outline"
        primary
        disabled={
          model.inviteLoading ||
          !model.canInviteMembers ||
          !model.newMemberName.trim() ||
          !model.newMemberEmail.trim()
        }
        onPress={() => void model.handleAddMember()}
      />
    </ProfileForm>
  );
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
          </View>
          <View style={styles.actions}>
            <DeepAction
              label={waitingForAccess ? "Retry home access" : "Accept"}
              accessibilityLabel={waitingForAccess ? "Retry home access" : "Accept"}
              primary
              disabled={responsePending || anotherHomePending || model.invitesRefreshing || Boolean(model.inviteInboxError)}
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
  const modalViewportStyle = useModalViewportStyle();
  const [selectedId, setSelectedId] = useState(model.household[0]?.id ?? "");
  const [sheet, setSheet] = useState<"rooms" | "permissions" | null>(null);
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
      <View style={styles.memberIdentity}>
        <View style={styles.avatarRing}>
          <AvatarChip
            name={member.name}
            size={68}
            color={member.avatarColor}
            uri={member.avatarUri}
          />
        </View>
        <Text style={styles.memberName}>{member.name}</Text>
        <Text style={styles.memberMeta}>
          {member.role} · {member.status === "home" ? "Home" : "Away"}
        </Text>
      </View>
      <View style={styles.memberActions}>
        {limitedRooms && (
          <Pressable
            accessibilityLabel={`Room access for ${member.name}`}
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
              <Text style={styles.rowText}>Room access</Text>
              <Text style={styles.detail}>{roomIds.length} rooms assigned</Text>
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
      {sheet && (
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
                    {sheet === "rooms" ? "ROOM ACCESS" : "ACTION PERMISSIONS"}
                  </Text>
                  <Text style={styles.title}>{member.name}</Text>
                </View>
              </View>
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
                          disabled={!model.canManageRooms}
                          onPress={() => {
                            if (!model.canManageRooms) return;
                            const next = roomIds.includes(room.id)
                              ? roomIds.filter((id) => id !== room.id)
                              : [...roomIds, room.id];
                            void model.updateRoomAccess(
                              member.id,
                              member.userId,
                              member.role,
                              roomIds,
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
