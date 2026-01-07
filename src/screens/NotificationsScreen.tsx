import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "../app/AppNavigator";
import { useResponsive } from "../theme/layout";
import { useHomeStore } from "../store/useHomeStore";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  time: string;
  category: NotificationCategory;
  isNew?: boolean;
};

type NotificationCategory =
  | "alert"
  | "device"
  | "scene"
  | "automation"
  | "security"
  | "info";

type NotificationFilter = "all" | NotificationCategory;

const CATEGORY_META: Record<
  NotificationCategory,
  { label: string; icon: keyof typeof Ionicons.glyphMap; accent: string; soft: string }
> = {
  alert: {
    label: "Alerts",
    icon: "warning",
    accent: "#FFB4B4",
    soft: "rgba(255,180,180,0.18)",
  },
  device: {
    label: "Devices",
    icon: "hardware-chip",
    accent: "#9AD6FF",
    soft: "rgba(154,214,255,0.18)",
  },
  scene: {
    label: "Scenes",
    icon: "sparkles",
    accent: theme.colors.accent,
    soft: "rgba(180,107,255,0.18)",
  },
  automation: {
    label: "Automations",
    icon: "timer",
    accent: "#8DFFC9",
    soft: "rgba(141,255,201,0.18)",
  },
  security: {
    label: "Security",
    icon: "shield-checkmark",
    accent: "#FFD48A",
    soft: "rgba(255,212,138,0.18)",
  },
  info: {
    label: "Info",
    icon: "information-circle",
    accent: "#C4D4FF",
    soft: "rgba(196,212,255,0.18)",
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

export default function NotificationsScreen() {
  const { contentWidth, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(900);
  const isWide = isTablet && isLandscape;
  const iconBtnSize = Math.round((isTablet ? 46 : 40) * scale);
  const iconBtnRadius = Math.round(iconBtnSize * 0.4);
  const titleSize = Math.round((isTablet ? 26 : 24) * scale);
  const cardPad = Math.round((isTablet ? 18 : 14) * scale);
  const cardRadius = Math.round((isTablet ? 22 : 18) * scale);
  const iconWrapSize = Math.round((isTablet ? 40 : 36) * scale);
  const iconWrapRadius = Math.round(iconWrapSize * 0.34);
  const iconSize = Math.round((isTablet ? 20 : 18) * scale);
  const textSize = Math.round((isTablet ? 14 : 13) * scale);
  const bodySize = Math.round((isTablet ? 13 : 12) * scale);
  const gap = Math.round((isTablet ? 16 : 10) * scale);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [filter, setFilter] = useState<NotificationFilter>("all");
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
  const filters: NotificationFilter[] = [
    "all",
    "alert",
    "device",
    "scene",
    "automation",
    "security",
    "info",
  ];
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
        body: `${Math.round(waterPressure)} PSI • Above ${
          Math.round(waterPressureHigh)
        }`,
        time: "Just now",
        category: "alert",
      });
    } else if (waterPressure > 0 && waterPressure < waterPressureLow) {
      dynamicItems.push({
        id: "n-water-pressure-low",
        title: "Low water pressure",
        body: `${Math.round(waterPressure)} PSI • Below ${
          Math.round(waterPressureLow)
        }`,
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

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={[styles.root, { paddingTop: topPad }]}
    >
      <View
        style={[
          styles.topBar,
          {
            paddingHorizontal: gutter,
            width: contentWidth,
            alignSelf: "center",
          },
        ]}
      >
        <Pressable
          style={[
            styles.iconBtn,
            {
              width: iconBtnSize,
              height: iconBtnSize,
              borderRadius: iconBtnRadius,
            },
          ]}
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate("Main");
          }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.h1, { fontSize: titleSize }]}>Notifications</Text>
        <View style={{ width: iconBtnSize }} />
      </View>
      <View
        style={[
          styles.filtersRow,
          {
            paddingHorizontal: gutter,
            width: contentWidth,
            alignSelf: "center",
          },
        ]}
      >
        {filters.map((option) => {
          const active = filter === option;
          const label =
            option === "all" ? "All" : CATEGORY_META[option].label;
          return (
            <Pressable
              key={option}
              style={[
                styles.filterChip,
                active && styles.filterChipActive,
              ]}
              onPress={() => setFilter(option)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View
        style={{
          width: contentWidth,
          alignSelf: "center",
          paddingHorizontal: isTablet ? 0 : gutter,
        }}
      >
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item.id}
          numColumns={isWide ? 2 : 1}
          columnWrapperStyle={isWide ? { gap } : undefined}
          contentContainerStyle={{
            paddingTop: 12,
            paddingBottom: Math.round(
              (isTablet ? (isLandscape ? 120 : 140) : 24) * scale,
            ),
            gap,
            paddingHorizontal: isTablet ? gutter : 0,
          }}
          style={{ width: "100%" }}
          renderItem={({ item }) => {
            const meta = CATEGORY_META[item.category];
            return (
              <View
                style={[
                  styles.card,
                  {
                    padding: cardPad,
                    borderRadius: cardRadius,
                    width: isWide ? (contentWidth - gap) / 2 : "100%",
                  },
                ]}
              >
                <View
                  style={[
                    styles.accentBar,
                    { backgroundColor: meta.accent },
                  ]}
                />
                <View
                  style={[
                    styles.iconWrap,
                    {
                      width: iconWrapSize,
                      height: iconWrapSize,
                      borderRadius: iconWrapRadius,
                      backgroundColor: meta.soft,
                      borderColor: meta.accent,
                    },
                  ]}
                >
                  <Ionicons
                    name={meta.icon}
                    size={iconSize}
                    color={meta.accent}
                  />
                </View>
                <View style={styles.cardBody}>
                  <Text style={[styles.title, { fontSize: textSize }]}>
                    {item.title}
                  </Text>
                  <Text style={[styles.body, { fontSize: bodySize }]}>
                    {item.body}
                  </Text>
                </View>
                <View style={styles.cardMeta}>
                  {item.isNew && (
                    <View
                      style={[
                        styles.newPill,
                        {
                          borderColor: meta.accent,
                          backgroundColor: meta.soft,
                        },
                      ]}
                    >
                      <Text style={styles.newPillText}>NEW</Text>
                    </View>
                  )}
                  <Text style={[styles.time, { fontSize: bodySize }]}>
                    {item.time}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <Ionicons
                name="checkmark-circle"
                size={28}
                color="rgba(255,255,255,0.65)"
              />
              <Text style={styles.emptyTitle}>All caught up</Text>
              <Text style={styles.emptySub}>
                No notifications for this filter.
              </Text>
            </View>
          )}
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  h1: { color: theme.colors.text, fontSize: 24, fontWeight: "900" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  accentBar: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 999,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  cardBody: { flex: 1 },
  cardMeta: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
  },
  newPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  newPillText: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  title: { color: theme.colors.text, fontWeight: "900" },
  body: { color: theme.colors.subtext, fontWeight: "700", marginTop: 4 },
  time: { color: theme.colors.subtext, fontWeight: "700" },
  filtersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  filterChipActive: {
    backgroundColor: theme.colors.accent2,
    borderColor: "rgba(255,255,255,0.65)",
  },
  filterChipText: {
    color: theme.colors.subtext,
    fontWeight: "700",
  },
  filterChipTextActive: {
    color: theme.colors.text,
    fontWeight: "900",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontWeight: "900",
    fontSize: 16,
  },
  emptySub: {
    color: theme.colors.subtext,
    fontWeight: "700",
    textAlign: "center",
  },
});
