import React, { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ModalCard from "../ModalCard";
import Pressable from "../Pressable";
import { theme } from "../../theme/theme";
import { getCommandFeedback } from "../../services/commandFeedback";
import type { CommandProgress } from "../../services/commandProgress";

export type CommandActivityEntry = Readonly<{
  command: CommandProgress;
  deviceName: string;
}>;

type Props = {
  visible: boolean;
  entries: readonly CommandActivityEntry[];
  simulated: boolean;
  onClose: () => void;
};

const COLORS = [theme.colors.bg0, theme.colors.bg1] as const;

/** Cap long histories inside safe areas without stretching a short activity list. */
function createDialogLayout(width: number, availableHeight: number) {
  return StyleSheet.create({
    card: {
      width: Math.min(560, Math.max(0, width - theme.spacing(4))),
      maxHeight: Math.min(620, Math.max(0, availableHeight - theme.spacing(6))),
    },
  });
}

/** Identify local history rows without rendering their private command IDs. */
function entryKey(entry: CommandActivityEntry) {
  return entry.command.commandId;
}

/** Display delivery metadata; the device's actual controls/state remain separate. */
function ActivityRow({
  entry,
  simulated,
}: {
  entry: CommandActivityEntry;
  simulated: boolean;
}) {
  const feedback = getCommandFeedback(entry.command, simulated);
  return (
    <View style={styles.row}>
      <View style={styles.rowHeading}>
        <View
          style={[
            styles.rowIcon,
            feedback.tone === "warning" && styles.warningIcon,
          ]}
        >
          <Ionicons
            name={
              feedback.tone === "warning" ? "alert-outline" : "pulse-outline"
            }
            size={20}
            color={
              feedback.tone === "warning" ? "#FFE0AD" : theme.colors.accentText
            }
          />
        </View>
        <View style={styles.rowIdentity}>
          <Text style={styles.deviceName}>{entry.deviceName}</Text>
          <Text
            style={[
              styles.status,
              feedback.tone === "warning" && styles.warning,
            ]}
          >
            {feedback.title}
          </Text>
        </View>
        <Text style={styles.timestamp}>
          {new Date(entry.command.createdAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
      </View>
      <Text style={styles.description}>{feedback.description}</Text>
      <Text style={styles.metadata}>
        {`${entry.command.attempts} of 4 delivery attempts`}
      </Text>
    </View>
  );
}

/** A user-opened, scrollable activity view; no automatic replay or cancellation. */
export default function CommandActivityModal({
  visible,
  entries,
  simulated,
  onClose,
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableHeight = height - insets.top - insets.bottom;
  const layout = useMemo(
    () => createDialogLayout(width, availableHeight),
    [width, availableHeight],
  );
  const newestFirst = useMemo(() => [...entries].reverse(), [entries]);

  return (
    <ModalCard
      visible={visible}
      onRequestClose={onClose}
      backdropAccessibilityLabel="Dismiss command activity dialog"
      colors={COLORS}
      animationType="none"
      overlayStyle={styles.overlay}
      cardStyle={[styles.card, layout.card]}
    >
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <Text style={styles.eyebrow}>DELIVERY JOURNAL</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Command activity
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close command activity"
          onPress={onClose}
          style={styles.close}
        >
          <Text style={styles.closeText}>Done</Text>
        </Pressable>
      </View>
      <View style={styles.summary}>
        <Text style={styles.summaryCount}>
          {entries.length}
          <Text style={styles.summaryLabel}> recent commands</Text>
        </Text>
        <Text style={styles.sessionLabel}>
          {simulated ? "Simulation" : "This session"}
        </Text>
      </View>
      <Text style={styles.intro}>
        Delivery progress is not physical-device confirmation.
      </Text>
      <FlatList
        testID="command-activity-list"
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={newestFirst}
        keyExtractor={entryKey}
        renderItem={({ item }) => (
          <ActivityRow entry={item} simulated={simulated} />
        )}
        bounces={false}
        overScrollMode="never"
        decelerationRate="normal"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="pulse-outline"
              size={32}
              color={theme.colors.accentText}
            />
            <Text style={styles.deviceName}>No recent commands</Text>
            <Text style={styles.description}>
              Commands started while this home is open will appear here.
            </Text>
          </View>
        }
      />
      <Text style={styles.footer}>
        Up to 200 recent commands. Cleared when the session resets.
      </Text>
    </ModalCard>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: "center", padding: theme.spacing(2) },
  card: {
    alignSelf: "center",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    padding: theme.spacing(2.5),
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing(1) },
  headerIdentity: { flex: 1, gap: 6 },
  eyebrow: {
    color: theme.colors.accentText,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: "500",
    letterSpacing: -0.5,
  },
  summary: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 22,
  },
  summaryCount: { color: theme.colors.text, fontSize: 24, fontWeight: "500" },
  summaryLabel: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "400",
  },
  sessionLabel: { color: theme.colors.accentText, fontSize: 11 },
  close: {
    minWidth: 48,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.card,
  },
  closeText: { color: theme.colors.text, fontSize: 14, fontWeight: "500" },
  intro: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  list: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
    ...Platform.select({ web: { overscrollBehavior: "contain" } }),
  },
  listContent: { gap: theme.spacing(1.5), paddingBottom: theme.spacing(2) },
  row: {
    padding: theme.spacing(2),
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.card2,
    gap: 10,
  },
  rowHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: theme.colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  warningIcon: { backgroundColor: "rgba(255,224,173,0.12)" },
  rowIdentity: { flex: 1, gap: 4 },
  timestamp: { color: theme.colors.muted, fontSize: 10 },
  deviceName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "500",
    flexShrink: 1,
  },
  status: { color: theme.colors.accentText, fontSize: 12, fontWeight: "500" },
  warning: { color: "#FFE0AD" },
  description: { color: theme.colors.subtext, fontSize: 13, lineHeight: 20 },
  metadata: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  empty: { paddingVertical: theme.spacing(3), gap: 12, alignItems: "center" },
  footer: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 18,
    paddingTop: theme.spacing(1),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.stroke,
  },
});
