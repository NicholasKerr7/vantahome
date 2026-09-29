import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Pressable from "../components/Pressable";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "../app/AppNavigator";
import { openHomeFeature } from "../app/homeNavigation";
import { useHomeStore } from "../store/useHomeStore";
import { Swipeable } from "react-native-gesture-handler";
import {
  DeepScreen,
  DeepTabs,
  DeepCard,
  DeepAction,
  DeepPager,
} from "../components/deep/DeepScreen";
import { useActivityPages } from "../features/activity/useActivityPages";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  time: string;
  category: NotificationCategory;
  isNew?: boolean;
};

type NotificationCategory =
  "alert" | "device" | "scene" | "automation" | "security" | "info";

type NotificationFilter = "all" | NotificationCategory;

const CATEGORY_META: Record<
  NotificationCategory,
  { label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  alert: {
    label: "Alerts",
    icon: "warning",
  },
  device: {
    label: "Devices",
    icon: "hardware-chip",
  },
  scene: {
    label: "Scenes",
    icon: "sparkles",
  },
  automation: {
    label: "Routines",
    icon: "timer",
  },
  security: {
    label: "Security",
    icon: "shield-checkmark",
  },
  info: {
    label: "Info",
    icon: "information-circle",
  },
};

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    title: "Air Conditioner",
    body: "Set to 22°C • Cool",
    time: "Just now",
    category: "device",
    isNew: true,
  },
  {
    id: "n2",
    title: "Scene • Movie Time",
    body: "Living room lights dimmed",
    time: "5m ago",
    category: "scene",
  },
  {
    id: "n3",
    title: "Automation",
    body: "Night Cool scheduled for 9:00 PM",
    time: "1h ago",
    category: "automation",
  },
  {
    id: "n4",
    title: "Entry Door",
    body: "Front door locked",
    time: "2h ago",
    category: "security",
  },
];

/** A calm, paged inbox with visible dismissal controls and retained swipe support. */
export default function NotificationsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const energy = useHomeStore((s) =>
    s.devices.find((device) => device.kind === "energy"),
  );
  const water = useHomeStore((s) =>
    s.devices.find((device) => device.kind === "water"),
  );
  const openEntry = useHomeStore((s) =>
    s.devices.find(
      (device) =>
        ["door", "window", "garage", "gate"].includes(device.kind) &&
        (device.openPercent ?? 0) > 0,
    ),
  );
  const powerOutage =
    energy?.gridAvailable === false && (energy?.gridOutageAlerts ?? true);
  const solarActive = (energy?.solarW ?? 0) > 0;
  const waterPressureLow = water?.waterPressureLowPsi ?? 35;
  const waterPressureHigh = water?.waterPressureHighPsi ?? 80;
  const waterPressure = water?.waterPressurePsi ?? 0;
  const waterLeak = water?.waterLeakDetected ?? false;
  const waterBudget = water?.waterBudgetL ?? 0;
  const waterToday = water?.waterTodayL ?? 0;
  const waterOverBudget = waterBudget > 0 && waterToday > waterBudget;
  const notifications = useMemo(() => {
    const dynamicItems: NotificationItem[] = [];
    if (powerOutage) {
      dynamicItems.push({
        id: "n-power-outage",
        title: "Power outage",
        body: solarActive
          ? "Main power offline • Solar active"
          : "Main power offline • Backup required",
        time: "Just now",
        category: "alert",
        isNew: true,
      });
    }
    if (solarActive) {
      dynamicItems.push({
        id: "n-solar-online",
        title: "Solar active",
        body: `Producing ${Math.round(energy?.solarW ?? 0)}W`,
        time: "Just now",
        category: "info",
      });
    }
    if (waterLeak) {
      dynamicItems.push({
        id: "n-water-leak",
        title: "Water leak detected",
        body: "Auto shutoff recommended",
        time: "Just now",
        category: "alert",
        isNew: true,
      });
    } else if (waterPressure > waterPressureHigh) {
      dynamicItems.push({
        id: "n-water-pressure-high",
        title: "High water pressure",
        body: `${Math.round(waterPressure)} PSI • Above ${Math.round(
          waterPressureHigh,
        )}`,
        time: "Just now",
        category: "alert",
      });
    } else if (waterPressure > 0 && waterPressure < waterPressureLow) {
      dynamicItems.push({
        id: "n-water-pressure-low",
        title: "Low water pressure",
        body: `${Math.round(waterPressure)} PSI • Below ${Math.round(
          waterPressureLow,
        )}`,
        time: "Just now",
        category: "alert",
      });
    }
    if (waterOverBudget) {
      dynamicItems.push({
        id: "n-water-budget",
        title: "Water budget exceeded",
        body: `${Math.round(waterToday)}L used • Budget ${Math.round(
          waterBudget,
        )}L`,
        time: "Today",
        category: "alert",
      });
    }
    if (openEntry) {
      dynamicItems.push({
        id: "n-entry-open",
        title: `${openEntry.name} open`,
        body: `${Math.round(openEntry.openPercent ?? 0)}% open`,
        time: "Just now",
        category: "security",
      });
    }
    return [...dynamicItems, ...MOCK_NOTIFICATIONS];
  }, [
    energy?.solarW,
    openEntry,
    powerOutage,
    solarActive,
    waterBudget,
    waterLeak,
    waterOverBudget,
    waterPressure,
    waterPressureHigh,
    waterPressureLow,
    waterToday,
  ]);

  const filteredNotifications = useMemo(() => {
    if (filter === "all") return notifications;
    return notifications.filter((item) => item.category === filter);
  }, [filter, notifications]);
  const visibleNotifications = useMemo(
    () => filteredNotifications.filter((item) => !dismissedIds.has(item.id)),
    [dismissedIds, filteredNotifications],
  );
  const canClearAll = useMemo(
    () => notifications.some((item) => !dismissedIds.has(item.id)),
    [dismissedIds, notifications],
  );
  /** Dismiss one item while leaving other categories and alerts untouched. */
  const dismissNotification = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  /** Preserve the existing clear-all behavior across every category. */
  const handleClearAll = () => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((item) => next.add(item.id));
      return next;
    });
  };

  const pages = useActivityPages(visibleNotifications.length, 142);
  const filters = [
    { id: "all" as const, label: "All" },
    ...Object.entries(CATEGORY_META).map(([id, meta]) => ({
      id: id as NotificationCategory,
      label: meta.label,
    })),
  ];
  const remainingCount = notifications.filter(
    (item) => !dismissedIds.has(item.id),
  ).length;

  return (
    <DeepScreen
      title="Notifications"
      eyebrow="HOME INBOX"
      subtitle="The moments that matter, in one place."
      onBack={() => {
        if (navigation.canGoBack()) navigation.goBack();
        else openHomeFeature(navigation.dispatch, "Home");
      }}
      actions={
        <DeepAction
          label="Clear all"
          icon="checkmark-done-outline"
          disabled={!canClearAll}
          onPress={handleClearAll}
        />
      }
    >
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>
          {remainingCount ? `${remainingCount} updates` : "All caught up"}
        </Text>
        <Text style={styles.summaryCaption}>Across your home</Text>
      </View>
      <DeepTabs
        items={filters}
        selectedId={filter}
        onSelect={(id) => {
          setFilter(id);
          pages.setPage(0);
        }}
      />
      <View style={styles.list} onLayout={pages.onLayout}>
        {visibleNotifications
          .slice(pages.start, pages.start + pages.pageSize)
          .map((item) => {
            const meta = CATEGORY_META[item.category];
            return (
              <Swipeable
                key={item.id}
                renderRightActions={() => (
                  <Pressable
                    accessibilityLabel={`Dismiss ${item.title}`}
                    style={styles.swipeAction}
                    onPress={() => dismissNotification(item.id)}
                  >
                    <Ionicons
                      name="close"
                      size={22}
                      color={theme.colors.text}
                    />
                    <Text style={styles.dismissText}>Dismiss</Text>
                  </Pressable>
                )}
                onSwipeableOpen={() => dismissNotification(item.id)}
                rightThreshold={48}
                overshootRight={false}
              >
                <DeepCard style={styles.card}>
                  <View style={styles.cardTop}>
                    <View
                      style={[
                        styles.categoryIcon,
                        item.category === "alert" && styles.alertIcon,
                      ]}
                    >
                      <Ionicons
                        name={meta.icon}
                        size={18}
                        color={
                          item.category === "alert"
                            ? "#FFB4B4"
                            : theme.colors.accentText
                        }
                      />
                    </View>
                    <Text style={styles.category}>{meta.label}</Text>
                    {item.isNew ? (
                      <View
                        style={styles.newDot}
                        accessibilityLabel="New notification"
                      />
                    ) : null}
                    <Text style={styles.time}>{item.time}</Text>
                    <Pressable
                      accessibilityLabel={`Dismiss ${item.title}`}
                      onPress={() => dismissNotification(item.id)}
                      style={styles.dismiss}
                    >
                      <Ionicons
                        name="close-outline"
                        size={18}
                        color={theme.colors.subtext}
                      />
                    </Pressable>
                  </View>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.body}>{item.body}</Text>
                </DeepCard>
              </Swipeable>
            );
          })}
        {!visibleNotifications.length ? (
          <DeepCard style={styles.empty}>
            <Ionicons
              name="checkmark-circle-outline"
              size={34}
              color={theme.colors.accentText}
            />
            <Text style={styles.title}>You are all caught up</Text>
            <Text style={styles.body}>No notifications match this filter.</Text>
          </DeepCard>
        ) : null}
      </View>
      <DeepPager
        page={pages.page}
        pageCount={pages.pageCount}
        onChange={pages.setPage}
        label="notifications"
      />
    </DeepScreen>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },
  summaryTitle: { color: theme.colors.text, fontSize: 22, fontWeight: "500" },
  summaryCaption: { color: theme.colors.muted, fontSize: 11 },
  list: { flex: 1, minHeight: 0, gap: 12 },
  card: { minHeight: 142, padding: 16, gap: 5 },
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
  newDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.accentText,
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
  swipeAction: {
    borderRadius: 22,
    marginLeft: 8,
    width: 86,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,180,180,0.16)",
  },
  dismissText: { color: theme.colors.text, fontSize: 12, fontWeight: "500" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
});
