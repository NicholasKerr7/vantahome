import React from "react";
import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ThemedSwitch from "../../components/ThemedSwitch";
import { hasCurrentMembershipAccess } from "../../security/guestAccess";
import type { HouseholdMember } from "../../store/useHomeStore";
import { theme } from "../../theme/theme";
import { householdStyles as styles } from "./householdStyles";
import type { InteriorLayoutSharingModel } from "./useInteriorLayoutSharing";

const SWITCH_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

/** Explain the visual-only consent separately from assigned rooms and device permissions. */
export function InteriorLayoutAccess({
  member,
  sharing,
}: {
  member: HouseholdMember;
  sharing: InteriorLayoutSharingModel;
}) {
  const shared = member.shareInteriorLayout === true;
  const pending = sharing.pendingMemberId === member.id;
  const canEdit = sharing.canEditInteriorLayout(member.id);
  const error = sharing.interiorLayoutError(member.id);
  return (
    <View style={styles.section}>
      <View style={styles.layoutOverview}>
        <Ionicons name="home-outline" size={22} color={theme.colors.accentText} />
        <View style={styles.heading}>
          <Text style={styles.rowText}>Exterior overview included</Text>
          <Text style={styles.detail}>The property exterior is visible by default. Assigned rooms keep their existing controls.</Text>
        </View>
      </View>
      <View style={[styles.row, styles.rowDivider]}>
        <View style={styles.heading}>
          <Text style={styles.rowText}>Share interior layout</Text>
          <Text style={styles.detail}>Show the full furnished interior and floor layout.</Text>
        </View>
        <View style={styles.layoutSwitch}>
          <ThemedSwitch
            accessibilityLabel={`Share interior layout with ${member.name}`}
            accessibilityHint="Changes visual layout sharing only. Device, camera, and activity permissions stay the same."
            accessibilityState={{ disabled: !canEdit || sharing.pendingMemberId !== null, checked: shared, busy: pending }}
            hitSlop={SWITCH_HIT_SLOP}
            disabled={!canEdit || sharing.pendingMemberId !== null}
            value={shared}
            onValueChange={(value) => void sharing.updateInteriorLayout(member.id, value)}
            activeThumbColor={theme.colors.accent}
          />
        </View>
      </View>
      <Text style={styles.detail}>This shares the view only. It does not add device controls, camera access, or activity history.</Text>
      {!canEdit && <Text style={styles.detail}>{!hasCurrentMembershipAccess(member)
        ? "Guest access has ended. Renew their access before sharing the interior."
        : "Only the verified homeowner can change this setting."}</Text>}
      {pending && <Text accessibilityLiveRegion="polite" style={styles.availabilityStatus}>Saving interior layout sharing…</Text>}
      {error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.danger}>{error}</Text>}
    </View>
  );
}
