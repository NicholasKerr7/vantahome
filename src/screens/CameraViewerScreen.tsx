import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import {
  selectVisibleDevices,
  selectVisibleRooms,
  useHomeStore,
} from "../store/useHomeStore";
import LiveVideoPlayer from "../components/LiveVideoPlayer";
import CameraThumbnail from "../components/CameraThumbnail";
import Pressable from "../components/Pressable";
import { theme } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "CameraViewer">;

const formatLastSeen = (ts?: number) => {
  if (!ts) return "";
  const delta = Date.now() - ts;
  if (delta < 30_000) return "Just now";
  const mins = Math.floor(delta / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function CameraViewerScreen({ route, navigation }: Props) {
  const { deviceId } = route.params;
  const insets = useSafeAreaInsets();
  const device = useHomeStore((s) =>
    selectVisibleDevices(s).find((item) => item.id === deviceId),
  );
  const rooms = useHomeStore(selectVisibleRooms);
  const roomName =
    device?.roomId && rooms.find((room) => room.id === device.roomId)?.name;

  if (!device) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Camera not available for this profile.</Text>
      </View>
    );
  }

  const isOnline = Boolean(device.isOn);
  const streamUrl = device.streamUrl;
  const lastSeenLabel = formatLastSeen(device.lastSeenAt);
  const hasStream = Boolean(isOnline && streamUrl);

  return (
    <LinearGradient colors={[theme.colors.bg1, theme.colors.bg0]} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
          <Text style={styles.headerBtnText}>Back</Text>
        </Pressable>
        <Pressable
          style={styles.headerBtn}
          onPress={() =>
            navigation.navigate("DeviceDetail", { deviceId: device.id })
          }
        >
          <Ionicons name="settings-outline" size={16} color={theme.colors.text} />
          <Text style={styles.headerBtnText}>Details</Text>
        </Pressable>
      </View>

      <View style={styles.viewer}>
        {hasStream ? (
          <LiveVideoPlayer
            sourceUri={streamUrl as string}
            contentFit="contain"
            enableFullscreen={false}
          />
        ) : (
          <CameraThumbnail
            uri={device.thumbnailUrl ?? device.lastThumbnailUrl}
            title={isOnline ? "Live unavailable" : "Camera offline"}
            subtitle={
              isOnline
                ? "Try again soon"
                : lastSeenLabel
                  ? `Last seen ${lastSeenLabel}`
                  : "No signal detected"
            }
          />
        )}
      </View>

      <View style={[styles.info, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.infoLeft}>
          <Text style={styles.title}>{device.name}</Text>
          <Text style={styles.sub}>
            {roomName || "Home"} •{" "}
            {isOnline
              ? "Live"
              : lastSeenLabel
                ? `Last seen ${lastSeenLabel}`
                : "Offline"}
          </Text>
        </View>
        <View style={styles.statusPills}>
          <View style={[styles.statusPill, device.armed && styles.statusPillActive]}>
            <Ionicons
              name={device.armed ? "eye" : "eye-off"}
              size={14}
              color={device.armed ? "#1a1433" : "rgba(255,255,255,0.9)"}
            />
            <Text style={[styles.statusText, device.armed && styles.statusTextActive]}>
              {device.armed ? "Armed" : "Disarmed"}
            </Text>
          </View>
          <View style={[styles.statusPill, device.recording && styles.statusPillActive]}>
            <Ionicons
              name={device.recording ? "radio-button-on" : "radio-button-off"}
              size={14}
              color={device.recording ? "#1a1433" : "rgba(255,255,255,0.9)"}
            />
            <Text style={[styles.statusText, device.recording && styles.statusTextActive]}>
              {device.recording ? "Recording" : "Standby"}
            </Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  headerBtnText: { color: theme.colors.text, fontWeight: "800" },
  viewer: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  info: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  infoLeft: { gap: 4 },
  title: { color: theme.colors.text, fontWeight: "900", fontSize: 20 },
  sub: { color: theme.colors.subtext, fontWeight: "700" },
  statusPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  statusPillActive: {
    backgroundColor: "rgba(122,92,255,0.7)",
    borderColor: "rgba(122,92,255,0.8)",
  },
  statusText: { color: theme.colors.text, fontWeight: "800" },
  statusTextActive: { color: "#1a1433" },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },
  missingText: { color: theme.colors.text, fontWeight: "800" },
});
