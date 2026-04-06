import React from "react";
import { Text, StyleSheet, type TextProps } from "react-native";

type Props = TextProps & {
  lines?: number;
};

export default function ButtonLabel({
  style,
  lines = 1,
  allowFontScaling = false,
  maxFontSizeMultiplier = 1.05,
  children,
  ...props
}: Props) {
  return (
    <Text
      {...props}
      allowFontScaling={allowFontScaling}
      ellipsizeMode="tail"
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      numberOfLines={lines}
      style={[styles.label, style]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    maxWidth: "100%",
    flexShrink: 1,
    textAlign: "center",
    includeFontPadding: false,
  },
});
