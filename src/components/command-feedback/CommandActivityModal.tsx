import React, { useMemo } from "react";
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
      <Text style={styles.deviceName}>{entry.deviceName}</Text>
      <Text style={[styles.status, feedback.tone === "warning" && styles.warning]}>
        {feedback.title}
      </Text>
      <Text style={styles.description}>{feedback.description}</Text>
      <Text style={styles.metadata}>
        {new Date(entry.command.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        {` · ${entry.command.attempts} of 4 delivery attempts`}
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
        <Text accessibilityRole="header" style={styles.title}>
          Command activity
        </Text>
        <Pressable
          accessibilityLabel="Close command activity"
          onPress={onClose}
          style={styles.close}
        >
          <Text style={styles.closeText}>Done</Text>
        </Pressable>
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
        renderItem={({ item }) => <ActivityRow entry={item} simulated={simulated} />}
        bounces={false}
        overScrollMode="never"
        decelerationRate="normal"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
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
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    padding: theme.spacing(2.5),
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", gap: theme.spacing(1) },
  title: { flex: 1, color: theme.colors.text, fontSize: 21, fontWeight: "800" },
  close: {
    minWidth: 48,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.card,
  },
  closeText: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
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
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.card2,
    gap: theme.spacing(0.75),
  },
  deviceName: { color: theme.colors.text, fontSize: 16, fontWeight: "700", flexShrink: 1 },
  status: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
  warning: { color: "#FFE0AD" },
  description: { color: theme.colors.subtext, fontSize: 14, lineHeight: 21 },
  metadata: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  empty: { paddingVertical: theme.spacing(3), gap: theme.spacing(1) },
  footer: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 18,
    paddingTop: theme.spacing(1),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.stroke,
  },
});
