import React, { useState } from "react";
import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ModalCard from "../../components/ModalCard";
import ModalForm, { useModalViewportStyle } from "../../components/ModalForm";
import Pressable from "../../components/Pressable";
import { DeepAction } from "../../components/deep/DeepScreen";
import {
  GUEST_EXTENSION_DURATIONS,
  formatGuestAccessDeadline,
  getGuestAccessExtensionMode,
  parseGuestAccessLocalDateTime,
  resolveGuestAccessDeadline,
  type GuestAccessChange,
} from "../../security/guestAccessExtension";
import type { HouseholdMember } from "../../store/useHomeStore";
import { theme } from "../../theme/theme";
import { ProfileChoice, ProfileField } from "./ProfileControls";
import { guestExtensionStyles as styles } from "./guestExtensionStyles";
import { householdStyles } from "./householdStyles";
import { useGuestAccessExtension } from "./useGuestAccessExtension";

type ReviewedChange = { change: GuestAccessChange; deadline: string; renewing: boolean };
type DurationChoice = 1 | 24 | 168 | "custom";

/** Prefill editable local calendar values without silently changing the device's time zone. */
function localDateTime(deadline: string | null | undefined) {
  const timestamp = deadline ? Date.parse(deadline) : Number.NaN;
  const date = new Date(Math.max(Number.isFinite(timestamp) ? timestamp : 0, Date.now()) + 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

/** Present a single purposeful access action in the space previously used by the expiry caption. */
export function GuestAccessDeadline({ member, canEdit, onPress }: {
  member: HouseholdMember;
  canEdit: boolean;
  onPress: () => void;
}) {
  const mode = getGuestAccessExtensionMode(member.accessExpiresAt);
  if (!mode || !member.accessExpiresAt) {
    return <Text style={householdStyles.detail}>{member.accessExpiresAt ? "Access unavailable" : "No automatic expiry"}</Text>;
  }
  const renewing = mode === "renew";
  const title = renewing ? "Renew access" : "Extend access";
  const deadline = formatGuestAccessDeadline(member.accessExpiresAt);
  const content = <>
    <Ionicons name={renewing ? "time-outline" : "calendar-outline"} size={18} color={theme.colors.accentText} />
    <View style={styles.deadlineCopy}>
      <Text style={styles.deadlineLabel}>{renewing ? "Access ended" : "Access until"}</Text>
      <Text style={styles.deadlineValue}>{deadline}</Text>
    </View>
    {canEdit && <Text style={styles.deadlineActionLabel}>{renewing ? "Renew" : "Extend"}</Text>}
  </>;
  if (!canEdit) return <View style={styles.deadlineAction}>{content}</View>;
  return (
    <Pressable
      accessibilityLabel={`${title} for ${member.name}`}
      accessibilityHint={`${renewing ? "Access ended" : "Access ends"} ${deadline}. Review a new deadline without changing room permissions.`}
      onPress={onPress}
      style={styles.deadlineAction}
    >
      {content}
    </Pressable>
  );
}

/** Guide a deliberate guest extension through choice, review, and verified confirmation. */
export function GuestAccessExtension({ member, roomNames, onClose }: {
  member: HouseholdMember;
  roomNames: string[];
  onClose: () => void;
}) {
  const viewportStyle = useModalViewportStyle();
  const extension = useGuestAccessExtension(member.id);
  const [choice, setChoice] = useState<DurationChoice>(24);
  const [initialLocal] = useState(() => localDateTime(member.accessExpiresAt));
  const [dateValue, setDateValue] = useState(initialLocal.date);
  const [timeValue, setTimeValue] = useState(initialLocal.time);
  const [review, setReview] = useState<ReviewedChange | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const renewing = (review ? review.renewing : getGuestAccessExtensionMode(member.accessExpiresAt) === "renew");
  const title = renewing ? "Renew guest access" : "Extend guest access";
  const success = extension.savedDeadline;
  const currentExpiry = member.accessExpiresAt;
  const staleReview = Boolean(review && currentExpiry !== review.change.expectedExpiresAt && !success && !extension.pending);
  const summary = roomNames.length ? roomNames.join(" · ") : "No rooms assigned";
  const error = validationError ?? extension.error;

  /** Build a review from the current membership, without requesting any permission change. */
  const reviewChange = () => {
    if (!extension.canEdit || extension.pending || !currentExpiry) return;
    extension.clearError();
    try {
      const change: GuestAccessChange = choice === "custom"
        ? { expectedExpiresAt: currentExpiry, expiresAt: parseGuestAccessLocalDateTime(dateValue, timeValue) }
        : { expectedExpiresAt: currentExpiry, durationHours: choice };
      const deadline = resolveGuestAccessDeadline(currentExpiry, change);
      setReview({ change, deadline, renewing: getGuestAccessExtensionMode(currentExpiry) === "renew" });
      setValidationError(null);
    } catch (failure) {
      setValidationError(failure instanceof Error ? failure.message : "Choose a valid future deadline.");
    }
  };

  /** Let the owner revise stale or failed reviews while keeping the server as the source of truth. */
  const editChoice = () => {
    if (extension.pending) return;
    setReview(null);
    setValidationError(null);
    extension.clearError();
  };

  /** Preserve the pending confirmation until the service finishes or the user leaves the sheet. */
  const close = () => { if (!extension.pending) onClose(); };

  return (
    <ModalCard
      visible
      onRequestClose={close}
      onBackdropPress={close}
      backdropAccessibilityLabel="Close guest access"
      colors={[theme.colors.glass, theme.colors.bg0]}
      cardStyle={[householdStyles.sheet, viewportStyle]}
      animationType="none"
    >
      <ModalForm footer={success ? <DeepAction label="Done" primary onPress={onClose} /> : (
        <View style={styles.footer}>
          <DeepAction label={review ? "Back" : "Cancel"} disabled={extension.pending} onPress={review ? editChoice : close} />
          <DeepAction
            label={extension.pending ? "Saving…" : review ? (renewing ? "Renew access" : "Extend access") : "Review change"}
            primary
            disabled={!extension.canEdit || extension.pending || staleReview}
            onPress={() => review ? void extension.save(review.change) : reviewChange()}
          />
        </View>
      )}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.clockBadge}>
              <Ionicons name={success ? "checkmark-outline" : "time-outline"} size={27} color={theme.colors.accentText} />
            </View>
            <View style={householdStyles.heading}>
              <Text style={householdStyles.eyebrow}>{success ? "ACCESS UPDATED" : review ? "REVIEW ACCESS" : "A LITTLE MORE TIME"}</Text>
              <Text style={styles.title}>{success ? (renewing ? "Welcome back." : "Their stay, extended.") : title}</Text>
              <Text style={householdStyles.detail}>{member.name}</Text>
            </View>
          </View>

          {success ? (
            <View accessibilityLiveRegion="polite" style={styles.deadlinePanel}>
              <Text style={householdStyles.label}>Confirmed access until</Text>
              <Text style={styles.confirmedDeadline}>{formatGuestAccessDeadline(success)}</Text>
              <Text style={householdStyles.detail}>No new invitation or acceptance is needed. Their app updates after it reconnects or refreshes.</Text>
            </View>
          ) : (
            <View style={styles.deadlinePanel}>
              <Text style={householdStyles.label}>{renewing ? "Previous access ended" : "Current access ends"}</Text>
              <Text style={styles.deadlineText}>{currentExpiry ? formatGuestAccessDeadline(currentExpiry) : "Access unavailable"}</Text>
              {review && <>
                <View style={styles.deadlineDivider} />
                <Text style={styles.newDeadlineLabel}>{review.change.durationHours ? (renewing ? "Expected new end · starts when confirmed" : "Expected new end · adds to current access") : "New access ends"}</Text>
                <Text style={styles.confirmedDeadline}>{formatGuestAccessDeadline(review.deadline)}</Text>
                {review.change.durationHours && !renewing && <Text style={householdStyles.detail}>If access ends before confirmation, the added time starts when confirmed.</Text>}
              </>}
            </View>
          )}

          {!success && !review && <>
            <Text style={householdStyles.detail}>{renewing ? "Welcome them back with their existing room permissions." : "Add time to their current deadline. Their room permissions stay the same."}</Text>
            <View style={styles.durationChoices}>
              {GUEST_EXTENSION_DURATIONS.map((duration) => <ProfileChoice
                key={duration.hours}
                label={duration.label}
                accessibilityLabel={`Add ${duration.label} of guest access`}
                selected={choice === duration.hours}
                onPress={() => { setChoice(duration.hours); setValidationError(null); }}
              />)}
            </View>
            <Pressable
              accessibilityLabel="Choose a custom access end date"
              accessibilityState={{ selected: choice === "custom" }}
              onPress={() => { setChoice("custom"); setValidationError(null); }}
              style={[styles.customChoice, choice === "custom" && householdStyles.choiceSelected]}
            >
              <Ionicons name="calendar-outline" size={20} color={theme.colors.accentText} />
              <Text style={styles.customLabel}>Choose an exact end date</Text>
              <Ionicons name={choice === "custom" ? "checkmark-circle" : "chevron-forward"} size={18} color={theme.colors.accentText} />
            </Pressable>
            {choice === "custom" && <>
              <View style={styles.dateFields}>
                <View style={styles.dateField}><ProfileField label="Date · YYYY-MM-DD" accessibilityLabel="Guest access end date" value={dateValue} onChangeText={setDateValue} autoCapitalize="none" autoCorrect={false} placeholder="2026-10-14" /></View>
                <View style={styles.timeField}><ProfileField label="Time · 24 hour" accessibilityLabel="Guest access end time" value={timeValue} onChangeText={setTimeValue} autoCapitalize="none" autoCorrect={false} placeholder="18:00" /></View>
              </View>
              <Text style={householdStyles.detail}>Uses this device’s local time zone. Choose a later deadline within 365 days.</Text>
            </>}
          </>}

          {(review || success) && <View style={styles.permissionSummary}>
            <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.accentText} />
            <View style={householdStyles.heading}>
              <Text style={householdStyles.rowText}>Same rooms. Same permissions.</Text>
              <Text accessibilityLabel={`Assigned rooms: ${summary}`} numberOfLines={2} style={householdStyles.detail}>{summary}</Text>
              <Text style={householdStyles.detail}>{success ? "Any pending invitation was replaced." : "This replaces any pending invitation."}</Text>
            </View>
          </View>}
          {(review || success) && <Text style={householdStyles.detail}>{member.shareInteriorLayout && !success
            ? "Interior layout sharing will turn off. The Owner can share it again separately."
            : "Interior layout sharing stays off until the Owner shares it separately."}</Text>}
          {!success && !extension.canEdit && <Text accessibilityRole="alert" style={householdStyles.danger}>This household access can no longer be changed from this screen. Close it and reopen the Guest’s current member card.</Text>}
          {staleReview && <Text accessibilityRole="alert" style={householdStyles.danger}>Their deadline changed while you were reviewing. Go back and review the current access.</Text>}
          {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={householdStyles.danger}>{error}</Text>}
        </View>
      </ModalForm>
    </ModalCard>
  );
}
