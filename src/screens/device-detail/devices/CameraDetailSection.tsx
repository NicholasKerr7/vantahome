import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  DeepAction,
  DeepCard,
  DeepTabs,
} from "../../../components/deep/DeepScreen";
import Pressable from "../../../components/Pressable";
import LiveVideoPlayer from "../../../components/LiveVideoPlayer";
import CameraThumbnail from "../../../components/CameraThumbnail";
import CameraControlRow from "../../../features/cameras/CameraControlRow";
import CameraPeoplePanel, {
  type CameraDetection,
} from "../../../features/cameras/CameraPeoplePanel";
import {
  CameraAccessState,
  formatCameraLastSeen,
} from "../../../features/cameras/CameraAccessState";
import {
  selectActiveMember,
  useHomeStore,
  type Device,
  type HouseholdMember,
} from "../../../store/useHomeStore";
import { roleHasPermission } from "../../../security/permissions";
import { useProtectedAccess } from "../../../security/useProtectedAccess";
import { useResponsive } from "../../../theme/layout";
import { theme } from "../../../theme/theme";

type CameraTab = "watch" | "protection" | "people" | "entry";
type Props = {
  device: Device;
  household: readonly HouseholdMember[];
  gate?: Device;
  events: readonly CameraDetection[];
  onPatch: (patch: Partial<Device>) => void;
  onKnownFace: (id: string, name: string) => void;
  onUnknownFace: () => void;
  onPresence: (id: string, status: "home" | "away") => void;
  onOpenGate: () => void;
  onCloseGate: () => void;
  onToggleGateAutoOpen: () => void;
  onExpand: () => void;
};
const TABS = [
  { id: "watch", label: "Watch", icon: "videocam-outline" },
  { id: "protection", label: "Protection", icon: "shield-checkmark-outline" },
  { id: "people", label: "People", icon: "people-outline" },
] as const;
const SENSITIVITY = [
  { label: "Low", value: 3 },
  { label: "Medium", value: 6 },
  { label: "High", value: 9 },
] as const;

/** Present full camera controls as bounded workspaces while retaining the existing command callbacks. */
export default function CameraDetailSection({
  device,
  household,
  gate,
  events,
  onPatch,
  onKnownFace,
  onUnknownFace,
  onPresence,
  onOpenGate,
  onCloseGate,
  onToggleGateAutoOpen,
  onExpand,
}: Props) {
  const [tab, setTab] = useState<CameraTab>("watch");
  const { isTablet, isLandscape } = useResponsive();
  const wide = isTablet && isLandscape;
  const activeMember = useHomeStore(selectActiveMember);
  const allOverrides = useHomeStore((state) => state.memberPermissionOverrides);
  const overrides = useMemo(
    () => allOverrides.filter((item) => item.memberId === activeMember?.id),
    [allOverrides, activeMember?.id],
  );
  const canView = Boolean(
    activeMember &&
    roleHasPermission(activeMember.role, "device.view", overrides) &&
    roleHasPermission(activeMember.role, "camera.live", overrides),
  );
  const canManage = Boolean(
    activeMember &&
    roleHasPermission(activeMember.role, "camera.manage", overrides),
  );
  const canOpenGate = Boolean(
    activeMember &&
    roleHasPermission(activeMember.role, "garage.open", overrides),
  );
  const canCloseGate = Boolean(
    activeMember &&
    roleHasPermission(activeMember.role, "device.control", overrides),
  );
  const access = useProtectedAccess("Confirm access to this camera", canView);
  const streamUrl = device.isOn ? device.streamUrl : undefined;
  const thumbnailUrl = device.thumbnailUrl ?? device.lastThumbnailUrl;
  const sensitivity = Math.max(1, Math.min(10, device.motionSensitivity ?? 6));
  const lastSeen = formatCameraLastSeen(device.lastSeenAt);
  const tabs = gate
    ? [...TABS, { id: "entry", label: "Entry", icon: "key-outline" } as const]
    : TABS;
  const selectedTab = tab === "entry" && !gate ? "watch" : tab;

  if (!canView || access.state !== "granted")
    return (
      <CameraAccessState
        checking={canView && access.state === "checking"}
        allowed={canView}
        onRetry={() => void access.retry()}
      />
    );

  return (
    <View testID="camera-control-workspace" style={styles.root}>
      <DeepTabs items={tabs} selectedId={selectedTab} onSelect={setTab} />
      {!canManage ? (
        <Text style={styles.readOnly}>
          Camera settings are managed by your household owner.
        </Text>
      ) : null}
      {selectedTab === "watch" ? (
        <View style={[styles.watch, wide && styles.watchWide]}>
          <DeepCard style={styles.feedCard}>
            <View style={styles.feedHeading}>
              <View style={styles.feedStatus}>
                <View style={[styles.dot, streamUrl && styles.dotLive]} />
                <Text style={styles.statusLabel}>
                  {streamUrl
                    ? "Live view"
                    : device.isOn
                      ? "Camera online"
                      : "Camera offline"}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Expand camera view"
                onPress={onExpand}
                style={styles.expand}
              >
                <Ionicons
                  name="expand-outline"
                  size={19}
                  color={theme.colors.accentText}
                />
              </Pressable>
            </View>
            <View style={styles.feed}>
              {streamUrl ? (
                <LiveVideoPlayer
                  sourceUri={streamUrl}
                  enableFullscreen={false}
                  onFullscreen={onExpand}
                  contentFit="contain"
                />
              ) : (
                <CameraThumbnail
                  uri={thumbnailUrl}
                  title={
                    !device.isOn
                      ? "Camera offline"
                      : thumbnailUrl
                        ? "Last snapshot"
                        : "No snapshot yet"
                  }
                  subtitle={
                    device.isOn
                      ? "Live feed is not configured"
                      : lastSeen
                        ? `Last seen ${lastSeen}`
                        : "Turn on the camera to connect"
                  }
                  titleStyle={styles.thumbnailTitle}
                  subtitleStyle={styles.thumbnailSubtitle}
                />
              )}
            </View>
          </DeepCard>
          <DeepCard style={[styles.quickCard, wide && styles.quickCardWide]}>
            <Text style={styles.cardTitle}>Camera controls</Text>
            <CameraControlRow
              label="Camera power"
              icon="power-outline"
              value={Boolean(device.isOn)}
              onPress={() => onPatch({ isOn: !device.isOn })}
              disabled={!canManage}
            />
            <CameraControlRow
              label="Armed"
              icon="shield-checkmark-outline"
              value={Boolean(device.armed)}
              onPress={() => onPatch({ armed: !device.armed })}
              disabled={!canManage}
            />
            <CameraControlRow
              label="Recording"
              icon="radio-button-on-outline"
              value={Boolean(device.recording)}
              onPress={() => onPatch({ recording: !device.recording })}
              disabled={!canManage}
            />
          </DeepCard>
        </View>
      ) : selectedTab === "protection" ? (
        <View style={[styles.protection, wide && styles.protectionWide]}>
          <DeepCard
            style={[styles.settingsCard, wide && styles.settingsCardWide]}
          >
            <Text style={styles.cardTitle}>Detection & privacy</Text>
            <CameraControlRow
              label="Night vision"
              icon="moon-outline"
              value={device.nightVision ?? false}
              onPress={() =>
                onPatch({ nightVision: !(device.nightVision ?? false) })
              }
              disabled={!canManage}
            />
            <CameraControlRow
              label="Motion alerts"
              icon="notifications-outline"
              value={device.motionAlerts ?? true}
              onPress={() =>
                onPatch({ motionAlerts: !(device.motionAlerts ?? true) })
              }
              disabled={!canManage}
            />
            <CameraControlRow
              label="Microphone muted"
              icon="mic-off-outline"
              value={device.micMuted ?? false}
              onPress={() => onPatch({ micMuted: !(device.micMuted ?? false) })}
              disabled={!canManage}
            />
            <CameraControlRow
              label="Two-way audio"
              icon="chatbubble-ellipses-outline"
              value={device.twoWayAudio ?? true}
              onPress={() =>
                onPatch({ twoWayAudio: !(device.twoWayAudio ?? true) })
              }
              disabled={!canManage}
            />
          </DeepCard>
          <DeepCard
            style={[styles.settingsCard, wide && styles.settingsCardWide]}
          >
            <View style={styles.sensitivityHeading}>
              <Text style={styles.cardTitle}>Motion sensitivity</Text>
              <Text style={styles.caption}>{sensitivity} / 10</Text>
            </View>
            <View style={styles.sensitivityOptions}>
              {SENSITIVITY.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.label} motion sensitivity`}
                  accessibilityState={{
                    checked: sensitivity === option.value,
                    disabled: !canManage,
                  }}
                  aria-checked={sensitivity === option.value}
                  disabled={!canManage}
                  onPress={() => onPatch({ motionSensitivity: option.value })}
                  style={[
                    styles.sensitivityOption,
                    sensitivity === option.value && styles.sensitivitySelected,
                    !canManage && styles.disabled,
                  ]}
                >
                  <Text style={styles.optionText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </DeepCard>
        </View>
      ) : selectedTab === "people" ? (
        <CameraPeoplePanel
          household={household}
          events={events}
          onKnownFace={onKnownFace}
          onUnknownFace={onUnknownFace}
          onPresence={onPresence}
          disabled={!canManage}
        />
      ) : gate ? (
        <View style={styles.entry}>
          <DeepCard style={styles.gateCard}>
            <View style={styles.gateIcon}>
              <Ionicons
                name="key-outline"
                size={30}
                color={theme.colors.accentText}
              />
            </View>
            <Text style={styles.gateTitle}>{gate.name}</Text>
            <Text style={styles.gateState}>
              {(gate.openPercent ?? 0) > 20 ? "Open" : "Closed"}
            </Text>
            <View style={styles.gateActions}>
              <DeepAction
                label="Open gate"
                icon="lock-open-outline"
                onPress={onOpenGate}
                primary
                disabled={!canOpenGate}
              />
              <DeepAction
                label="Close gate"
                icon="lock-closed-outline"
                onPress={onCloseGate}
                disabled={!canCloseGate}
              />
            </View>
          </DeepCard>
          <DeepCard style={styles.settingsCard}>
            <CameraControlRow
              label="Auto-open for known faces"
              icon="scan-outline"
              value={gate.autoOpenEnabled ?? false}
              onPress={onToggleGateAutoOpen}
              disabled={gate.autoOpenEnabled ? !canCloseGate : !canOpenGate}
            />
            <Text style={styles.caption}>
              A known-face report can open this gate when auto-open is enabled.
            </Text>
          </DeepCard>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, gap: 12, paddingTop: 12 },
  readOnly: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16 },
  watch: { flex: 1, minHeight: 0, gap: 12 },
  watchWide: { flexDirection: "row" },
  feedCard: { flex: 1, minHeight: 100, padding: 12, gap: 8 },
  feedHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  feedStatus: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.muted,
  },
  dotLive: { backgroundColor: theme.colors.accentText },
  statusLabel: { color: theme.colors.subtext, fontSize: 12, fontWeight: "500" },
  expand: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  feed: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: theme.colors.bg0,
  },
  thumbnailTitle: { fontSize: 14, fontWeight: "500" },
  thumbnailSubtitle: { fontSize: 12, fontWeight: "400" },
  quickCard: { padding: 16, gap: 2 },
  quickCardWide: { flex: 0.65, justifyContent: "center" },
  cardTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "500" },
  protection: { flex: 1, minHeight: 0, gap: 12 },
  protectionWide: { flexDirection: "row" },
  settingsCard: { padding: 16, gap: 6 },
  settingsCardWide: { flex: 1, justifyContent: "center" },
  sensitivityHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  sensitivityOptions: { flexDirection: "row", gap: 8, marginTop: 6 },
  sensitivityOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.card2,
    alignItems: "center",
    justifyContent: "center",
  },
  sensitivitySelected: {
    backgroundColor: theme.colors.bg1,
    borderColor: theme.colors.accent,
  },
  optionText: { color: theme.colors.text, fontSize: 12, fontWeight: "500" },
  disabled: { opacity: 0.45 },
  caption: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  entry: { flex: 1, minHeight: 0, gap: 12 },
  gateCard: {
    flex: 1,
    minHeight: 160,
    padding: 20,
    gap: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  gateIcon: {
    width: 64,
    height: 64,
    borderRadius: 23,
    backgroundColor: theme.colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  gateTitle: { color: theme.colors.text, fontSize: 19, fontWeight: "500" },
  gateState: {
    color: theme.colors.accentText,
    fontSize: 28,
    fontWeight: "500",
  },
  gateActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
});
