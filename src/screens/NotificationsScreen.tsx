import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import Pressable from "../components/Pressable";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";
import { useNavigation, useIsFocused, type NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "../app/AppNavigator";
import { openHomeFeature } from "../app/homeNavigation";
import { DeepScreen, DeepTabs, DeepCard, DeepPager } from "../components/deep/DeepScreen";
import { useActivityPages } from "../features/activity/useActivityPages";
import { useConditionNotificationError } from "../features/activity/useConditionNotifications";
import { useCurrentReports } from "../features/activity/useCurrentReports";
import { useActivityInbox, type InboxItem } from "../features/activity/ActivityInboxProvider";

type NotificationFilter = "all" | "alert" | "reports";
const EMPTY_ITEMS: readonly InboxItem[] = [];
const FILTERS = [
  { id: "all" as const, label: "Activity" },
  { id: "alert" as const, label: "Review" },
  { id: "reports" as const, label: "Current reports" },
];

/** Use the recorded local event time; never fabricate recency for cached activity. */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** A private, persistent local inbox with truthful simulation and delivery provenance. */
export default function NotificationsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const inbox = useActivityInbox();
  const { width } = useWindowDimensions();
  const focused = useIsFocused();
  const current = useCurrentReports(focused);
  const deliveryError = useConditionNotificationError();
  const notifications = inbox?.items ?? EMPTY_ITEMS;
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const visibleNotifications = useMemo(() => filter === "reports" ? EMPTY_ITEMS : filter === "all" ? notifications
    : notifications.filter((item) => item.category === filter), [filter, notifications]);
  const showingReports = filter === "reports";
  const itemCount = showingReports ? current.reports.length : visibleNotifications.length;
  const pages = useActivityPages(itemCount, 176);
  const pageItems = useMemo(() => visibleNotifications.slice(pages.start, pages.start + pages.pageSize),
    [visibleNotifications, pages.start, pages.pageSize]);
  const acknowledge = inbox?.acknowledge;
  useEffect(() => {
    if (!focused) return;
    const unread = pageItems.filter((item) => item.unread);
    if (unread.length) acknowledge?.(unread, false);
  }, [pageItems, acknowledge, focused]);

  /** Dismissing affects this account's inbox only and never cancels delivery. */
  function dismissNotification(item: InboxItem) { acknowledge?.([item], true); }

  return (
    <DeepScreen
      title="Notifications"
      eyebrow="HOME INBOX"
      subtitle="Recent activity and the latest available reports."
      onBack={() => {
        if (navigation.canGoBack()) navigation.goBack();
        else openHomeFeature(navigation.dispatch, "Home");
      }}
      actions={showingReports ? undefined : <Pressable accessibilityLabel="Dismiss all" accessibilityState={{ disabled: !notifications.length }}
        disabled={!notifications.length} onPress={() => acknowledge?.(notifications, true)} style={styles.dismissAll}>
        <Ionicons name="checkmark-done-outline" size={20} color={theme.colors.accentText} />
        {width >= 380 && <Text style={styles.dismissText}>Dismiss all</Text>}
      </Pressable>}
    >
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>{showingReports ? `${current.reports.length} ${current.reports.length === 1 ? "condition" : "conditions"}` : notifications.length ? `${notifications.length} ${notifications.length === 1 ? "update" : "updates"}` : "Your activity"}</Text>
        <Text style={styles.summaryCaption}>{showingReports ? "Latest available" : "This device only"}</Text>
      </View>
      <Text style={styles.context}>
        {showingReports ? "Reports persist until their source changes. Phone notices cover new conditions while this app is active; they are not a background alarm service." : inbox?.storageError
          ? "Activity could not be saved or restored. Recent updates remain visible while this app is open."
          : "Up to 200 recent updates. Delivery progress does not confirm physical device state."}
      </Text>
      {!showingReports && inbox?.storageError && (
        <Pressable accessibilityRole="button" accessibilityLabel="Retry activity storage" onPress={() => { void inbox.retry(); }} style={styles.retry}>
          <Text style={styles.dismissText}>Retry saving or loading activity</Text>
        </Pressable>
      )}
      {deliveryError && <Text accessibilityRole="alert" style={styles.context}>{deliveryError}</Text>}
      <DeepTabs items={FILTERS} selectedId={filter} onSelect={(id) => { setFilter(id); pages.setPage(0); }} />
      <View style={styles.list} onLayout={pages.onLayout}>
        {showingReports && current.reports.slice(pages.start, pages.start + pages.pageSize).map((report) => (
          <DeepCard key={report.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.categoryIcon, report.warning && styles.alertIcon]}>
                <Ionicons name={report.warning ? "warning-outline" : "open-outline"} size={18}
                  color={report.warning ? "#FFB4B4" : theme.colors.accentText} />
              </View>
              <Text style={styles.category}>{report.simulated ? "Simulation" : "Device report"}</Text>
              <Text style={styles.time}>{report.age === "stale" ? "Older report" : report.age === "unknown" ? "Time unknown" : ""}</Text>
            </View>
            <Text style={styles.title}>{report.deviceName}</Text>
            <Text style={styles.status}>{report.title}</Text>
            <Text style={styles.body}>{report.detail}</Text>
            <Text style={styles.time}>{report.timeLabel}</Text>
          </DeepCard>
        ))}
        {pageItems.map((item) => (
          <View key={item.id}>
            <DeepCard style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.categoryIcon, item.category === "alert" && styles.alertIcon]}>
                  <Ionicons name={item.category === "alert" ? "warning-outline" : "hardware-chip-outline"}
                    size={18} color={item.category === "alert" ? "#FFB4B4" : theme.colors.accentText} />
                </View>
                <Text style={styles.category}>{item.simulated ? "Simulation" : "Delivery"}</Text>
                <Text style={styles.time}>{formatTimestamp(item.timestamp)}</Text>
                <Pressable accessibilityLabel={`Dismiss ${item.title}`}
                  accessibilityHint="Hides this update only. Does not cancel the command."
                  onPress={() => dismissNotification(item)} style={styles.dismiss}>
                  <Ionicons name="close-outline" size={18} color={theme.colors.subtext} />
                </Pressable>
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.status}>{item.status}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </DeepCard>
          </View>
        ))}
        {!itemCount ? (
          <DeepCard style={styles.empty}>
            <Ionicons name="pulse-outline" size={34} color={theme.colors.accentText} />
            <Text style={styles.title}>{showingReports ? current.loading ? "Loading model reports" : "No conditions in available reports" : !inbox ? "Activity unavailable" : !inbox.ready ? "Loading your activity" : filter === "all" ? "No new activity" : "No matching updates"}</Text>
            <Text style={styles.emptyBody}>
              {showingReports ? "Missing or older reports cannot confirm that everything is clear. Check individual devices when needed." : !inbox ? "Verify your home access to open this account’s inbox." : !inbox.ready ? "Checking this account’s local inbox." : "Model changes and command delivery updates appear here as they happen. This inbox is not a live alarm service."}
            </Text>
          </DeepCard>
        ) : null}
      </View>
      <DeepPager page={pages.page} pageCount={pages.pageCount} onChange={pages.setPage} label={showingReports ? "current reports" : "notifications"} />
    </DeepScreen>
  );
}

const styles = StyleSheet.create({
  retry: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: theme.colors.surfaceRaised },
  // Compact phones keep the full heading and the same labelled 44px action target.
  dismissText: { color: theme.colors.text, fontSize: 12, fontWeight: "500" },
  dismissAll: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.colors.surfaceRaised },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },
  summaryTitle: { color: theme.colors.text, fontSize: 22, fontWeight: "500" },
  summaryCaption: { color: theme.colors.muted, fontSize: 11 },
  context: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  status: { color: theme.colors.accentText, fontSize: 12, lineHeight: 17, fontWeight: "500" },
  emptyBody: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18, textAlign: "center" },
  list: { flex: 1, minHeight: 0, gap: 12 },
  card: { minHeight: 176, padding: 16, gap: 5 },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  categoryIcon: {
    width: 30,
    height: 30,
    borderRadius: 11,
    backgroundColor: theme.colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  alertIcon: { backgroundColor: "rgba(255,180,180,0.14)" },
  category: {
    color: theme.colors.accentText,
    fontSize: 11,
    fontWeight: "500",
    flex: 1,
  },
  time: { color: theme.colors.muted, fontSize: 10 },
  dismiss: {
    width: 44,
    height: 44,
    marginRight: -8,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "500",
  },
  body: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
});
