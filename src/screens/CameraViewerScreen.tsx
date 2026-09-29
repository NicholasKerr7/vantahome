import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import {
  selectActiveMember,
  selectVisibleDevices,
  selectVisibleRooms,
  useHomeStore,
} from "../store/useHomeStore";
import LiveVideoPlayer from "../components/LiveVideoPlayer";
import CameraThumbnail from "../components/CameraThumbnail";
import {
  DeepScreen,
  DeepCard,
  DeepAction,
} from "../components/deep/DeepScreen";
import { theme } from "../theme/theme";
import { roleHasPermission } from "../security/permissions";
import { useProtectedAccess } from "../security/useProtectedAccess";
import {
  CameraAccessState,
  formatCameraLastSeen,
} from "../features/cameras/CameraAccessState";

type Props = NativeStackScreenProps<RootStackParamList, "CameraViewer">;

/** Keep the feed dominant while preserving protected access and clear delivery status. */
export default function CameraViewerScreen({ route, navigation }: Props) {
  const { deviceId } = route.params;
  const device = useHomeStore((state) =>
    selectVisibleDevices(state).find((item) => item.id === deviceId),
  );
  const activeMember = useHomeStore(selectActiveMember);
  const allPermissionOverrides = useHomeStore(
    (state) => state.memberPermissionOverrides,
  );
  const permissionOverrides = useMemo(
    () =>
      allPermissionOverrides.filter(
        (item) => item.memberId === activeMember?.id,
      ),
    [activeMember?.id, allPermissionOverrides],
  );
  const rooms = useHomeStore(selectVisibleRooms);
  const canViewCamera = Boolean(
    activeMember &&
    roleHasPermission(activeMember.role, "device.view", permissionOverrides) &&
    roleHasPermission(activeMember.role, "camera.live", permissionOverrides),
  );
  const protectedAccess = useProtectedAccess(
    "Confirm access to this camera",
    canViewCamera,
  );
  const roomName =
    device?.roomId && rooms.find((room) => room.id === device.roomId)?.name;

  const isOnline = Boolean(device?.isOn);
  const streamUrl = isOnline ? device?.streamUrl : undefined;
  const lastSeen = formatCameraLastSeen(device?.lastSeenAt);
  const accessGranted = canViewCamera && protectedAccess.state === "granted";

  return (
    <DeepScreen
      title={accessGranted ? device?.name || "Camera" : "Camera"}
      eyebrow="PRIVATE VIEW"
      subtitle={
        accessGranted
          ? `${roomName || "Home"} · ${streamUrl ? "Live view" : isOnline ? "Awaiting live feed" : "Offline"}`
          : "Protected household camera"
      }
      onBack={() => navigation.goBack()}
      actions={
        device && accessGranted ? (
          <DeepAction
            label="Controls"
            icon="options-outline"
            onPress={() =>
              navigation.navigate("DeviceDetail", { deviceId: device.id })
            }
          />
        ) : undefined
      }
    >
      {!device ? (
        <DeepCard style={styles.empty}>
          <Ionicons
            name="videocam-off-outline"
            size={32}
            color={theme.colors.accentText}
          />
          <Text style={styles.emptyTitle}>Camera not found.</Text>
          <Text style={styles.description}>
            This camera may have been removed or is no longer available to your
            profile.
          </Text>
        </DeepCard>
      ) : !accessGranted ? (
        <CameraAccessState
          checking={canViewCamera && protectedAccess.state === "checking"}
          allowed={canViewCamera}
          onRetry={() => void protectedAccess.retry()}
        />
      ) : (
        <>
          <View style={styles.viewer}>
            {streamUrl ? (
              <LiveVideoPlayer
                sourceUri={streamUrl}
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
                    : lastSeen
                      ? `Last seen ${lastSeen}`
                      : "No signal detected"
                }
                titleStyle={styles.emptyTitle}
                subtitleStyle={styles.description}
              />
            )}
          </View>
          <DeepCard style={styles.statusCard}>
            <View style={styles.statusItem}>
              <Ionicons
                name={
                  device.armed ? "shield-checkmark-outline" : "shield-outline"
                }
                size={22}
                color={theme.colors.accentText}
              />
              <View style={styles.statusText}>
                <Text style={styles.label}>Protection</Text>
                <Text style={styles.value}>
                  {device.armed ? "Armed" : "Disarmed"}
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.statusItem}>
              <Ionicons
                name={
                  device.recording
                    ? "radio-button-on-outline"
                    : "radio-button-off-outline"
                }
                size={22}
                color={theme.colors.accentText}
              />
              <View style={styles.statusText}>
                <Text style={styles.label}>Recording</Text>
                <Text style={styles.value}>
                  {device.recording ? "Recording" : "Standby"}
                </Text>
              </View>
            </View>
          </DeepCard>
          <Text style={styles.privacyNote}>
            Private to members with camera access.
          </Text>
        </>
      )}
    </DeepScreen>
  );
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
    minHeight: 100,
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.bg0,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 18,
  },
  statusItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  statusText: { flex: 1, gap: 4 },
  divider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: theme.colors.stroke,
  },
  label: { color: theme.colors.muted, fontSize: 11 },
  value: { color: theme.colors.text, fontSize: 14, fontWeight: "500" },
  privacyNote: { color: theme.colors.muted, fontSize: 11, textAlign: "center" },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 24,
  },
  emptyTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "500" },
  description: {
    color: theme.colors.subtext,
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 20,
    textAlign: "center",
  },
});
