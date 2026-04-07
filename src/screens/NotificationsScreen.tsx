import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Pressable from "../components/Pressable";
import AnalyticsHistoryCard from "../components/AnalyticsHistoryCard";
import LandscapeFrame from "../components/LandscapeFrame";
import PortraitFrame from "../components/PortraitFrame";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "../app/AppNavigator";
import { useResponsive } from "../theme/layout";
import { useHomeStore } from "../store/useHomeStore";
import { Swipeable } from "react-native-gesture-handler";
import {
  CATEGORY_META,
  formatNotificationTime,
  type NotificationCategory,
} from "../data/appNotifications";
import { buildSecurityAnalytics } from "../data/analyticsHistory";
import {
  clearDeliveredNotifications,
  dismissDeliveredNotification,
} from "../services/notifications";

type NotificationFilter = "all" | NotificationCategory;

export default function NotificationsScreen() {
  const { contentWidth, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(900);
  const isCompactPhone = !isTablet && contentWidth < 360;
  const isWide = isTablet && isLandscape;
  const isPortrait = !isLandscape;
  const iconBtnSize = Math.round(
    (isTablet ? 46 : isCompactPhone ? 34 : 38) * scale,
  );
  const iconBtnRadius = Math.round(iconBtnSize * 0.4);
  const titleSize = Math.round(
    (isTablet ? 26 : isCompactPhone ? 20 : 22) * scale,
  );
  const cardPad = Math.round((isTablet ? 18 : isCompactPhone ? 10 : 12) * scale);
  const cardRadius = Math.round(
    (isTablet ? 22 : isCompactPhone ? 14 : 16) * scale,
  );
  const framePad = Math.round((isTablet ? 14 : isCompactPhone ? 8 : 10) * scale);
  const frameRadius = Math.round(
    (isTablet ? 30 : isCompactPhone ? 22 : 26) * scale,
  );
  const frameWidth = isWide
    ? contentWidth
    : Math.max(0, contentWidth - gutter * 2);
  const listWidth = isWide
    ? Math.max(0, contentWidth - framePad * 2)
    : frameWidth;
  const iconWrapSize = Math.round(
    (isTablet ? 40 : isCompactPhone ? 30 : 34) * scale,
  );
  const iconWrapRadius = Math.round(iconWrapSize * 0.34);
  const iconSize = Math.round(
    (isTablet ? 20 : isCompactPhone ? 16 : 18) * scale,
  );
  const textSize = Math.round(
    (isTablet ? 14 : isCompactPhone ? 11 : 12) * scale,
  );
  const bodySize = Math.round(
    (isTablet ? 13 : isCompactPhone ? 10 : 11) * scale,
  );
  const gap = Math.round((isTablet ? 16 : isCompactPhone ? 8 : 10) * scale);
  const listBottomPad = Math.round(
    (isTablet ? (isLandscape ? 120 : 140) : 24) * scale,
  );
  const rootStyle: StyleProp<ViewStyle> = [styles.root, { paddingTop: topPad }];
  const topBarLayout: ViewStyle = {
    paddingHorizontal: gutter,
    width: contentWidth,
    alignSelf: "center",
  };
  const topBarStyle: StyleProp<ViewStyle> = [styles.topBar, topBarLayout];
  const iconButtonLayout: ViewStyle = {
    width: iconBtnSize,
    height: iconBtnSize,
    borderRadius: iconBtnRadius,
  };
  const iconButtonStyle: StyleProp<ViewStyle> = [
    styles.iconBtn,
    iconButtonLayout,
  ];
  const frameStyle: StyleProp<ViewStyle> = isWide
    ? { marginTop: Math.round(8 * scale) }
    : undefined;
  const innerGutter = isWide
    ? 0
    : isTablet
      ? gutter
      : Math.round(gutter * 0.6);
  const filtersRowLayout: ViewStyle = {
    paddingHorizontal: innerGutter,
    width: "100%",
    alignSelf: "center",
  };
  const filtersRowStyle: StyleProp<ViewStyle> = [
    styles.filtersRow,
    filtersRowLayout,
  ];
  const listWrapStyle: ViewStyle = {
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: innerGutter,
  };
  const listContentStyle: ViewStyle = {
    paddingTop: isCompactPhone ? 8 : 12,
    paddingBottom: listBottomPad,
    gap,
    paddingHorizontal: isWide ? 0 : innerGutter,
  };
  const listStyle: ViewStyle = { width: "100%" };
  const titleTextStyle: StyleProp<TextStyle> = [
    styles.h1,
    { fontSize: titleSize },
  ];
  const filterChipStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.filterChip,
    active && styles.filterChipActive,
  ];
  const filterChipTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.filterChipText,
    active && styles.filterChipTextActive,
  ];
  const listColumnStyle: StyleProp<ViewStyle> | undefined = isWide
    ? { gap }
    : undefined;
  const swipeTextStyle: StyleProp<TextStyle> = [
    styles.swipeText,
    { fontSize: bodySize },
  ];
  const cardStyle: StyleProp<ViewStyle> = [
    styles.card,
    { padding: cardPad, borderRadius: cardRadius, width: "100%" },
  ];
  const accentBarStyleFor = (accent: string): StyleProp<ViewStyle> => [
    styles.accentBar,
    { backgroundColor: accent },
  ];
  const iconWrapStyleFor = (
    accent: string,
    soft: string,
  ): StyleProp<ViewStyle> => [
    styles.iconWrap,
    {
      width: iconWrapSize,
      height: iconWrapSize,
      borderRadius: iconWrapRadius,
      backgroundColor: soft,
      borderColor: accent,
    },
  ];
  const cardTitleStyle: StyleProp<TextStyle> = [
    styles.title,
    { fontSize: textSize },
  ];
  const cardBodyStyle: StyleProp<TextStyle> = [
    styles.body,
    { fontSize: bodySize },
  ];
  const timeTextStyle: StyleProp<TextStyle> = [
    styles.time,
    { fontSize: bodySize },
  ];
  const newPillStyleFor = (
    accent: string,
    soft: string,
  ): StyleProp<ViewStyle> => [
    styles.newPill,
    { borderColor: accent, backgroundColor: soft },
  ];
  const newPillTextStyle: StyleProp<TextStyle> = [
    styles.newPillText,
    { fontSize: Math.round((isTablet ? 10 : isCompactPhone ? 8 : 9) * scale) },
  ];
  const topBarTitleWrapStyle: StyleProp<ViewStyle> = [
    styles.titleWrap,
    isCompactPhone && styles.titleWrapCompact,
  ];
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const notifications = useHomeStore((s) => s.notifications);
  const dismissNotification = useHomeStore((s) => s.dismissNotification);
  const clearNotifications = useHomeStore((s) => s.clearNotifications);
  const markNotificationsSeen = useHomeStore((s) => s.markNotificationsSeen);
  const FrameComponent = isPortrait ? PortraitFrame : LandscapeFrame;
  const frameEnabled = isPortrait || isWide;
  const filters: NotificationFilter[] = [
    "all",
    "alert",
    "device",
    "scene",
    "automation",
    "security",
    "info",
  ];
  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort((left, right) => right.createdAt - left.createdAt),
    [notifications],
  );
  const securityAnalytics = useMemo(
    () => buildSecurityAnalytics(sortedNotifications),
    [sortedNotifications],
  );

  useEffect(() => {
    markNotificationsSeen();
  }, [markNotificationsSeen]);

  const filteredNotifications = useMemo(() => {
    if (filter === "all") return sortedNotifications;
    return sortedNotifications.filter((item) => item.category === filter);
  }, [filter, sortedNotifications]);
  const canClearAll = notifications.length > 0;
  const clearButtonStyle = [
    styles.clearBtn,
    isCompactPhone && styles.clearBtnCompact,
    !canClearAll && styles.clearBtnDisabled,
  ];
  const clearButtonTextStyle = [
    styles.clearBtnText,
    { fontSize: bodySize },
    !canClearAll && styles.clearBtnTextDisabled,
  ];

  const handleDismissNotification = (notificationId: string, osNotificationId?: string) => {
    dismissNotification(notificationId);
    dismissDeliveredNotification(osNotificationId).catch(() => {});
  };

  const handleClearAll = () => {
    clearNotifications();
    clearDeliveredNotifications().catch(() => {});
  };

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={rootStyle}
    >
      <View
        style={topBarStyle}
      >
        <Pressable
          style={iconButtonStyle}
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate({ name: "Main", params: { screen: "Home" } });
          }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </Pressable>
        <View style={topBarTitleWrapStyle}>
          <Text style={titleTextStyle}>Notifications</Text>
        </View>
        <Pressable
          style={clearButtonStyle}
          onPress={handleClearAll}
          disabled={!canClearAll}
        >
          <Ionicons
            name="trash-outline"
            size={Math.round(16 * scale)}
            color={canClearAll ? theme.colors.text : theme.colors.subtext}
          />
          <Text style={clearButtonTextStyle}>
            Clear all
          </Text>
        </Pressable>
      </View>
      <FrameComponent
        enabled={frameEnabled}
        width={frameWidth}
        pad={framePad}
        radius={frameRadius}
        style={frameStyle}
      >
        <View style={filtersRowStyle}>
          {filters.map((option) => {
            const active = filter === option;
              const label =
                option === "all" ? "All" : CATEGORY_META[option].label;
            return (
              <Pressable
                key={option}
                style={filterChipStyle(active)}
                onPress={() => setFilter(option)}
              >
                <Text style={filterChipTextStyle(active)}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={listWrapStyle}>
          <View style={styles.analyticsWrap}>
            <AnalyticsHistoryCard
              title="Security activity"
              subtitle="24h and 7d event volume"
              icon="shield-checkmark-outline"
              datasets={securityAnalytics}
              accentColor={CATEGORY_META.security.accent}
            />
          </View>
          <FlatList
            data={filteredNotifications}
            keyExtractor={(item) => item.id}
            numColumns={isWide ? 2 : 1}
            columnWrapperStyle={listColumnStyle}
            contentContainerStyle={listContentStyle}
            style={listStyle}
            renderItem={({ item }) => {
              const meta = CATEGORY_META[item.category];
              const cardWidth = isWide
                ? Math.floor((listWidth - gap) / 2)
                : "100%";
              const cardContainerStyle: StyleProp<ViewStyle> = { width: cardWidth };
              return (
                <Swipeable
                  renderRightActions={() => (
                    <View style={styles.swipeActions}>
                      <Pressable
                        style={styles.swipeButton}
                        onPress={() =>
                          handleDismissNotification(item.id, item.osNotificationId)
                        }
                      >
                        <Ionicons
                          name="close"
                          size={Math.round(18 * scale)}
                          color={theme.colors.text}
                        />
                        <Text style={swipeTextStyle}>Dismiss</Text>
                      </Pressable>
                    </View>
                  )}
                  onSwipeableOpen={() =>
                    handleDismissNotification(item.id, item.osNotificationId)
                  }
                  rightThreshold={48}
                  overshootRight={false}
                  containerStyle={cardContainerStyle}
                >
                  <View style={cardStyle}>
                    <View style={accentBarStyleFor(meta.accent)} />
                    <View style={iconWrapStyleFor(meta.accent, meta.soft)}>
                      <Ionicons
                        name={meta.icon as keyof typeof Ionicons.glyphMap}
                        size={iconSize}
                        color={meta.accent}
                      />
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={cardTitleStyle}>{item.title}</Text>
                      <Text style={cardBodyStyle}>{item.body}</Text>
                    </View>
                    <View style={styles.cardMeta}>
                      {item.isNew && (
                        <View style={newPillStyleFor(meta.accent, meta.soft)}>
                          <Text style={newPillTextStyle}>NEW</Text>
                        </View>
                      )}
                      <Text style={timeTextStyle}>
                        {formatNotificationTime(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                </Swipeable>
              );
            }}
            ListEmptyComponent={() => (
              <View style={styles.emptyState}>
                <Ionicons
                  name="checkmark-circle"
                  size={28}
                  color="rgba(255,255,255,0.65)"
                />
                <Text style={styles.emptyTitle}>You are all caught up</Text>
                <Text style={styles.emptySub}>
                  No notifications match this filter.
                </Text>
              </View>
            )}
          />
        </View>
      </FrameComponent>
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
    position: "relative",
  },
  titleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  titleWrapCompact: {
    left: 44,
    right: 92,
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
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  clearBtnDisabled: { opacity: 0.5 },
  clearBtnCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearBtnText: { color: theme.colors.text, fontWeight: "800" },
  clearBtnTextDisabled: { color: theme.colors.subtext },
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
  swipeActions: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,99,132,0.18)",
    borderRadius: 18,
    marginLeft: 10,
    height: "100%",
  },
  swipeButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    gap: 4,
  },
  swipeText: { color: theme.colors.text, fontWeight: "800" },
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
  analyticsWrap: {
    marginTop: 10,
  },
});
