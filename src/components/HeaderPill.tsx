import React from "react";
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Pressable from "./Pressable";
import { theme } from "../theme/theme";

type HeaderPillProps = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
  iconColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export default function HeaderPill({
  label,
  icon,
  iconSize = 14,
  iconColor,
  onPress,
  style,
  textStyle,
}: HeaderPillProps) {
  const content = (
    <>
      {icon ? (
        <Ionicons
          name={icon}
          size={iconSize}
          color={iconColor ?? theme.colors.text}
        />
      ) : null}
      <Text style={[styles.label, textStyle]}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={[styles.base, style]}>
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.base, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  base: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { color: theme.colors.text, fontWeight: "800" },
});
