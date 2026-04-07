import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import ScreenFrame from "../components/ScreenFrame";
import BackgroundLines from "../components/BackgroundLines";
import Pressable from "../components/Pressable";
import { useResponsive } from "../theme/layout";
import { theme } from "../theme/theme";
import {
  selectVisibleDevices,
  selectVisibleRooms,
  useHomeStore,
} from "../store/useHomeStore";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deviceClient, type ConnectionStatus } from "../services/deviceClient";
import {
  buildDeviceHealthSnapshot,
  DEVICE_HEALTH_META,
  type DeviceHealthIssue,
} from "../data/deviceHealth";

type Props = NativeStackScreenProps<RootStackParamList, "DeviceHealth">;

const severityMeta: Record<
  DeviceHealthIssue["severity"],
  { label: string; color: string; soft: string; border: string }
> = {
  critical: {
    label: "Critical",
    color: "#FFD2D7",
    soft: "rgba(255,120,140,0.18)",
    border: "rgba(255,120,140,0.34)",
  },
  warning: {
    label: "Warning",
    color: "#FFE3A6",
    soft: "rgba(255,211,126,0.18)",
    border: "rgba(255,211,126,0.34)",
  },
  info: {
    label: "Info",
    color: "#D7E5FF",
    soft: "rgba(151,188,255,0.18)",
    border: "rgba(151,188,255,0.34)",
  },
};

export default function DeviceHealthScreen({ navigation }: Props) {
  const { contentWidth, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(900);
  const isWide = isTablet && isLandscape;
  const insets = useSafeAreaInsets();
  const devices = useHomeStore(selectVisibleDevices);
  const rooms = useHomeStore(selectVisibleRooms);
  const realtime = useHomeStore((s) => s.realtime);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    deviceClient.getConnectionStatus(),
  );
  const [connectionUrl, setConnectionUrl] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    return deviceClient.subscribeConnection((event) => {
      setConnectionStatus(event.status);
      setConnectionUrl(event.url);
    });
  }, []);

  const roomMap = useMemo(
    () => new Map(rooms.map((room) => [room.id, room.name])),
    [rooms],
  );
  const health = useMemo(
    () =>
      buildDeviceHealthSnapshot({
        devices,
        realtimeEnabled: realtime.enabled,
        useMqtt: realtime.useMqtt,
        mqttStatus: realtime.mqttStatus,
        mqttError: realtime.mqttError,
        connectionStatus,
        connectionUrl,
      }),
    [
      connectionStatus,
      connectionUrl,
      devices,
      realtime.enabled,
      realtime.mqttError,
      realtime.mqttStatus,
      realtime.useMqtt,
    ],
  );

  const cardPad = Math.round((isTablet ? 18 : 14) * scale);
  const cardRadius = Math.round((isTablet ? 24 : 20) * scale);
  const titleSize = Math.round((isTablet ? 28 : 24) * scale);
  const subSize = Math.round((isTablet ? 14 : 12) * scale);
  const sectionTitleSize = Math.round((isTablet ? 16 : 14) * scale);
  const rowSize = Math.round((isTablet ? 13 : 12) * scale);
  const pillSize = Math.round((isTablet ? 30 : 26) * scale);
  const framePad = Math.round((isTablet ? 14 : 10) * scale);
  const frameRadius = Math.round((isTablet ? 30 : 26) * scale);
  const gap = Math.round((isTablet ? 14 : 10) * scale);
  const tabInset = isTablet ? (isLandscape ? 28 : 24) : gutter;
  const tabBarInset = insets.bottom > 0 ? insets.bottom + 8 : tabInset;
  const tabBarHeight = Math.round(
    (isTablet ? (isLandscape ? 74 : 72) : 68) * scale,
  );
  const tabBarGap = Math.round((isTablet ? 12 : 8) * scale);
  const tabBarPad = tabBarInset + tabBarHeight + tabBarGap;

  const contentStyle: StyleProp<ViewStyle> = [
    styles.content,
    {
      paddingHorizontal: gutter,
      paddingTop: topPad,
      paddingBottom: tabBarPad,
    },
  ];
  const titleStyle: StyleProp<TextStyle> = [styles.title, { fontSize: titleSize }];
  const subTitleStyle: StyleProp<TextStyle> = [
    styles.subTitle,
    { fontSize: subSize },
  ];
  const sectionTitleStyle: StyleProp<TextStyle> = [
    styles.sectionTitle,
    { fontSize: sectionTitleSize },
  ];
  const rowTextStyle: StyleProp<TextStyle> = [styles.rowText, { fontSize: rowSize }];
  const summaryCardStyle: StyleProp<ViewStyle> = [
    styles.summaryCard,
    { padding: cardPad, borderRadius: cardRadius },
  ];
  const sectionCardStyle: StyleProp<ViewStyle> = [
    styles.sectionCard,
    { padding: cardPad, borderRadius: cardRadius },
  ];

  const totalIssues = health.counts.total;
  const headline =
    totalIssues === 0
      ? "All monitored devices look healthy."
      : totalIssues === 1
        ? "1 device needs attention."
        : `${totalIssues} device health issues need attention.`;

  const issueSections = (
    Object.keys(DEVICE_HEALTH_META) as Array<keyof typeof DEVICE_HEALTH_META>
  )
    .map((category) => ({
      category,
      meta: DEVICE_HEALTH_META[category],
      issues: health.byCategory[category],
    }))
    .filter((section) => section.issues.length > 0);

  return (
    <LinearGradient colors={[theme.colors.bg1, theme.colors.bg0]} style={styles.root}>
      <BackgroundLines />
      <View style={contentStyle}>
        <ScreenFrame
          enabled={!isWide}
          isWide={isWide}
          isPortrait={!isLandscape}
          pad={framePad}
          radius={frameRadius}
        >
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={titleStyle}>Device health</Text>
              <Text style={subTitleStyle}>
                Batteries, sensors, cameras, bridge status, and maintenance in one place.
              </Text>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap }}
          >
            <LinearGradient
              colors={[
                "rgba(255,255,255,0.96)",
                "rgba(237,232,255,0.9)",
                "rgba(209,223,255,0.84)",
              ]}
              start={{ x: 0.08, y: 0.02 }}
              end={{ x: 1, y: 1 }}
              style={summaryCardStyle}
            >
              <View style={styles.summaryHeader}>
                <View style={styles.summaryIconWrap}>
                  <Ionicons
                    name="pulse-outline"
                    size={Math.round((isTablet ? 24 : 20) * scale)}
                    color="rgba(29,20,56,0.9)"
                  />
                </View>
                <View style={styles.summaryCopy}>
                  <Text style={styles.summaryTitle}>Health center</Text>
                  <Text style={styles.summarySub}>{headline}</Text>
                </View>
              </View>
              <View style={styles.summaryStats}>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatValue}>{health.counts.critical}</Text>
                  <Text style={styles.summaryStatLabel}>Critical</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatValue}>{health.counts.warning}</Text>
                  <Text style={styles.summaryStatLabel}>Warnings</Text>
                </View>
                <View style={styles.summaryStat}>
                  <Text style={styles.summaryStatValue}>{devices.length}</Text>
                  <Text style={styles.summaryStatLabel}>Devices checked</Text>
                </View>
              </View>
            </LinearGradient>

            {issueSections.length === 0 ? (
              <View style={sectionCardStyle}>
                <Text style={sectionTitleStyle}>Healthy home</Text>
                <Text style={styles.emptyText}>
                  No low batteries, offline cameras, stale sensors, bridge issues, or maintenance reminders right now.
                </Text>
              </View>
            ) : (
              issueSections.map((section) => (
                <View key={section.category} style={sectionCardStyle}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionIconWrap}>
                      <Ionicons
                        name={section.meta.icon as keyof typeof Ionicons.glyphMap}
                        size={18}
                        color="rgba(255,255,255,0.92)"
                      />
                    </View>
                    <View style={styles.sectionHeaderCopy}>
                      <Text style={sectionTitleStyle}>{section.meta.label}</Text>
                      <Text style={styles.sectionSub}>{section.meta.description}</Text>
                    </View>
                    <View style={styles.sectionCountPill}>
                      <Text style={styles.sectionCountText}>{section.issues.length}</Text>
                    </View>
                  </View>

                  <View style={styles.issueList}>
                    {section.issues.map((issue) => {
                      const severity = severityMeta[issue.severity];
                      const roomName = issue.roomId ? roomMap.get(issue.roomId) : undefined;
                      return (
                        <Pressable
                          key={issue.id}
                          style={styles.issueRow}
                          disabled={!issue.deviceId}
                          onPress={() => {
                            if (!issue.deviceId) return;
                            navigation.navigate("DeviceDetail", {
                              deviceId: issue.deviceId,
                            });
                          }}
                        >
                          <View
                            style={[
                              styles.severityPill,
                              {
                                backgroundColor: severity.soft,
                                borderColor: severity.border,
                                height: pillSize,
                                borderRadius: Math.round(pillSize / 2),
                              },
                            ]}
                          >
                            <Text style={[styles.severityText, { color: severity.color }]}>
                              {severity.label}
                            </Text>
                          </View>
                          <View style={styles.issueCopy}>
                            <Text style={styles.issueTitle}>{issue.title}</Text>
                            <Text style={rowTextStyle}>{issue.detail}</Text>
                            {roomName ? (
                              <Text style={styles.issueMeta}>{roomName}</Text>
                            ) : null}
                          </View>
                          {issue.deviceId ? (
                            <Ionicons
                              name="chevron-forward"
                              size={16}
                              color="rgba(255,255,255,0.7)"
                            />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </ScreenFrame>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  headerText: { flex: 1 },
  title: { color: theme.colors.text, fontWeight: "900" },
  subTitle: { color: theme.colors.subtext, fontWeight: "700", marginTop: 4 },
  summaryCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  summaryIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  summaryCopy: { flex: 1 },
  summaryTitle: {
    color: "rgba(29,20,56,0.92)",
    fontWeight: "900",
    fontSize: 18,
  },
  summarySub: {
    color: "rgba(46,35,82,0.74)",
    fontWeight: "700",
    marginTop: 4,
  },
  summaryStats: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  summaryStat: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.64)",
  },
  summaryStatValue: {
    color: "rgba(29,20,56,0.92)",
    fontWeight: "900",
    fontSize: 18,
  },
  summaryStatLabel: {
    color: "rgba(46,35,82,0.66)",
    fontWeight: "700",
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  sectionHeaderCopy: { flex: 1 },
  sectionTitle: { color: theme.colors.text, fontWeight: "900" },
  sectionSub: {
    color: theme.colors.subtext,
    fontWeight: "700",
    marginTop: 2,
    fontSize: 12,
  },
  sectionCountPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  sectionCountText: { color: theme.colors.text, fontWeight: "900" },
  issueList: {
    marginTop: 14,
    gap: 10,
  },
  issueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  severityPill: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  severityText: { fontWeight: "900", fontSize: 11 },
  issueCopy: { flex: 1 },
  issueTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 14 },
  rowText: { color: theme.colors.subtext, fontWeight: "700", marginTop: 2 },
  issueMeta: {
    color: "rgba(255,255,255,0.58)",
    fontWeight: "700",
    marginTop: 4,
    fontSize: 11,
  },
  emptyText: {
    color: theme.colors.subtext,
    fontWeight: "700",
    marginTop: 8,
    lineHeight: 20,
  },
});
