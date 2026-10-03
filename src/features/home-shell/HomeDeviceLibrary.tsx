import React, { useMemo, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { DeviceControlsSheet } from "../three-d-home/DeviceControlsSheet";
import { useDecorativeMotion } from "../../components/useDecorativeMotion";
import { useSimulationControls } from "../three-d-home/useSimulationControls";
import {
  guardModelDeviceControls,
} from "../three-d-home/modelDeviceControls";
import { useHomeStore } from "../../store/useHomeStore";
import { resolveModelSceneAccess, selectModelLibraryDeviceIds } from "../three-d-home/modelSceneAccess";
import Pressable from "../../components/Pressable";
import { theme } from "../../theme/theme";

/** Keep all modeled devices controllable even if graphics fail to initialize. */
export default function HomeDeviceLibrary({
  onClose,
}: {
  onClose: () => void;
}) {
  const allowed = useHomeStore((state) => resolveModelSceneAccess(state).roomIds.length > 0);
  const libraryIds = useHomeStore(useShallow(selectModelLibraryDeviceIds));
  const snapshot = useSimulationControls(allowed);
  const client = useMemo(
    () => guardModelDeviceControls(snapshot.client),
    [snapshot.client],
  );
  const allowedDeviceIds = allowed ? libraryIds.filter((id) => snapshot.access?.deviceIds.includes(id)) : [];
  const motionAllowed = useDecorativeMotion(true);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  if (!allowed)
    return (
      <Modal transparent visible animationType="none" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View accessibilityViewIsModal style={styles.unavailable}>
            <Text accessibilityRole="header" style={styles.title}>
              Device library unavailable
            </Text>
            <Text style={styles.detail}>
              No 3D devices are available for your assigned rooms. Your homeowner
              can review room access and model connections.
            </Text>
            <Pressable onPress={onClose} style={styles.button}>
              <Text style={styles.label}>Back to home</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  return (
    <DeviceControlsSheet
      deviceId={deviceId}
      client={client}
      snapshot={snapshot}
      allowedDeviceIds={allowedDeviceIds}
      motionAllowed={motionAllowed}
      onClose={onClose}
      onSelect={(id) => {
        if (selectModelLibraryDeviceIds(useHomeStore.getState()).includes(id)) setDeviceId(id);
      }}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: theme.colors.overlayStrong,
  },
  unavailable: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    padding: 22,
    gap: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bg0,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: "500" },
  detail: { color: theme.colors.subtext, fontSize: 14, lineHeight: 21 },
  button: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.card2,
  },
  label: { color: theme.colors.accentText, fontSize: 14, fontWeight: "600" },
});
