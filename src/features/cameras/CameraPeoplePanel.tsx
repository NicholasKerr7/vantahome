import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  DeepAction,
  DeepCard,
  DeepPager,
  DeepTabs,
} from "../../components/deep/DeepScreen";
import AvatarChip from "../../components/AvatarChip";
import { useActivityPages } from "../activity/useActivityPages";
import type { HouseholdMember } from "../../store/useHomeStore";
import { theme } from "../../theme/theme";

export type CameraDetection = {
  id: string;
  label: string;
  kind: "known" | "unknown";
  ts: number;
};
type Props = {
  household: readonly HouseholdMember[];
  events: readonly CameraDetection[];
  disabled: boolean;
  onKnownFace: (id: string, name: string) => void;
  onUnknownFace: () => void;
  onPresence: (id: string, status: "home" | "away") => void;
};
const TABS = [
  { id: "members", label: "Household" },
  { id: "events", label: "Detections" },
] as const;

/** Retain recognition and presence actions in a bounded household journal. */
export default function CameraPeoplePanel({
  household,
  events,
  disabled,
  onKnownFace,
  onUnknownFace,
  onPresence,
}: Props) {
  const [tab, setTab] = useState<"members" | "events">("members");
  const membersPage = useActivityPages(household.length, 138);
  const eventsPage = useActivityPages(events.length, 100);
  const pages = tab === "members" ? membersPage : eventsPage;
  return (
    <View style={styles.root}>
      <DeepTabs items={TABS} selectedId={tab} onSelect={setTab} />
      <View style={styles.list} onLayout={pages.onLayout}>
        {tab === "members"
          ? household
              .slice(pages.start, pages.start + pages.pageSize)
              .map((member) => (
                <DeepCard key={member.id} style={styles.memberCard}>
                  <View style={styles.memberHeading}>
                    <AvatarChip
                      name={member.name}
                      size={38}
                      color={member.avatarColor}
                      uri={member.avatarUri}
                    />
                    <View style={styles.identity}>
                      <Text style={styles.title} numberOfLines={1}>
                        {member.name}
                      </Text>
                      <Text style={styles.caption}>
                        {member.status === "home" ? "At home" : "Away"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <DeepAction
                      label="Recognize"
                      accessibilityLabel={`Recognize ${member.name}`}
                      icon="scan-outline"
                      onPress={() => onKnownFace(member.id, member.name)}
                      disabled={disabled}
                    />
                    <DeepAction
                      label={
                        member.status === "home" ? "Mark away" : "Mark home"
                      }
                      onPress={() =>
                        onPresence(
                          member.id,
                          member.status === "home" ? "away" : "home",
                        )
                      }
                      disabled={disabled}
                    />
                  </View>
                </DeepCard>
              ))
          : events
              .slice(pages.start, pages.start + pages.pageSize)
              .map((event) => (
                <DeepCard key={event.id} style={styles.eventCard}>
                  <View style={styles.memberHeading}>
                    <Ionicons
                      name={
                        event.kind === "known"
                          ? "person-outline"
                          : "alert-circle-outline"
                      }
                      size={22}
                      color={
                        event.kind === "known"
                          ? theme.colors.accentText
                          : "#FFE0AD"
                      }
                    />
                    <Text style={styles.eventLabel}>{event.label}</Text>
                  </View>
                  <Text style={styles.caption}>
                    {new Date(event.ts).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                </DeepCard>
              ))}
        {(tab === "members" ? !household.length : !events.length) ? (
          <DeepCard style={styles.empty}>
            <Ionicons
              name={tab === "members" ? "people-outline" : "scan-outline"}
              size={28}
              color={theme.colors.accentText}
            />
            <Text style={styles.title}>
              {tab === "members"
                ? "No household members"
                : "No detections this session"}
            </Text>
            <Text style={styles.caption}>
              {tab === "members"
                ? "Add members in Household settings."
                : "Recognition reports appear here while this camera is open."}
            </Text>
          </DeepCard>
        ) : null}
      </View>
      {tab === "members" ? (
        <DeepAction
          label="Report unknown visitor"
          icon="person-add-outline"
          onPress={onUnknownFace}
          disabled={disabled}
        />
      ) : null}
      <DeepPager
        page={pages.page}
        pageCount={pages.pageCount}
        onChange={pages.setPage}
        label={tab === "members" ? "household members" : "detections"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, gap: 12 },
  list: { flex: 1, minHeight: 0, gap: 12 },
  memberCard: { minHeight: 138, padding: 16, gap: 12 },
  memberHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  identity: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: theme.colors.text, fontSize: 16, fontWeight: "500" },
  caption: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  eventCard: { minHeight: 100, padding: 16, gap: 10 },
  eventLabel: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
});
