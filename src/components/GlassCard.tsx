import React, { type PropsWithChildren } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { theme } from "../theme/theme";

export default function GlassCard({
  style,
  children,
}: PropsWithChildren<{
  style?: ViewStyle;
}>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    padding: 16,
  },
});
