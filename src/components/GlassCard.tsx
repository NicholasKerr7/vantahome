import React, { type PropsWithChildren } from "react";
import {
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { theme } from "../theme/theme";

export default function GlassCard({
  style,
  children,
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>) {
  const cardStyle = (input?: StyleProp<ViewStyle>): StyleProp<ViewStyle> => [
    styles.card,
    input,
  ];

  return <View style={cardStyle(style)}>{children}</View>;
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
