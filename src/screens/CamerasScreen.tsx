import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  DeepScreen,
  DeepTabs,
  DeepCard,
  DeepAction,
  DeepPager,
} from "../components/deep/DeepScreen";
import Pressable from "../components/Pressable";
import LiveVideoPlayer from "../components/LiveVideoPlayer";
import CameraThumbnail from "../components/CameraThumbnail";
import RenderProfiler from "../components/RenderProfiler";
import { useResponsive } from "../theme/layout";
import { theme } from "../theme/theme";
import {
  selectActiveMember,
  selectVisibleDevices,
  selectVisibleRooms,
  useHomeStore,
} from "../store/useHomeStore";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import { openHomeFeature } from "../app/homeNavigation";
import { useFocusEffect } from "@react-navigation/native";
import { roleHasPermission } from "../security/permissions";
import { useProtectedAccess } from "../security/useProtectedAccess";
import {
  CameraAccessState,
  formatCameraLastSeen,
} from "../features/cameras/CameraAccessState";

type Props = NativeStackScreenProps<RootStackParamList, "Cameras">;
const FILTERS = [
  { id: "all", label: "All cameras" },
  { id: "online", label: "Online" },
  { id: "armed", label: "Armed" },
] as const;

/** A bounded camera monitor that keeps private feeds behind role and device authentication. */
export default function CamerasScreen({ navigation }: Props) {
  const { isTablet, isLandscape } = useResponsive(1100);
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
  const visibleDevices = useHomeStore(selectVisibleDevices);
  const allDevices = useHomeStore((state) => state.devices);
  const canViewCamera = Boolean(
    activeMember &&
    roleHasPermission(activeMember.role, "device.view", permissionOverrides) &&
    roleHasPermission(activeMember.role, "camera.live", permissionOverrides),
  );
  const canViewAll = Boolean(
    activeMember && ["Owner", "Admin"].includes(activeMember.role),
  );
  const cameraDevices = useMemo(
    () =>
      canViewCamera
        ? (canViewAll ? allDevices : visibleDevices).filter(
            (device) => device.kind === "camera",
          )
        : [],
    [allDevices, canViewAll, canViewCamera, visibleDevices],
  );
  const protectedAccess = useProtectedAccess(
    "Confirm access to household cameras",
    canViewCamera,
  );
  const roomMap = useMemo(
    () => new Map(rooms.map((room) => [room.id, room.name])),
    [rooms],
  );
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [liveStreams, setLiveStreams] = useState<string[]>([]);
  const pageSize = isTablet ? (isLandscape ? 3 : 2) : 1;
  const maxLiveStreams = isTablet ? (isLandscape ? 6 : 4) : 2;
  const cameras = cameraDevices.filter((camera) =>
    filter === "online"
      ? camera.isOn
      : filter === "armed"
        ? camera.armed
        : true,
  );
  const pageCount = Math.max(1, Math.ceil(cameras.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const shownCameras = cameras.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const onlineCount = cameraDevices.filter((camera) => camera.isOn).length;
  const recordingCount = cameraDevices.filter(
    (camera) => camera.recording,
  ).length;

  /** Release live players when moving between monitor pages. */
  const changePage = (nextPage: number) => {
    setLiveStreams([]);
    setPage(nextPage);
  };
  /** A filter change starts at the first matching camera and releases hidden players. */
  const changeFilter = (id: string) => {
    setFilter(id);
    changePage(0);
  };
  /** Bound simultaneous streams while preserving the explicit stop action. */
  const toggleLive = useCallback(
    (id: string) =>
      setLiveStreams((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : current.length < maxLiveStreams
            ? [...current, id]
            : current,
      ),
    [maxLiveStreams],
  );
  useFocusEffect(useCallback(() => () => setLiveStreams([]), []));
  /** Return to the immersive home when this route has no navigation history. */
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else openHomeFeature(navigation.dispatch, "Home");
  }, [navigation]);

  return (
    <RenderProfiler id="CamerasScreen">
      <DeepScreen
        title="Cameras"
        eyebrow="HOME SECURITY"
        subtitle={
          canViewAll
            ? "A clear view of your property."
            : "Private views from your assigned rooms."
        }
        onBack={handleBack}
        actions={
          liveStreams.length ? (
            <DeepAction
              label="Stop all"
              icon="stop-outline"
              onPress={() => setLiveStreams([])}
            />
          ) : undefined
        }
      >
        {!canViewCamera || protectedAccess.state !== "granted" ? (
          <CameraAccessState
            checking={canViewCamera && protectedAccess.state === "checking"}
            allowed={canViewCamera}
            onRetry={() => void protectedAccess.retry()}
          />
        ) : (
          <>
            <View style={styles.summary}>
              <Text style={styles.summaryNumber}>
                {onlineCount}
                <Text style={styles.summaryLabel}>
                  {" "}
                  / {cameraDevices.length} online
                </Text>
              </Text>
              <View style={styles.recording}>
                <Ionicons
                  name="radio-button-on"
                  size={14}
                  color={
                    recordingCount
                      ? theme.colors.accentText
                      : theme.colors.muted
                  }
                />
                <Text style={styles.summaryLabel}>
                  {recordingCount} recording
                </Text>
              </View>
            </View>
            <DeepTabs
              items={FILTERS}
              selectedId={filter}
              onSelect={changeFilter}
            />
            {!canViewAll && cameraDevices.length > 0 ? (
              <Text style={styles.notice}>
                Showing cameras you can access. Ask the owner for full access.
              </Text>
            ) : null}
            <View style={[styles.grid, isTablet && styles.gridTablet]}>
              {shownCameras.map((camera) => {
                const isOnline = Boolean(camera.isOn);
                const isLive = liveStreams.includes(camera.id);
                const hasStream = Boolean(camera.streamUrl);
                const canStart =
                  isOnline &&
                  hasStream &&
                  (isLive || liveStreams.length < maxLiveStreams);
                const lastSeen = formatCameraLastSeen(camera.lastSeenAt);
                const playLabel = isLive
                  ? "Stop live"
                  : !isOnline
                    ? "Offline"
                    : !hasStream
                      ? "No live feed"
                      : !canStart
                        ? "Limit reached"
                        : "Go live";
                return (
                  <DeepCard key={camera.id} style={styles.cameraCard}>
                    <View style={styles.cardHeading}>
                      <View style={styles.cardTitleWrap}>
                        <Text style={styles.cameraName} numberOfLines={2}>
                          {camera.name}
                        </Text>
                        <Text style={styles.room}>
                          {(camera.roomId && roomMap.get(camera.roomId)) ||
                            "Home"}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityLabel={`Camera controls for ${camera.name}`}
                        style={styles.controls}
                        onPress={() =>
                          navigation.navigate("DeviceDetail", {
                            deviceId: camera.id,
                          })
                        }
                      >
                        <Ionicons
                          name="options-outline"
                          size={20}
                          color={theme.colors.accentText}
                        />
                      </Pressable>
                    </View>
                    <View style={styles.preview}>
                      {isLive && camera.streamUrl ? (
                        <LiveVideoPlayer
                          sourceUri={camera.streamUrl}
                          enableFullscreen={false}
                          onFullscreen={() =>
                            navigation.navigate("CameraViewer", {
                              deviceId: camera.id,
                            })
                          }
                        />
                      ) : (
                        <CameraThumbnail
                          uri={camera.thumbnailUrl ?? camera.lastThumbnailUrl}
                          title={
                            !isOnline
                              ? "Camera offline"
                              : camera.thumbnailUrl || camera.lastThumbnailUrl
                                ? "Last snapshot"
                                : "No snapshot yet"
                          }
                          subtitle={
                            isOnline
                              ? hasStream
                                ? "Start a live view below"
                                : "Live feed is not configured"
                              : lastSeen
                                ? `Last seen ${lastSeen}`
                                : "No signal"
                          }
                          titleStyle={styles.snapshotTitle}
                          subtitleStyle={styles.snapshotSubtitle}
                        />
                      )}
                    </View>
                    <View style={styles.metadata}>
                      <View style={styles.status}>
                        <View
                          style={[
                            styles.statusDot,
                            isOnline && styles.statusDotOnline,
                          ]}
                        />
                        <Text style={styles.statusText}>
                          {isOnline ? "Online" : "Offline"}
                        </Text>
                      </View>
                      <Text style={styles.metadataText}>
                        {camera.armed ? "Armed" : "Disarmed"}
                      </Text>
                      <Text style={styles.metadataText}>
                        {camera.recording ? "Recording" : "Standby"}
                      </Text>
                    </View>
                    <View style={styles.actions}>
                      <DeepAction
                        label={playLabel}
                        icon={isLive ? "stop-outline" : "play-outline"}
                        onPress={() => toggleLive(camera.id)}
                        disabled={!canStart && !isLive}
                        primary
                      />
                      <DeepAction
                        label="Expand"
                        icon="expand-outline"
                        accessibilityLabel={`Open ${camera.name} camera`}
                        onPress={() =>
                          navigation.navigate("CameraViewer", {
                            deviceId: camera.id,
                          })
                        }
                      />
                    </View>
                  </DeepCard>
                );
              })}
              {!cameras.length ? (
                <DeepCard style={styles.empty}>
                  <Ionicons
                    name="videocam-outline"
                    size={32}
                    color={theme.colors.accentText}
                  />
                  <Text style={styles.cameraName}>
                    {cameraDevices.length
                      ? "No matching cameras"
                      : "No cameras yet"}
                  </Text>
                  <Text style={styles.room}>
                    {cameraDevices.length
                      ? "Choose another view to see your cameras."
                      : "Add a camera device to view a live overview."}
                  </Text>
                </DeepCard>
              ) : null}
            </View>
            <DeepPager
              page={currentPage}
              pageCount={pageCount}
              onChange={changePage}
              label="cameras"
            />
          </>
        )}
      </DeepScreen>
    </RenderProfiler>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryNumber: { color: theme.colors.text, fontSize: 26, fontWeight: "500" },
  summaryLabel: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "500",
  },
  recording: { flexDirection: "row", alignItems: "center", gap: 7 },
  notice: { color: theme.colors.subtext, fontSize: 12, lineHeight: 17 },
  grid: { flex: 1, minHeight: 0, gap: 14 },
  gridTablet: { flexDirection: "row" },
  cameraCard: { flex: 1, minHeight: 0, gap: 12, padding: 16 },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitleWrap: { flex: 1, gap: 4 },
  controls: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: theme.colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraName: { color: theme.colors.text, fontSize: 18, fontWeight: "500" },
  room: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  status: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.muted,
  },
  statusDotOnline: { backgroundColor: theme.colors.accentText },
  statusText: { color: theme.colors.subtext, fontSize: 11 },
  preview: {
    flex: 1,
    minHeight: 64,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: theme.colors.bg0,
  },
  snapshotTitle: { fontWeight: "500" },
  snapshotSubtitle: { fontWeight: "400" },
  metadata: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  metadataText: { color: theme.colors.muted, fontSize: 11 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
});
