import React from "react";
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Pressable from "./Pressable";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../theme/theme";
import { useResponsive } from "../theme/layout";

export type ModeKey = "cold" | "fan" | "dry";

const MODES: Array<{
  key: ModeKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: "cold", label: "Cold", icon: "thermometer" },
  { key: "fan", label: "Fan", icon: "aperture" },
  { key: "dry", label: "Dry", icon: "water" },
];

export default function ModeTiles({
  value,
  onChange,
  maxWidth,
  columns = 3,
}: {
  value: ModeKey;
  onChange: (m: ModeKey) => void;
  maxWidth?: number;
  columns?: number;
}) {
  const { isTablet, isLandscape, scale } = useResponsive();
  const baseTileSize = Math.round(
    (isTablet ? (isLandscape ? 104 : 112) : 92) * scale,
  );
  const gap = Math.round((isTablet ? 16 : 14) * scale);
  const paddingHorizontal = 6;
  const maxTileSize =
    maxWidth && columns > 0
      ? Math.floor(
          (maxWidth - paddingHorizontal * 2 - gap * (columns - 1)) / columns,
        )
      : undefined;
  const tileSize = Math.max(
    0,
    Math.min(baseTileSize, maxTileSize ?? baseTileSize),
  );
  const tileRadius = Math.round(tileSize * 0.24);
  const iconBubble = Math.round(tileSize * 0.48);
  const iconBubbleRadius = Math.round(iconBubble / 2);
  const iconSize = Math.round((isTablet ? 22 : 20) * scale);
  const textSize = Math.round((isTablet ? 13 : 12) * scale);
  const modesStyle: StyleProp<ViewStyle> = [
    styles.modes,
    { gap },
    maxWidth ? { width: maxWidth, alignSelf: "flex-start" } : null,
  ];
  const modeTileStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.modeTile,
    { width: tileSize, height: tileSize, borderRadius: tileRadius },
    active && styles.modeTileActive,
  ];
  const iconBubbleStyle: StyleProp<ViewStyle> = [
    styles.iconBubble,
    {
      width: iconBubble,
      height: iconBubble,
      borderRadius: iconBubbleRadius,
    },
  ];
  const iconBubbleActiveStyle: StyleProp<ViewStyle> = [
    styles.iconBubbleActive,
    {
      width: iconBubble,
      height: iconBubble,
      borderRadius: iconBubbleRadius,
    },
  ];
  const modeTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.modeText,
    { fontSize: textSize },
    active && styles.modeTextActive,
  ];
  return (
    <View style={modesStyle}>
      {MODES.map((m) => {
        const active = value === m.key;
        return (
          <Pressable
            key={m.key}
            style={modeTileStyle(active)}
            onPress={() => onChange(m.key)}
          >
            {active ? (
              <LinearGradient
                colors={[theme.colors.accent2, theme.colors.bg1]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={iconBubbleActiveStyle}
              >
                <Ionicons name={m.icon} size={iconSize} color="#FFFFFF" />
              </LinearGradient>
            ) : (
              <View style={iconBubbleStyle}>
                <Ionicons
                  name={m.icon}
                  size={iconSize}
                  color={theme.colors.subtext}
                />
              </View>
            )}
            <Text style={modeTextStyle(active)}>
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  modes: {
    flexDirection: "row",
    gap: 14,
    marginTop: 22,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  modeTile: {
    width: 92,
    height: 92,
    borderRadius: 22,
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  modeTileActive: {
    backgroundColor: theme.colors.card2,
    borderColor: theme.colors.accent2,
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBubbleActive: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  modeText: { color: theme.colors.subtext, fontWeight: "700", fontSize: 12 },
  modeTextActive: { color: theme.colors.text },
});
