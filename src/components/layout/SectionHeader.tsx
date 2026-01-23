import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  rightStyle?: StyleProp<ViewStyle>;
};

export default function SectionHeader({
  title,
  subtitle,
  right,
  style,
  titleStyle,
  subtitleStyle,
  rightStyle,
}: SectionHeaderProps) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.textWrap}>
        <Text style={[styles.title, titleStyle]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text>
        ) : null}
      </View>
      {right ? <View style={rightStyle}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  textWrap: { flexShrink: 1 },
  title: { fontWeight: "900" },
  subtitle: { marginTop: 4, fontWeight: "700" },
});
