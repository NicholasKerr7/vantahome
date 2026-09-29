import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Pressable from "../../components/Pressable";
import { theme } from "../../theme/theme";

type Props = {
  label: string;
  value: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
};

/** Give each camera setting a full touch target and an explicit accessible on/off state. */
export default function CameraControlRow({
  label,
  value,
  icon,
  onPress,
  disabled = false,
}: Props) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, disabled && styles.disabled]}
    >
      <View style={styles.icon}>
        <Ionicons name={icon} size={20} color={theme.colors.accentText} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.state}>{value ? "On" : "Off"}</Text>
      <View style={[styles.track, value && styles.trackActive]}>
        <View style={[styles.thumb, value && styles.thumbActive]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  disabled: { opacity: 0.45 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "500",
  },
  state: { color: theme.colors.subtext, fontSize: 11 },
  track: {
    width: 36,
    height: 22,
    borderRadius: 11,
    padding: 3,
    justifyContent: "center",
    backgroundColor: theme.colors.card,
  },
  trackActive: { backgroundColor: theme.colors.accent },
  thumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.subtext,
  },
  thumbActive: { alignSelf: "flex-end", backgroundColor: theme.colors.bg0 },
});
