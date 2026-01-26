import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import ScreenFrame from "../components/ScreenFrame";
import ScreenSectionLayout from "../components/ScreenSectionLayout";
import HeaderPill from "../components/HeaderPill";
import BackgroundLines from "../components/BackgroundLines";
import Pressable from "../components/Pressable";
import LiveVideoPlayer from "../components/LiveVideoPlayer";
import { useResponsive } from "../theme/layout";
import { theme } from "../theme/theme";
import {
  selectActiveMember,
  selectVisibleDevices,
  selectVisibleRooms,
  useHomeStore,
  type Device,
} from "../store/useHomeStore";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = NativeStackScreenProps<RootStackParamList, "Cameras">;

export default function CamerasScreen({ navigation }: Props) {
  const { width, contentWidth, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(920);
  const isWide = isTablet && isLandscape;
  const isTabletPortrait = isTablet && !isLandscape;
  const isPortrait = !isLandscape;
  const activeMember = useHomeStore(selectActiveMember);
  const rooms = useHomeStore(selectVisibleRooms);
  const visibleDevices = useHomeStore(selectVisibleDevices);
  const allDevices = useHomeStore((s) => s.devices);
  const canViewAll = activeMember
    ? ["Owner", "Admin"].includes(activeMember.role)
    : false;
  const cameraDevices = useMemo(() => {
    const source = canViewAll ? allDevices : visibleDevices;
    return source.filter((device) => device.kind === "camera");
  }, [allDevices, canViewAll, visibleDevices]);
  const roomMap = useMemo(
    () => new Map(rooms.map((room) => [room.id, room.name])),
    [rooms],
  );
  const headerTitleSize = Math.round((isTablet ? 30 : 24) * scale);
  const headerSubSize = Math.round((isTablet ? 14 : 12) * scale);
  const cardPad = Math.round((isTablet ? 18 : 14) * scale);
  const cardRadius = Math.round((isTablet ? 24 : 20) * scale);
  const pillHeight = Math.round((isTablet ? 30 : 26) * scale);
  const pillTextSize = Math.round((isTablet ? 12 : 11) * scale);
  const metaSize = Math.round((isTablet ? 13 : 12) * scale);
  const titleSize = Math.round((isTablet ? 18 : 16) * scale);
  const subSize = Math.round((isTablet ? 13 : 12) * scale);
  const outerGutter = isWide
    ? Math.round(gutter * 0.6)
    : isTablet
      ? gutter
      : gutter;
  const innerGutter = isWide
    ? Math.round(gutter * 0.75)
    : isTablet
      ? gutter
      : Math.round(gutter * 0.6);
  const framePad = Math.round((isTablet ? 14 : 10) * scale);
  const frameRadius = Math.round((isTablet ? 30 : 26) * scale);
  const insets = useSafeAreaInsets();
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
      paddingHorizontal: outerGutter,
      paddingTop: topPad,
      paddingBottom: tabBarPad,
    },
  ];
  const headerStyle: StyleProp<ViewStyle> = [
    styles.header,
    !isTablet && styles.headerPhone,
    isTabletPortrait && styles.headerTabletPortrait,
  ];
  const headerTitleStyle: StyleProp<TextStyle> = [
    styles.h1,
    { fontSize: headerTitleSize },
  ];
  const headerSubStyle: StyleProp<TextStyle> = [
    styles.p,
    { fontSize: headerSubSize },
  ];
  const headerPillStyle: StyleProp<ViewStyle> = [
    styles.headerPill,
    { height: pillHeight, borderRadius: Math.round(pillHeight / 2) },
  ];
  const headerPillTextStyle: StyleProp<TextStyle> = [
    styles.headerPillText,
    { fontSize: pillTextSize },
  ];
  const headerWrapStyle: StyleProp<ViewStyle> = {
    paddingHorizontal: innerGutter,
    marginBottom: Math.round((isTablet ? 12 : 10) * scale),
    marginTop: isWide ? Math.round(6 * scale) : 0,
  };
  const dividerWrapStyle: StyleProp<ViewStyle> = {
    paddingVertical: Math.round((isTablet ? 16 : 12) * scale),
  };
  const gridGap = Math.round((isTablet ? 16 : 12) * scale);
  const layoutWidth = contentWidth - innerGutter * 2;
  const gridColumns = isWide ? 3 : isTabletPortrait ? 2 : 1;
  const gridCardWidthLandscape = isWide
    ? Math.floor((layoutWidth - gridGap * (gridColumns - 1)) / gridColumns)
    : undefined;
  const gridCardWidth = isTabletPortrait
    ? Math.floor((contentWidth - innerGutter * 2 - gridGap) / 2)
    : undefined;
  const cardStyle: StyleProp<ViewStyle> = [
    styles.card,
    {
      padding: cardPad,
      borderRadius: cardRadius,
      width: gridCardWidthLandscape ?? gridCardWidth,
    },
  ];
  const cardTitleStyle: StyleProp<TextStyle> = [
    styles.cardTitle,
    { fontSize: titleSize },
  ];
  const cardSubStyle: StyleProp<TextStyle> = [
    styles.cardSub,
    { fontSize: subSize },
  ];
  const statusPillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.statusPill,
    {
      height: pillHeight,
      borderRadius: Math.round(pillHeight / 2),
      backgroundColor: active
        ? "rgba(122,92,255,0.28)"
        : "rgba(255,255,255,0.6)",
      borderColor: active
        ? "rgba(122,92,255,0.6)"
        : "rgba(0,0,0,0.08)",
    },
  ];
  const statusTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.statusText,
    { fontSize: pillTextSize },
    active && styles.statusTextActive,
  ];
  const metaTextStyle: StyleProp<TextStyle> = [
    styles.metaText,
    { fontSize: metaSize },
  ];
  const navPillStyle: StyleProp<ViewStyle> = [
    styles.navPill,
    {
      height: pillHeight,
      borderRadius: Math.round(pillHeight / 2),
      paddingHorizontal: isWide ? Math.round(16 * scale) : 12,
    },
  ];
  const navPillTextStyle: StyleProp<TextStyle> = [
    styles.navPillText,
    { fontSize: pillTextSize },
  ];
  const navRowStyle: StyleProp<ViewStyle> = [
    styles.headerNavRow,
    isWide && {
      marginBottom: Math.round(6 * scale),
      gap: Math.round(12 * scale),
    },
  ];
  const previewStyle: StyleProp<ViewStyle> = [
    styles.preview,
    {
      height: Math.round((isTabletPortrait ? 160 : 120) * scale),
      borderRadius: Math.round((isTabletPortrait ? 20 : 16) * scale),
    },
  ];
  const statPillStyle: StyleProp<ViewStyle> = [
    styles.statPill,
    {
      height: pillHeight,
      borderRadius: Math.round(pillHeight / 2),
    },
  ];
  const statTextStyle: StyleProp<TextStyle> = [
    styles.statText,
    { fontSize: pillTextSize },
  ];
  const maxLiveStreams = isWide ? 6 : isTabletPortrait ? 4 : 2;
  const [liveStreams, setLiveStreams] = useState<string[]>([]);
  const toggleLive = (deviceId: string) => {
    setLiveStreams((current) => {
      if (current.includes(deviceId)) {
        return current.filter((id) => id !== deviceId);
      }
      if (current.length >= maxLiveStreams) return current;
      return [...current, deviceId];
    });
  };

  const headerSummary = `${cameraDevices.length} Camera${cameraDevices.length === 1 ? "" : "s"}`;
  const showLimitedNote = !canViewAll && cameraDevices.length > 0;
  const onlineCount = cameraDevices.filter((camera) => camera.isOn).length;
  const armedCount = cameraDevices.filter((camera) => camera.armed).length;
  const recordingCount = cameraDevices.filter(
    (camera) => camera.recording,
  ).length;
  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate("Main", { screen: "Home" } as never);
  };

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={styles.root}
    >
      <BackgroundLines />
      <View style={contentStyle}>
        <ScreenFrame
          isPortrait={isPortrait}
          enabled={isPortrait || isWide}
          isWide={isWide}
          pad={framePad}
          radius={frameRadius}
        >
          <ScreenSectionLayout
            header={
              <View style={styles.headerBlock}>
                <View style={navRowStyle}>
                  <Pressable
                    style={navPillStyle}
                    onPress={handleBack}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={Math.round(16 * scale)}
                      color={theme.colors.text}
                    />
                    <Text style={navPillTextStyle}>Back</Text>
                  </Pressable>
                  <Pressable
                    style={navPillStyle}
                    onPress={() =>
                      navigation.navigate(
                        "Main",
                        { screen: "Home" } as never,
                      )
                    }
                  >
                    <Ionicons
                      name="home-outline"
                      size={Math.round(16 * scale)}
                      color={theme.colors.text}
                    />
                    <Text style={navPillTextStyle}>Home</Text>
                  </Pressable>
                </View>
                <View style={headerStyle}>
                  <View>
                    <Text style={headerTitleStyle}>Cameras</Text>
                    <Text style={headerSubStyle}>
                      {canViewAll
                        ? "Monitor every camera in the home."
                        : "Cameras assigned to your rooms."}
                    </Text>
                  </View>
                  <HeaderPill
                    label={headerSummary}
                    icon="videocam-outline"
                    iconSize={Math.round(14 * scale)}
                    style={headerPillStyle}
                    textStyle={headerPillTextStyle}
                  />
                </View>
                {isTabletPortrait || isWide ? (
                  <View style={styles.statRow}>
                    <View style={statPillStyle}>
                      <Ionicons
                        name="wifi"
                        size={Math.round(14 * scale)}
                        color="rgba(255,255,255,0.92)"
                      />
                      <Text style={statTextStyle}>
                        {onlineCount} online
                      </Text>
                    </View>
                    <View style={statPillStyle}>
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={Math.round(14 * scale)}
                        color="rgba(255,255,255,0.92)"
                      />
                      <Text style={statTextStyle}>
                        {armedCount} armed
                      </Text>
                    </View>
                    <View style={statPillStyle}>
                      <Ionicons
                        name="ellipse"
                        size={Math.round(12 * scale)}
                        color="rgba(255,118,118,0.95)"
                      />
                      <Text style={statTextStyle}>
                        {recordingCount} rec
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            }
            headerWrapStyle={headerWrapStyle}
            showDivider={isWide}
            dividerWrapStyle={dividerWrapStyle}
            scrollStyle={styles.sectionsScroll}
            contentContainerStyle={{ paddingHorizontal: innerGutter }}
            showsVerticalScrollIndicator={false}
          >
            {showLimitedNote ? (
              <View style={styles.noticeCard}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={Math.round(16 * scale)}
                  color="rgba(255,255,255,0.8)"
                />
                <Text style={styles.noticeText}>
                  Showing cameras you can access. Ask the owner for full access.
                </Text>
              </View>
            ) : null}

            {cameraDevices.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No cameras yet</Text>
                <Text style={styles.emptySub}>
                  Add a camera device to view a live overview.
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.cardGrid,
                  { gap: gridGap },
                  isWide && styles.cardGridLandscape,
                  isTabletPortrait && styles.cardGridTablet,
                ]}
              >
                {cameraDevices.map((camera) => {
                  const roomLabel =
                    (camera.roomId && roomMap.get(camera.roomId)) || "Home";
                  const isOnline = camera.isOn ?? false;
                  const armed = Boolean(camera.armed);
                  const recording = Boolean(camera.recording);
                  const statusLabel = isOnline ? "Online" : "Offline";
                  const isLive = liveStreams.includes(camera.id);
                  const hasStream = Boolean(camera.streamUrl);
                  const canStart =
                    isOnline &&
                    hasStream &&
                    (isLive || liveStreams.length < maxLiveStreams);
                  const previewButtonLabel = isLive
                    ? "Stop"
                    : !canStart
                      ? "Limit reached"
                      : "Go live";
                  return (
                    <View
                      key={camera.id}
                      style={cardStyle}
                    >
                      <View style={previewStyle}>
                        {isLive && camera.streamUrl ? (
                          <LiveVideoPlayer sourceUri={camera.streamUrl} />
                        ) : (
                          <>
                            <LinearGradient
                              colors={[
                                "rgba(255,255,255,0.08)",
                                "rgba(255,255,255,0.02)",
                                "rgba(0,0,0,0.08)",
                              ]}
                              start={{ x: 0.1, y: 0.1 }}
                              end={{ x: 1, y: 1 }}
                              style={StyleSheet.absoluteFillObject}
                            />
                            <View style={styles.previewContent}>
                              <Ionicons
                                name={isOnline ? "videocam" : "videocam-off"}
                                size={Math.round(18 * scale)}
                                color="rgba(255,255,255,0.9)"
                              />
                              <Text style={styles.previewText}>
                                {isOnline ? "Live feed" : "Offline"}
                              </Text>
                            </View>
                          </>
                        )}
                        <View style={styles.previewOverlay}>
                          <Pressable
                            style={[
                              styles.previewButton,
                              !canStart && styles.previewButtonDisabled,
                            ]}
                            onPress={() => toggleLive(camera.id)}
                            disabled={!canStart && !isLive}
                          >
                            <Ionicons
                              name={isLive ? "stop" : "play"}
                              size={Math.round(14 * scale)}
                              color={
                                !canStart && !isLive
                                  ? "rgba(255,255,255,0.7)"
                                  : "rgba(255,255,255,0.95)"
                              }
                            />
                            <Text style={styles.previewButtonText}>
                              {previewButtonLabel}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                      <View style={styles.cardHeader}>
                        <View style={styles.cardTitleWrap}>
                          <Text style={cardTitleStyle}>{camera.name}</Text>
                          <Text style={cardSubStyle}>{roomLabel}</Text>
                        </View>
                        <View style={statusPillStyle(isOnline)}>
                          <Ionicons
                            name={isOnline ? "wifi" : "wifi-outline"}
                            size={Math.round(12 * scale)}
                            color={
                              isOnline
                                ? "rgba(36,28,72,0.9)"
                                : "rgba(30,30,40,0.7)"
                            }
                          />
                          <Text style={statusTextStyle(isOnline)}>
                            {statusLabel}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.cardMetaRow}>
                        <Text style={metaTextStyle}>
                          {armed ? "Armed" : "Disarmed"}
                        </Text>
                        <View style={styles.metaDot} />
                        <Text style={metaTextStyle}>
                          {recording ? "Recording" : "Standby"}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.cardActionRow}
                        onPress={() =>
                          navigation.navigate("DeviceDetail", {
                            deviceId: camera.id,
                          })
                        }
                      >
                        <Ionicons
                          name="open-outline"
                          size={Math.round(16 * scale)}
                          color="rgba(255,255,255,0.8)"
                        />
                        <Text style={styles.cardActionText}>View details</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </ScreenSectionLayout>
        </ScreenFrame>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, alignItems: "center" },
  sectionsScroll: { flex: 1 },
  headerBlock: { gap: 12 },
  headerNavRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTabletPortrait: {
    alignItems: "flex-start",
  },
  headerPhone: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  h1: { color: theme.colors.text, fontWeight: "900" },
  p: { color: theme.colors.subtext, marginTop: 6, fontWeight: "700" },
  headerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  headerPillText: { color: theme.colors.text, fontWeight: "800" },
  navPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  navPillText: { color: theme.colors.text, fontWeight: "800" },
  noticeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  noticeText: { color: theme.colors.text, fontWeight: "700", flexShrink: 1 },
  emptyCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  emptyTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16 },
  emptySub: {
    marginTop: 6,
    color: theme.colors.subtext,
    fontWeight: "700",
  },
  cardGrid: { width: "100%" },
  cardGridTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  cardGridLandscape: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  landscapeLayout: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  preview: {
    height: 120,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  previewContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  previewText: { color: theme.colors.text, fontWeight: "800" },
  card: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitleWrap: { flex: 1, minWidth: 0 },
  cardTitle: { color: theme.colors.text, fontWeight: "900" },
  cardSub: { color: theme.colors.subtext, marginTop: 4, fontWeight: "700" },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  metaText: { color: theme.colors.subtext, fontWeight: "700" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  statusText: { color: "rgba(30,30,40,0.75)", fontWeight: "800" },
  statusTextActive: { color: "rgba(36,28,72,0.95)" },
  cardActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  cardActionText: { color: theme.colors.text, fontWeight: "800" },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "flex-start",
    padding: 12,
  },
  previewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(122,92,255,0.75)",
  },
  previewButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  previewButtonText: {
    color: "rgba(255,255,255,0.95)",
    fontWeight: "800",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  statText: { color: theme.colors.text, fontWeight: "800" },
});
