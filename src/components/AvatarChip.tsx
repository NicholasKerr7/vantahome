import React, { useMemo } from "react";
import { Text, StyleSheet, Image, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../theme/theme";

function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "VH";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? (parts[1][0] ?? "") : "";
  return `${first}${second}`.toUpperCase();
}

export default function AvatarChip({
  name,
  size = 38,
  color,
  uri,
  style,
}: {
  name: string;
  size?: number;
  color?: string;
  uri?: string;
  style?: ViewStyle;
}) {
  const initials = useMemo(() => initialsFrom(name), [name]);
  const tint = color ?? theme.colors.accent2;
  const innerSize = Math.max(10, size - 4);

  return (
    <LinearGradient
      colors={[tint, "rgba(255,255,255,0.28)"]}
      start={{ x: 0.1, y: 0.1 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={{
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
          }}
        />
      ) : (
        <Text style={[styles.text, { fontSize: Math.max(12, size * 0.38) }]}>
          {initials}
        </Text>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.40)",
    shadowColor: "rgba(180,107,255,0.45)",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  text: { color: "#FFFFFF", fontWeight: "900", letterSpacing: -0.4 },
});
