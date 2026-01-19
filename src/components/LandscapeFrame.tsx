import React from "react";
import {
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type DimensionValue,
} from "react-native";

type Props = {
  enabled?: boolean;
  width?: DimensionValue;
  pad?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export default function LandscapeFrame({
  enabled,
  width,
  pad = 12,
  radius = 26,
  style,
  children,
}: Props) {
  if (!enabled) return <>{children}</>;

  const bottomPad = pad > 0 ? pad : 12;
  const frameStyle: StyleProp<ViewStyle> = [
    styles.frame,
    width ? { width, alignSelf: "center" } : null,
    { padding: pad, paddingBottom: bottomPad, borderRadius: radius },
    style,
  ];

  return <View style={frameStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
});
