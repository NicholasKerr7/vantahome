import React, {
  useCallback,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useShallow } from "zustand/react/shallow";
import Ionicons from "@expo/vector-icons/Ionicons";
import Pressable from "../Pressable";
import { theme } from "../../theme/theme";
import { useResponsive } from "../../theme/layout";
import { runtimePolicy } from "../../config/runtimeMode";
import {
  selectVisibleDevices,
  useHomeStore,
  type HomeState,
} from "../../store/useHomeStore";
import { getCommandFeedback } from "../../services/commandFeedback";
import { CommandActivityContext } from "./CommandActivityContext";
import CommandActivityModal, {
  type CommandActivityEntry,
} from "./CommandActivityModal";
import {
  getCommandActivityScope,
  useCommandActivity,
  type CommandActivityProgress,
} from "./useCommandActivity";

/** Preserve the hook's local admission identity while retaining modal row shape. */
type TrackedActivityEntry = CommandActivityEntry & Readonly<{
  command: CommandActivityProgress;
}>;

/** Subscribe to names/visibility only, not every incoming telemetry property. */
function selectVisibleNames(state: HomeState): Record<string, string> {
  return Object.fromEntries(
    selectVisibleDevices(state).map(({ id, name }) => [id, name]),
  );
}

/** A late result for an older command must not hide behind a dismissed newer one. */
function latestUpdate(
  entries: readonly TrackedActivityEntry[],
  simulated: boolean,
) {
  return entries.reduce<TrackedActivityEntry | undefined>((latest, entry) => {
    if (!latest || entry.command.updatedAt > latest.command.updatedAt) {
      return entry;
    }
    if (entry.command.updatedAt < latest.command.updatedAt) return latest;
    // Several transitions can share one clock tick. Prefer terminal uncertainty
    // on ties, then the newer admission, without claiming an execution order.
    const current = getCommandFeedback(entry.command, simulated);
    const previous = getCommandFeedback(latest.command, simulated);
    const currentWarning = !current.active && current.tone === "warning";
    const previousWarning = !previous.active && previous.tone === "warning";
    if (currentWarning !== previousWarning) {
      return currentWarning ? entry : latest;
    }
    return entry.command.createdAt >= latest.command.createdAt ? entry : latest;
  }, undefined);
}

/** Automatic retries share a notice; each terminal phase is independently visible. */
function getNoticeKey(entry: TrackedActivityEntry, simulated: boolean): string {
  const feedback = getCommandFeedback(entry.command, simulated);
  return `${entry.command.admissionSequence}:${feedback.active ? "active" : entry.command.status}`;
}

/**
 * One scoped subscription powers delivery notices and the Settings activity view.
 * The overlay does not reflow existing screens or introduce a second send path.
 */
export default function CommandFeedbackProvider({
  enabled,
  children,
}: PropsWithChildren<{ enabled: boolean }>) {
  const scope = useHomeStore(getCommandActivityScope);
  const names = useHomeStore(useShallow(selectVisibleNames));
  const { isTablet } = useResponsive();
  // A fresh view token also invalidates dismissals/dialogs across a temporary
  // access gate. Losing this memo can only hide feedback, never restore it.
  const viewSession = useMemo(() => ({ scope, enabled }), [scope, enabled]);
  const [openSession, setOpenSession] = useState<typeof viewSession | null>(null);
  const [dismissed, setDismissed] = useState<{
    session: typeof viewSession;
    keys: ReadonlySet<string>;
  } | null>(null);
  /** Reset is also a privacy boundary for an already-open modal. */
  const resetView = useCallback(() => {
    setOpenSession(null);
    setDismissed(null);
  }, []);
  const commands = useCommandActivity(scope, enabled, resetView);
  const entries = useMemo(
    () => commands.flatMap((command) =>
      typeof names[command.deviceId] === "string"
        ? [{ command, deviceName: names[command.deviceId] }]
        : [],
    ),
    [commands, names],
  );
  const simulated = runtimePolicy.allowMockTelemetry;
  const latest = latestUpdate(entries, simulated);
  const feedback = latest ? getCommandFeedback(latest.command, simulated) : null;
  // Dismissing an active command also hides its automatic retry notices, but a
  // later terminal outcome is a new notice. Dismissal never cancels delivery.
  const noticeKey = latest ? getNoticeKey(latest, simulated) : null;
  const showNotice =
    enabled && feedback && latest && noticeKey &&
    !(dismissed?.session === viewSession && dismissed.keys.has(noticeKey));
  const warningCount = entries.filter(({ command }) => {
    const value = getCommandFeedback(command, simulated);
    return !value.active && value.tone === "warning";
  }).length;
  const reviewSummary = `${warningCount} ${warningCount === 1 ? "needs" : "need"} review`;
  /** Keep dismissal memory bounded by currently visible, tracked command phases. */
  function dismissNotice() {
    if (!enabled || !noticeKey) return;
    const retainedKeys = new Set(
      entries.map((entry) => getNoticeKey(entry, simulated)),
    );
    setDismissed((previous) => {
      const keys = new Set(
        previous?.session === viewSession
          ? [...previous.keys].filter((key) => retainedKeys.has(key))
          : [],
      );
      keys.add(noticeKey);
      return { session: viewSession, keys };
    });
  }
  /** Opening is read-only; no transport is contacted by this action. */
  const open = useCallback(() => {
    if (enabled) setOpenSession(viewSession);
  }, [enabled, viewSession]);
  const visible = enabled && openSession === viewSession;
  const launcher = useMemo(
    () => (enabled ? { open, count: entries.length, visible } : null),
    [enabled, open, entries.length, visible],
  );

  return (
    <CommandActivityContext.Provider value={launcher}>
      {children}
      {showNotice ? (
        <SafeAreaView
          pointerEvents="box-none"
          edges={["bottom", "left", "right"]}
          style={[styles.overlay, isTablet && styles.tabletOverlay]}
        >
          <View testID="command-delivery-notice" style={styles.notice}>
            <Pressable
              onPress={open}
              accessibilityLabel={`${latest.deviceName}. ${feedback.title}. Device state unconfirmed. Open command activity${warningCount ? `, ${reviewSummary}` : ""}.`}
              accessibilityHint="Shows delivery details, not confirmed device state."
              accessibilityLiveRegion="polite"
              style={styles.noticeBody}
            >
              <Ionicons
                name={feedback.tone === "warning"
                  ? "alert-circle-outline"
                  : "paper-plane-outline"}
                size={22}
                color={theme.colors.text}
                accessible={false}
              />
              <View style={styles.noticeText}>
                <Text numberOfLines={1} style={styles.deviceName}>
                  {latest.deviceName}
                </Text>
                <Text style={styles.status}>{feedback.title}</Text>
                <Text style={styles.hint}>
                  {warningCount
                    ? `${reviewSummary} · View activity`
                    : "Device state unconfirmed · View activity"}
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityLabel="Dismiss delivery notice"
              accessibilityHint="Hides this notice only. Does not cancel the command."
              onPress={dismissNotice}
              style={styles.dismiss}
            >
              <Ionicons
                name="close"
                size={22}
                color={theme.colors.text}
                accessible={false}
              />
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}
      {enabled ? (
        <CommandActivityModal
          visible={visible}
          entries={entries}
          simulated={simulated}
          onClose={() => setOpenSession(null)}
        />
      ) : null}
    </CommandActivityContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: theme.spacing(11),
    paddingHorizontal: theme.spacing(2),
    alignItems: "center",
  },
  tabletOverlay: { bottom: theme.spacing(15) },
  notice: {
    width: "100%",
    maxWidth: 440,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.bg0,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    shadowOpacity: 0.2,
  },
  noticeBody: {
    flex: 1,
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.5),
  },
  noticeText: { flex: 1, minWidth: 0, gap: theme.spacing(0.25) },
  deviceName: { color: theme.colors.subtext, fontSize: 12 },
  status: { color: theme.colors.text, fontSize: 14, fontWeight: "800" },
  hint: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16 },
  dismiss: {
    width: 44,
    minHeight: 44,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
});
