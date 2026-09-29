import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { DeepAction, DeepCard } from "../../components/deep/DeepScreen";
import { theme } from "../../theme/theme";

/** Present protected-camera states without mounting private thumbnails or streams. */
export function CameraAccessState({
  checking,
  allowed,
  onRetry,
}: {
  checking: boolean;
  allowed: boolean;
  onRetry: () => void;
}) {
  return (
    <View style={styles.center}>
      <DeepCard style={styles.card}>
        <View style={styles.icon}>
          <Ionicons
            name={checking ? "scan-outline" : "lock-closed-outline"}
            size={28}
            color={theme.colors.accentText}
          />
        </View>
        <Text style={styles.title}>
          {checking
            ? "Confirming camera access"
            : allowed
              ? "Camera access locked"
              : "Camera access unavailable"}
        </Text>
        <Text style={styles.description}>
          {checking
            ? "Complete the protected authentication prompt."
            : allowed
              ? "Authenticate again to view private camera content."
              : "Your household role does not include live camera access."}
        </Text>
        {!checking && allowed ? (
          <DeepAction
            label="Try again"
            icon="scan-outline"
            onPress={onRetry}
            primary
          />
        ) : null}
      </DeepCard>
    </View>
  );
}

/** Format the last reported camera presence without implying a live connection. */
export function formatCameraLastSeen(timestamp?: number) {
  if (!timestamp) return "";
  const minutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    width: "100%",
    maxWidth: 460,
    alignItems: "center",
    gap: 16,
    padding: 24,
  },
  icon: {
    width: 60,
    height: 60,
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  description: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
});
